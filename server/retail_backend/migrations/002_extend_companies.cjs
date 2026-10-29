/* 002: extended company profile fields (code unique, industry, contact, address, lifecycle). */
module.exports = {
  version: 2,
  name: 'extend_companies',
  up(db) {
    const seedDates = { 'C-A': '2025-06-14', 'C-B': '2025-09-02', 'C-C': '2026-01-20' };
    for (const c of db.companies || []) {
      if (!c.code) c.code = c.id;
      if (!c.industry) c.industry = 'CNC Manufacturing';
      if (c.email === undefined) c.email = '';
      if (c.phone === undefined) c.phone = '';
      if (c.address === undefined) c.address = '';
      if (c.state === undefined) c.state = '';
      if (c.pin === undefined) c.pin = '';
      if (c.description === undefined) c.description = '';
      if (!c.storeStatus) c.storeStatus = c.status === 'active' ? 'active' : 'suspended';
      if (!c.createdAt) c.createdAt = seedDates[c.id] || new Date().toISOString().slice(0, 10);
      if (!c.updatedAt) c.updatedAt = c.createdAt;
    }
  }
};
