/* 010: enforce the publish invariant in the data itself.
   A product carrying a workflow_stage that is not "published" must never have
   visible:true — drafts, items in review and returned-for-correction products are
   invisible to Salespeople. The API already enforces this at read time via
   salesVisible(); this migration makes the stored value agree so the file is
   self-consistent for anything reading it directly. */
module.exports = {
  version: 10,
  name: 'enforce_publish_invariant',
  up(db) {
    let fixed = 0;
    for (const p of db.products || []) {
      if (p.workflow_stage && p.workflow_stage !== 'published' && p.visible !== false) {
        p.visible = false;
        fixed++;
      }
    }
    if (fixed) console.log(`unpublished workflow products hidden: ${fixed}`);
  }
};
