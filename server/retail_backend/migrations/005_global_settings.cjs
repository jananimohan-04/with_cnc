/* 005: platform-wide global settings (defaults; company settings override). */
module.exports = {
  version: 5,
  name: 'global_settings',
  up(db) {
    if (!db.global_settings) {
      db.global_settings = {
        currency: 'INR', taxPct: 18, taxDisplay: 'inclusive',
        visibilityDefault: true, quotationEnabled: true,
        orderPrefix: 'ORD-', quotePrefix: 'Q-', lowStockThreshold: 10,
        announcement: 'GST invoice on all orders • Bulk pricing on request',
        updatedAt: new Date().toISOString().slice(0, 10)
      };
    }
  }
};
