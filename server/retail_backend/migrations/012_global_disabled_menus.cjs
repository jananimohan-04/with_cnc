/* 012: initialize globalDisabledMenus array */
module.exports = {
  version: 12,
  name: 'global_disabled_menus',
  up(db) {
    if (!Array.isArray(db.globalDisabledMenus)) {
      db.globalDisabledMenus = [];
    }
  }
};
