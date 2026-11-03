import fs from 'fs';
import path from 'path';

const TOKEN = process.env.GITHUB_TOKEN || '';
const OWNER = 'jananimohan-04';
const REPO = 'with_cnc';
const TAG = 'v1.0.4';
const VERSION = '1.0.4';

const headers = {
  'Authorization': `token ${TOKEN}`,
  'User-Agent': 'Business-Intelligence-Publisher',
  'Accept': 'application/vnd.github.v3+json',
};

async function main() {
  console.log(`Checking existing release for tag ${TAG}...`);
  let releaseRes = await fetch(`https://api.github.com/repos/${OWNER}/${REPO}/releases/tags/${TAG}`, { headers });
  let release;

  if (releaseRes.status === 200) {
    release = await releaseRes.json();
    console.log(`Existing release found: ${release.id} (${release.html_url})`);
  } else {
    console.log(`Creating release for ${TAG}...`);
    const createRes = await fetch(`https://api.github.com/repos/${OWNER}/${REPO}/releases`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tag_name: TAG,
        target_commitish: 'main',
        name: `Business Intelligence v${VERSION}`,
        body: `## Business Intelligence v${VERSION}\n\n- Multi-format invoice numbering & auto-generation per company\n- Full system rebrand to Business Intelligence with Powered by ARGUS CNC subtext\n- Cryptographically signed desktop installer with instant auto-update support`,
        draft: false,
        prerelease: false,
      }),
    });

    if (!createRes.ok) {
      const errText = await createRes.text();
      throw new Error(`Failed to create release: ${createRes.status} ${errText}`);
    }

    release = await createRes.json();
    console.log(`Created release: ${release.id} (${release.html_url})`);
  }

  // Ensure release is published (not draft)
  if (release.draft) {
    console.log('Publishing draft release...');
    const pubRes = await fetch(`https://api.github.com/repos/${OWNER}/${REPO}/releases/${release.id}`, {
      method: 'PATCH',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ draft: false, make_latest: 'true' }),
    });
    release = await pubRes.json();
  }

  // List existing assets to avoid re-upload errors
  console.log('Fetching assets for release...');
  const assetsRes = await fetch(`https://api.github.com/repos/${OWNER}/${REPO}/releases/${release.id}/assets`, { headers });
  const existingAssets = await assetsRes.json();
  const existingMap = new Map(existingAssets.map(a => [a.name, a.id]));

  async function uploadAsset(assetName, buffer, contentType = 'application/octet-stream') {
    if (existingMap.has(assetName)) {
      console.log(`Deleting old asset ${assetName} (id: ${existingMap.get(assetName)})...`);
      await fetch(`https://api.github.com/repos/${OWNER}/${REPO}/releases/assets/${existingMap.get(assetName)}`, {
        method: 'DELETE',
        headers,
      });
    }

    console.log(`Uploading asset ${assetName} (${(buffer.length / 1024 / 1024).toFixed(2)} MB)...`);
    const uploadUrl = `https://uploads.github.com/repos/${OWNER}/${REPO}/releases/${release.id}/assets?name=${encodeURIComponent(assetName)}`;
    const uploadRes = await fetch(uploadUrl, {
      method: 'POST',
      headers: {
        ...headers,
        'Content-Type': contentType,
        'Content-Length': String(buffer.length),
      },
      body: buffer,
    });

    if (!uploadRes.ok) {
      const err = await uploadRes.text();
      throw new Error(`Failed to upload ${assetName}: ${uploadRes.status} ${err}`);
    }
    const uploaded = await uploadRes.json();
    console.log(`Uploaded ${assetName} successfully -> ${uploaded.browser_download_url}`);
    return uploaded.browser_download_url;
  }

  // Read installer & signature
  const installerPath = fs.existsSync(path.resolve('public/downloads/business-intelligence-setup.exe'))
    ? path.resolve('public/downloads/business-intelligence-setup.exe')
    : path.resolve('public/downloads/cncforge-erp-setup.exe');
  const sigPath = fs.existsSync(path.resolve('public/downloads/business-intelligence-setup.exe.sig'))
    ? path.resolve('public/downloads/business-intelligence-setup.exe.sig')
    : path.resolve('public/downloads/cncforge-erp-setup.exe.sig');

  if (!fs.existsSync(installerPath) || !fs.existsSync(sigPath)) {
    throw new Error('Installer or signature not found!');
  }

  const installerBuf = fs.readFileSync(installerPath);
  const sigText = fs.readFileSync(sigPath, 'utf8').trim();

  // Upload installer as both filenames so older and newer links work
  const installerUrl = await uploadAsset('business-intelligence-setup.exe', installerBuf, 'application/vnd.microsoft.portable-executable');
  await uploadAsset('cncforge-erp-setup.exe', installerBuf, 'application/vnd.microsoft.portable-executable');
  await uploadAsset(`Business Intelligence_${VERSION}_x64-setup.exe`, installerBuf, 'application/vnd.microsoft.portable-executable');

  // Upload .sig
  await uploadAsset('business-intelligence-setup.exe.sig', Buffer.from(sigText, 'utf8'), 'text/plain');
  await uploadAsset('cncforge-erp-setup.exe.sig', Buffer.from(sigText, 'utf8'), 'text/plain');
  await uploadAsset(`Business Intelligence_${VERSION}_x64-setup.exe.sig`, Buffer.from(sigText, 'utf8'), 'text/plain');

  // Generate latest.json
  const latestJson = {
    version: VERSION,
    notes: `Business Intelligence v${VERSION} update: Multi-format invoice numbering & full Business Intelligence rebranding.`,
    pub_date: new Date().toISOString(),
    platforms: {
      'windows-x86_64': {
        signature: sigText,
        url: installerUrl,
      },
    },
  };

  const latestJsonBuf = Buffer.from(JSON.stringify(latestJson, null, 2), 'utf8');

  // Also save to public/downloads/latest.json so web deployment serves it too
  fs.writeFileSync(path.resolve('public/downloads/latest.json'), latestJsonBuf);
  console.log('Saved latest.json to public/downloads/latest.json');

  // Upload latest.json to GitHub release
  await uploadAsset('latest.json', latestJsonBuf, 'application/json');

  console.log('\nAll release assets published successfully!');
  console.log('Testing GitHub latest.json direct download...');
  const testRes = await fetch(`https://github.com/${OWNER}/${REPO}/releases/latest/download/latest.json`);
  console.log('HTTP Status:', testRes.status, testRes.statusText);
  if (testRes.ok) {
    const text = await testRes.text();
    console.log('latest.json content:\n', text);
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
