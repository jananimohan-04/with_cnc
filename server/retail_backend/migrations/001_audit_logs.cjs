/* 001: audit log collection for administrative actions. */
module.exports = {
  version: 1,
  name: 'audit_logs',
  up(db) {
    if (!Array.isArray(db.audit_logs)) db.audit_logs = [];
  }
};
