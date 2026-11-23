// Builds the Android app (APK) for phones:  npm run android:apk
//
// 1. builds the web app (dist/)
// 2. removes the website's download files from dist/ (Windows installers, update files and older APKs —
//    the phone app never needs them; they made the APK over 1 GB because each build also swallowed the last APK)
// 3. copies the web app into the Android project (cap sync)
// 4. builds the APK with Gradle
// 5. copies it to public/downloads/business-intelligence.apk (the website's download link) and prints its size
//
// Needs Java and the Android SDK (android/local.properties) on this computer.

import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/(\w:)/, '$1')), '..');
const run = (cmd, cwd = root) => { console.log(`\n> ${cmd}`); execSync(cmd, { cwd, stdio: 'inherit' }); };
const mb = (n) => `${(n / 1048576).toFixed(1)} MB`;

run('npx vite build');

// 2. the download folder and anything huge stay on the website only
const dist = path.join(root, 'dist');
fs.rmSync(path.join(dist, 'downloads'), { recursive: true, force: true });
const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]));
for (const f of walk(dist)) {
  const size = fs.statSync(f).size;
  if (/\.(apk|exe|sig|msi|zip)$/i.test(f) || size > 40 * 1048576) {
    console.log(`  leaving out ${path.relative(dist, f)} (${mb(size)})`);
    fs.rmSync(f, { force: true });
  }
}
const webSize = walk(dist).reduce((n, f) => n + fs.statSync(f).size, 0);
console.log(`\nWeb app inside the APK: ${mb(webSize)}`);

run('npx cap sync android');
const androidDir = path.join(root, 'android');
run(process.platform === 'win32' ? `"${path.join(androidDir, 'gradlew.bat')}" assembleDebug` : './gradlew assembleDebug', androidDir);

const apk = path.join(root, 'android/app/build/outputs/apk/debug/app-debug.apk');
const out = path.join(root, 'public/downloads/business-intelligence.apk');
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.copyFileSync(apk, out);
// a copy with the app's own name, for sharing (WhatsApp, e-mail, a shared folder): "Argus Business Intelligence.apk"
const share = path.join(path.dirname(apk), 'Argus Business Intelligence.apk');
fs.copyFileSync(apk, share);
console.log(`\nAPK ready: ${path.relative(root, out)} (${mb(fs.statSync(out).size)})`);
console.log(`To share:  ${path.relative(root, share)}`);
