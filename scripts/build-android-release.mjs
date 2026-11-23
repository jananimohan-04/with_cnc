// Builds the Play Store release of the Android app (a signed .aab bundle):
//   npm run android:release -- 1.1.180
// The version number is optional; without it the newest desktop version in public/downloads/latest.json is used.
// The Play Store needs a HIGHER version code for every upload: code = major * 1,000,000 + minor * 1,000 + patch
// (1.1.180 -> 1001180).
//
// Signing: the upload key lives OUTSIDE the project in  %USERPROFILE%\.android-keys\  (argus-upload.jks +
// keystore.properties). It is copied to android/keystore.properties for the build (that file is never committed).
// Keep a safe backup of that folder: without it you cannot upload updates (Google can reset an upload key, slowly).

import { execSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/(\w:)/, '$1')), '..');
const run = (cmd, cwd = root) => { console.log(`\n> ${cmd}`); execSync(cmd, { cwd, stdio: 'inherit' }); };
const mb = (n) => `${(n / 1048576).toFixed(1)} MB`;

// version
let version = process.argv[2];
if (!version) {
  try { version = JSON.parse(fs.readFileSync(path.join(root, 'public/downloads/latest.json'), 'utf8')).version; } catch { /* below */ }
}
if (!/^\d+\.\d+\.\d+$/.test(version || '')) { console.error('Give the version, e.g.  npm run android:release -- 1.1.180'); process.exit(1); }
const [maj, min, pat] = version.split('.').map(Number);
const code = maj * 1000000 + min * 1000 + pat;
console.log(`Version ${version} (code ${code})`);

// signing key
const keyDir = path.join(os.homedir(), '.android-keys');
const props = path.join(keyDir, 'keystore.properties');
if (!fs.existsSync(props)) { console.error(`Upload key not found: ${props}`); process.exit(1); }
fs.copyFileSync(props, path.join(root, 'android/keystore.properties'));

// web app without the website's download files, into the Android project
run('npx vite build');
run('node scripts/strip-dist-downloads.mjs');
run('npx cap sync android');

const androidDir = path.join(root, 'android');
const gradle = process.platform === 'win32' ? `"${path.join(androidDir, 'gradlew.bat')}"` : './gradlew';
run(`${gradle} bundleRelease assembleRelease -PappVersionCode=${code} -PappVersionName=${version}`, androidDir);

// results, with clear names, next to the share folder
const outDir = path.join(root, 'android/app/build/outputs/play-store');
fs.mkdirSync(outDir, { recursive: true });
const aab = path.join(root, 'android/app/build/outputs/bundle/release/app-release.aab');
const apk = path.join(root, 'android/app/build/outputs/apk/release/app-release.apk');
const aabOut = path.join(outDir, `Argus Business Intelligence ${version}.aab`);
fs.copyFileSync(aab, aabOut);
if (fs.existsSync(apk)) fs.copyFileSync(apk, path.join(outDir, `Argus Business Intelligence ${version} (signed).apk`));
console.log(`\nPlay Store bundle: ${path.relative(root, aabOut)} (${mb(fs.statSync(aabOut).size)})`);
console.log('Upload it in Play Console > Release > Production (or Internal testing) > Create new release.');
