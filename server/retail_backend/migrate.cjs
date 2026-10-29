/* Migration runner for the JSON file DB. Applies pending versioned migrations in order. */
const fs = require('fs');
const path = require('path');

function runMigrations(db, save) {
  const dir = path.join(__dirname, 'migrations');
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.cjs') || f.endsWith('.js')).sort();
  db._meta = db._meta || { version: 0 };
  const applied = [];
  for (const f of files) {
    const m = require(path.join(dir, f));
    if (m.version > db._meta.version) {
      m.up(db);
      db._meta.version = m.version;
      applied.push(`${m.version}-${m.name}`);
    }
  }
  if (applied.length) save();
  return applied;
}

module.exports = { runMigrations };
