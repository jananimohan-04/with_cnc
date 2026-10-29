/* 009: normalise legacy / unknown product workflow stages.
   Earlier ERP sync experiments wrote stage values such as "content_ready" that no
   longer exist in the stage machine. Those products were stuck: no role had any
   action available for them, and they were excluded from every queue count.
   Map known legacy values onto their canonical stage and default anything else
   (except published) back to "content_pending" so a Content Writer can claim it. */
module.exports = {
  version: 9,
  name: 'normalise_workflow_stage',
  up(db) {
    const CANONICAL = [
      'content_pending', 'content_in_progress', 'submitted_to_finance',
      'finance_review', 'returned_for_correction', 'pricing_saved', 'published'
    ];
    const ALIASES = {
      content_ready: 'content_pending',
      pending_content: 'content_pending',
      new: 'content_pending',
      received: 'content_pending',
      content: 'content_in_progress',
      in_progress: 'content_in_progress',
      submitted: 'submitted_to_finance',
      review: 'finance_review',
      pricing: 'pricing_saved',
      priced: 'pricing_saved',
      approved: 'published',
      live: 'published'
    };
    let fixed = 0;
    for (const p of db.products || []) {
      const s = p.workflow_stage;
      if (!s || CANONICAL.includes(s)) continue; // absent (legacy/admin) or already canonical
      const next = ALIASES[s] || 'content_pending';
      if (next !== 'published') p.visible = false; // never leave a listing visible mid-correction
      p.workflow_stage = next;
      fixed++;
    }
    if (fixed) console.log(`workflow stages normalised: ${fixed}`);
  }
};
