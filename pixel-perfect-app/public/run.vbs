Set WshShell = CreateObject("WScript.Shell")
userProfile = WshShell.ExpandEnvironmentStrings("%USERPROFILE%")
ps1Path = userProfile & "\.cncvault\launcher.ps1"
argsStr = ""
For i = 0 To WScript.Arguments.Count - 1
    argsStr = argsStr & " """ & WScript.Arguments(i) & """"
Next
cmd = "powershell.exe -ExecutionPolicy Bypass -NoProfile -File """ & ps1Path & """" & argsStr
WshShell.Run cmd, 0, False
