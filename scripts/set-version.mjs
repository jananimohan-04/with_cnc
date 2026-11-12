// Stamps one version number into every place the desktop app reads it from. Used by the automatic release
// (.github/workflows/desktop-release.yml) so each build is a higher version than the last and installed apps update.
// Usage: node scripts/set-version.mjs 1.1.42
import fs from 'fs';

const v = process.argv[2];
if (!/^\d+\.\d+\.\d+$/.test(v || '')) { console.error('Usage: node scripts/set-version.mjs <major.minor.patch>'); process.exit(1); }

const edit = (file, fn) => {
  const raw = fs.readFileSync(file, 'utf8');
  const next = fn(raw);
  if (next === raw) console.warn(`(unchanged) ${file}`);
  fs.writeFileSync(file, next);
  console.log(`set ${v} in ${file}`);
};
const json = (file) => edit(file, (raw) => { const o = JSON.parse(raw); o.version = v; return JSON.stringify(o, null, 2) + '\n'; });

json('package.json');
json('src-tauri/tauri.conf.json');
edit('src-tauri/Cargo.toml', (raw) => raw.replace(/^version = ".*"$/m, `version = "${v}"`));
edit('src/lib/desktopDownload.ts', (raw) => raw.replace(/DESKTOP_APP_VERSION = '[^']*'/, `DESKTOP_APP_VERSION = '${v}'`));
edit('src/config/versionHistory.ts', (raw) => raw.replace(/CURRENT_APP_VERSION = '[^']*'/, `CURRENT_APP_VERSION = '${v}'`));
