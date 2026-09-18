param([string]$Url)

$logDir = "$env:USERPROFILE\.cncvault"
if (!(Test-Path $logDir)) { New-Item -ItemType Directory -Path $logDir -Force | Out-Null }
$logFile = "$logDir\launcher.log"

function Log($msg) {
    try { "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') $msg" | Out-File $logFile -Append } catch {}
}

Log "=== Launcher triggered with URL: $Url ==="

try {
    if ([string]::IsNullOrWhiteSpace($Url)) {
        Log "No URL provided."
        exit
    }

    Add-Type -AssemblyName System.Windows.Forms

    $fileName = $null
    $expectedPath = $null
    $documentNumber = $null
    $versionNumber = $null
    $downloadUrl = $null
    $authToken = $null

    # 1. Extract base64 payload if present
    $b64 = $null
    if ($Url -match 'b64payload=([^&]+)') {
        $b64 = $matches[1]
    } elseif ($Url -match 'b64path=([^&]+)') {
        $b64 = $matches[1]
    }

    if (![string]::IsNullOrWhiteSpace($b64)) {
        # Clean URL-safe base64 characters, unescape, and trim slashes/quotes
        $cleanB64 = [System.Uri]::UnescapeDataString($b64).Trim().TrimEnd('/').Trim('"')
        $cleanB64 = $cleanB64.Replace('-', '+').Replace('_', '/').Replace(' ', '+')
        $pad = 4 - ($cleanB64.Length % 4)
        if ($pad -gt 0 -and $pad -lt 4) {
            $cleanB64 = $cleanB64 + ('=' * $pad)
        }

        try {
            $bytes = [System.Convert]::FromBase64String($cleanB64)
            $decoded = [System.Text.Encoding]::UTF8.GetString($bytes)
            Log "Decoded payload: $decoded"

            # Parse JSON if applicable
            if ($decoded.Trim().StartsWith("{") -and $decoded.Trim().EndsWith("}")) {
                try {
                    $json = $decoded | ConvertFrom-Json
                    $fileName = $json.fileName
                    $expectedPath = $json.fullPath
                    $documentNumber = $json.documentNumber
                    $versionNumber = $json.versionNumber
                    $downloadUrl = $json.downloadUrl
                    $authToken = $json.authToken
                } catch {
                    Log "JSON parse warning: $_"
                }
            }

            if (!$fileName) {
                if ($decoded -match 'filename=(.+)$') {
                    $fileName = $matches[1].Trim()
                } elseif ($decoded -match '\\([^\\]+)$') {
                    $fileName = $matches[1].Trim()
                    $expectedPath = $decoded.Trim()
                } else {
                    $fileName = $decoded.Trim()
                }
            }
        } catch {
            Log "Base64 decode warning: $_"
        }
    }

    # 2. Direct query parameter fallback
    if (!$fileName) {
        if ($Url -match '[?&]fileName=([^&]+)') {
            $fileName = [System.Uri]::UnescapeDataString($matches[1])
        }
        if ($Url -match '[?&]downloadUrl=([^&]+)') {
            $downloadUrl = [System.Uri]::UnescapeDataString($matches[1])
        }
    }

    Log "Parsed: fileName='$fileName', expectedPath='$expectedPath', downloadUrl='$downloadUrl'"

    if ([string]::IsNullOrWhiteSpace($fileName) -and [string]::IsNullOrWhiteSpace($expectedPath)) {
        Log "Could not determine file name to open."
        [System.Windows.Forms.MessageBox]::Show("CNC Vault Launcher could not read the document name from the link.", "CNC Vault - Notice", [System.Windows.Forms.MessageBoxButtons]::OK, [System.Windows.Forms.MessageBoxIcon]::Warning, [System.Windows.Forms.MessageBoxDefaultButton]::Button1, [System.Windows.Forms.MessageBoxOptions]::DefaultDesktopOnly)
        exit
    }

    function Launch-File($filePath) {
        $ext = [System.IO.Path]::GetExtension($filePath).ToLower()
        $imageExts = @('.png', '.jpg', '.jpeg', '.bmp', '.gif', '.webp', '.ico', '.tiff', '.tif')

        $docFolder = if (![string]::IsNullOrWhiteSpace($documentNumber)) { $documentNumber } else { "general" }
        $verFolder = if (![string]::IsNullOrWhiteSpace($versionNumber)) { "V$versionNumber" } else { "V1" }
        $cacheDir = "$env:USERPROFILE\.cncvault\cache\$docFolder\$verFolder"

        # Modern Windows Photos app (UWP) crashes with 0xc0000142 when opening images from Dokan/G:\ virtual drives.
        # Copying to local NTFS cache directory ensures 100% reliable opening in Photos.exe without crash.
        if ($imageExts -contains $ext) {
            if (!(Test-Path $cacheDir)) { New-Item -ItemType Directory -Path $cacheDir -Force | Out-Null }
            $cachedCopy = "$cacheDir\$fileName"
            Log "Image file detected ($ext). Copying to local NTFS cache: $cachedCopy"
            Copy-Item -Path $filePath -Destination $cachedCopy -Force
            Start-Process -FilePath $cachedCopy
            return
        }

        # For Win32 applications (MS Word, Excel, AutoCAD, SolidWorks, Acrobat Reader):
        try {
            Log "Launching file directly: $filePath"
            Start-Process -FilePath $filePath
        } catch {
            Log "Direct launch failed: $_. Attempting fallback via local cache..."
            if (!(Test-Path $cacheDir)) { New-Item -ItemType Directory -Path $cacheDir -Force | Out-Null }
            $cachedCopy = "$cacheDir\$fileName"
            Copy-Item -Path $filePath -Destination $cachedCopy -Force
            Start-Process -FilePath $cachedCopy
        }
    }

    # Strategy 1: Check expected full path directly
    if (![string]::IsNullOrWhiteSpace($expectedPath) -and (Test-Path $expectedPath)) {
        Log "Found exact match at: $expectedPath"
        Launch-File $expectedPath
        exit
    }

    # Strategy 2: Check fallback (Shared with me <-> My Drive)
    if (![string]::IsNullOrWhiteSpace($expectedPath)) {
        $fallback = $expectedPath -replace '\\My Drive\\', '\Shared with me\'
        if (Test-Path $fallback) {
            Log "Found fallback match at: $fallback"
            Launch-File $fallback
            exit
        }
    }

    # Strategy 3: Search across all local Google Drive drives
    if (![string]::IsNullOrWhiteSpace($fileName)) {
        $foundFile = $null
        $drivesToSearch = @()

        foreach ($letter in [char[]](67..90)) { # C to Z
            $driveRoot = "$($letter):\"
            if (Test-Path $driveRoot) {
                $myDrive = "$driveRoot\My Drive"
                $sharedWithMe = "$driveRoot\Shared with me"
                if (Test-Path $myDrive) { $drivesToSearch += $myDrive }
                if (Test-Path $sharedWithMe) { $drivesToSearch += $sharedWithMe }
            }
        }

        if (Test-Path "G:\") {
            if (!($drivesToSearch -contains "G:\My Drive") -and (Test-Path "G:\My Drive")) {
                $drivesToSearch += "G:\My Drive"
            }
            $drivesToSearch += "G:\"
        }

        $drivesToSearch = $drivesToSearch | Select-Object -Unique
        Log "Scanning drives for '$fileName'..."

        foreach ($searchDir in $drivesToSearch) {
            if (Test-Path $searchDir) {
                $candidate = Get-ChildItem -Path $searchDir -Filter $fileName -Recurse -File -ErrorAction SilentlyContinue | Select-Object -First 1
                if ($candidate) {
                    $foundFile = $candidate.FullName
                    Log "Found file locally via search: $foundFile"
                    break
                }
            }
        }

        if ($foundFile) {
            Log "Launching local file: $foundFile"
            Launch-File $foundFile
            exit
        }
    }

    # Strategy 4: If not found on any local drive, auto-download from cloud
    if (![string]::IsNullOrWhiteSpace($downloadUrl)) {
        Log "File not found locally on disk. Attempting auto-download from cloud..."
        $docFolder = if (![string]::IsNullOrWhiteSpace($documentNumber)) { $documentNumber } else { "general" }
        $verFolder = if (![string]::IsNullOrWhiteSpace($versionNumber)) { "V$versionNumber" } else { "V1" }
        $cacheDir = "$env:USERPROFILE\.cncvault\cache\$docFolder\$verFolder"
        if (!(Test-Path $cacheDir)) { New-Item -ItemType Directory -Path $cacheDir -Force | Out-Null }
        $cachedFile = "$cacheDir\$fileName"

        try {
            [System.Net.ServicePointManager]::SecurityProtocol = [System.Net.SecurityProtocolType]::Tls12
            $headers = @{}
            if (![string]::IsNullOrWhiteSpace($authToken)) {
                $headers["Authorization"] = "Bearer $authToken"
            }
            Log "Downloading to: $cachedFile"
            Invoke-WebRequest -Uri $downloadUrl -Headers $headers -OutFile $cachedFile -UseBasicParsing
            if (Test-Path $cachedFile) {
                $size = (Get-Item $cachedFile).Length
                Log "Download complete ($size bytes). Launching: $cachedFile"
                Start-Process -FilePath $cachedFile
                exit
            }
        } catch {
            Log "Auto-download failed: $_"
        }
    }

    # Strategy 5: Notice if both fail
    Log "File '$fileName' could not be opened."
    $msg = "File could not be opened locally:`n`n$fileName`n`nGoogle Drive Desktop has not synced this file, and the cloud download could not be completed.`n`nTip: You can use the 'Download' or 'Preview' button directly in CNC Vault."
    [System.Windows.Forms.MessageBox]::Show($msg, "CNC Vault - Notice", [System.Windows.Forms.MessageBoxButtons]::OK, [System.Windows.Forms.MessageBoxIcon]::Information, [System.Windows.Forms.MessageBoxDefaultButton]::Button1, [System.Windows.Forms.MessageBoxOptions]::DefaultDesktopOnly)

} catch {
    Log "CRITICAL ERROR: $_`n$($_.ScriptStackTrace)"
    Add-Type -AssemblyName System.Windows.Forms
    [System.Windows.Forms.MessageBox]::Show("CNC Vault Launcher Error:`n`n$_", "CNC Vault Error", [System.Windows.Forms.MessageBoxButtons]::OK, [System.Windows.Forms.MessageBoxIcon]::Error, [System.Windows.Forms.MessageBoxDefaultButton]::Button1, [System.Windows.Forms.MessageBoxOptions]::DefaultDesktopOnly)
}
