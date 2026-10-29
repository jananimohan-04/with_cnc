/* 003: category levels — global vs company-specific, with display metadata. */
module.exports = {
  version: 3,
  name: 'extend_categories',
  up(db) {
    (db.categories || []).forEach((c, i) => {
      if (!c.scope) c.scope = 'global';
      if (c.companyId === undefined) c.companyId = null;
      if (c.image === undefined) c.image = '';
      if (c.sortOrder === undefined) c.sortOrder = i;
      if (c.active === undefined) c.active = true;
    });
    if (!Array.isArray(db.category_assignments)) db.category_assignments = [];
  }
};
