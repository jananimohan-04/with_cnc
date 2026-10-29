/* 011: idempotent super admin seed for technologiesargus@gmail.com. */
module.exports = {
  version: 11,
  name: 'technologiesargus_super_admin',
  up(db) {
    if (!Array.isArray(db.users)) db.users = [];
    const targetEmail = 'technologiesargus@gmail.com';
    const existing = db.users.find(u => (u.email || '').toLowerCase() === targetEmail);
    if (existing) {
      existing.role = 'super_admin';
      existing.companyId = null;
      existing.active = true;
    } else {
      db.users.unshift({
        id: 'U-1792231048855',
        name: 'ARGUS TECHNOLOGIES',
        role: 'super_admin',
        companyId: null,
        email: targetEmail,
        active: true,
        createdAt: '2026-10-17',
        menuOverrides: {}
      });
    }
  }
};
