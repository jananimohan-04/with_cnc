/* 006: product lifecycle flags (active/archived) without touching stock. */
module.exports = {
  version: 6,
  name: 'product_lifecycle',
  up(db) {
    for (const p of db.products || []) {
      if (p.active === undefined) p.active = true;
      if (p.archived === undefined) p.archived = false;
    }
  }
};
