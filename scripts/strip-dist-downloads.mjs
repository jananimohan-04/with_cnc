// Removes the website's download files from dist/ before dist/ is packed into the desktop app or the phone app.
// The website itself (Vercel) keeps them; the apps never need them, and they made the desktop installer ~300 MB
// and the phone app over 1 GB (each build also swallowed the previous installers).
//   node scripts/strip-dist-downloads.mjs
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/(\w:)/, '$1')), '..');
const dist = path.join(root, 'dist');
const mb = (n) => `${(n / 1048576).toFixed(1)} MB`;

if (!fs.existsSync(dist)) { console.error('dist/ not found: build the web app first'); process.exit(1); }
fs.rmSync(path.join(dist, 'downloads'), { recursive: true, force: true });
const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]));
for (const f of walk(dist)) {
  const size = fs.statSync(f).size;
  if (/\.(apk|exe|sig|msi|zip)$/i.test(f) || size > 40 * 1048576) {
    console.log(`  leaving out ${path.relative(dist, f)} (${mb(size)})`);
    fs.rmSync(f, { force: true });
  }
}
console.log(`App web files: ${mb(walk(dist).reduce((n, f) => n + fs.statSync(f).size, 0))}`);
