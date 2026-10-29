/* 004: product_media metadata index (built from existing product images/video).
   Binary files stay on disk/Storage; only metadata lives here. Company-scoped. */
module.exports = {
  version: 4,
  name: 'product_media',
  up(db) {
    if (!Array.isArray(db.product_media)) db.product_media = [];
    if (db.product_media.length) return; // already migrated
    let n = 0;
    for (const p of db.products || []) {
      (p.images || []).forEach((url, i) => {
        db.product_media.push({ id: 'M-' + (++n), companyId: p.companyId, productId: p.id, sku: p.sku || '', type: 'image', url, primary: i === 0, visible: true, sortOrder: i, createdAt: p.created || new Date().toISOString().slice(0, 10) });
      });
      if (p.video) db.product_media.push({ id: 'M-' + (++n), companyId: p.companyId, productId: p.id, sku: p.sku || '', type: 'video', url: p.video, primary: false, visible: true, sortOrder: (p.images || []).length, createdAt: p.created || new Date().toISOString().slice(0, 10) });
    }
  }
};
