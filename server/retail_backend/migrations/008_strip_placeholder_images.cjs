/* 008: products only carry media an admin uploaded. Removes the stock photo that the old
   frontend/sync silently inserted when a product was saved without an image (C-ARGUS rows),
   plus blob: preview URLs that only ever existed in one browser. Demo seed companies untouched. */
const AUTO_DEFAULT = 'https://images.unsplash.com/photo-1504917595217-d4dc5ebe6122?auto=format&fit=crop&w=700&q=80';
module.exports = {
  version: 8,
  name: 'strip_placeholder_images',
  up(db) {
    // "http://localhost:4000/uploads/x.png" -> "/uploads/x.png" so uploads work from any host/port
    const rel = u => String(u).replace(/^https?:\/\/[^/]+(\/uploads\/)/, '$1');
    for (const p of db.products || []) {
      const imgs = Array.isArray(p.images) ? p.images : [];
      p.images = imgs.filter(u => u && !String(u).startsWith('blob:') && !(p.companyId === 'C-ARGUS' && u === AUTO_DEFAULT)).map(rel);
      if (p.video && String(p.video).startsWith('blob:')) p.video = '';
      if (p.video) p.video = rel(p.video);
    }
    for (const m of db.product_media || []) if (m.url) m.url = rel(m.url);
  }
};
