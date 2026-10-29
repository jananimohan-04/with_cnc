/* 007: idempotent super admin seed for jananimohan44@gmail.com.
   Matches supabase/migrations/002_super_admin.sql. */
module.exports = {
  version: 7,
  name: 'super_admin_seed',
  up(db) {
    if (!Array.isArray(db.users)) db.users = [];
    const targetEmail = 'jananimohan44@gmail.com';
    const existing = db.users.find(u => (u.email || '').toLowerCase() === targetEmail);
    if (existing) {
      existing.role = 'super_admin';
      existing.companyId = null;
      existing.active = true;
    } else {
      db.users.unshift({
        id: 'U-super-janani',
        name: 'Janani Mohan',
        role: 'super_admin',
        companyId: null,
        email: targetEmail,
        active: true,
        createdAt: new Date().toISOString().slice(0, 10)
      });
    }
  }
};
