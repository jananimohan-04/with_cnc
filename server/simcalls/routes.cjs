/**
 * SIM Calls: call recordings sent by the Argus Android app.
 *
 * The phone's own dialer records the call; the app finds the file and sends it here in two steps, with the phone's
 * SIM Calls key (the same key it uses to send call details, see sim_ingest in 20261129000000_sim_calls.sql):
 *
 *   POST /api/simcalls/recording/start    { token, callId, startedAt, ext, size }  -> { url } one-time upload address
 *   (the phone uploads the file straight to that address: private bucket "sim-recordings")
 *   POST /api/simcalls/recording/finish   { token, callId, startedAt }             -> attaches it to the call
 *   GET  /api/simcalls/cron/retention                                              deletes recordings past the
 *                                                                                  company's "keep N days" (CRON_SECRET)
 *
 * The company, person and call always come from the key, never from what the phone sends.
 */
'use strict';
const crypto = require('crypto');

const BUCKET = 'sim-recordings';
const MAX_BYTES = 50 * 1024 * 1024;
const EXT = new Set(['m4a', 'amr', 'mp3', 'aac', 'wav', '3gp', 'ogg', 'opus', 'awb', 'mp4']);

module.exports = function mountSimCalls(app, SB) {
  const db = () => (SB && SB.enabled ? SB.admin : null);
  const fail = (res, e, code = 500) => res.status(code).json({ ok: false, error: e && e.message ? e.message : String(e) });

  async function lineOf(token) {
    const t = String(token || '');
    if (t.length < 32) return null;
    const hash = crypto.createHash('sha256').update(t, 'utf8').digest('hex');
    const { data } = await db().from('sim_lines').select('id, company_id, user_id, active').eq('token_hash', hash).eq('active', true).maybeSingle();
    return data || null;
  }

  async function settingsOf(companyId) {
    const { data } = await db().from('sim_settings').select('save_recordings, recording_days').eq('company_id', companyId).maybeSingle();
    return { save_recordings: data ? data.save_recordings !== false : true, recording_days: (data && data.recording_days) || 90 };
  }

  async function callOf(line, body) {
    const id = Number(body && body.callId);
    if (!Number.isFinite(id)) return null;
    const { data } = await db().from('sim_calls').select('id, started_at, recording_path')
      .eq('line_id', line.id).eq('device_call_id', id).order('created_at', { ascending: false }).limit(1);
    return (data && data[0]) || null;
  }

  async function guard(req, res) {
    if (!db()) { fail(res, new Error('Not available'), 503); return null; }
    const line = await lineOf(req.body && req.body.token);
    if (!line) { fail(res, new Error('This phone is no longer connected. Choose the SIM again in the app.'), 403); return null; }
    return line;
  }

  app.post('/api/simcalls/recording/start', async (req, res) => {
    try {
      const line = await guard(req, res); if (!line) return;
      const s = await settingsOf(line.company_id);
      if (!s.save_recordings) return res.json({ ok: true, skip: true });   // the company switched recordings off
      const call = await callOf(line, req.body);
      if (!call) return res.status(404).json({ ok: false, retry: true, error: 'Call not saved yet' });
      if (call.recording_path) return res.json({ ok: true, done: true });
      const ext = String((req.body && req.body.ext) || '').toLowerCase().replace(/[^a-z0-9]/g, '');
      const size = Number(req.body && req.body.size) || 0;
      if (!EXT.has(ext)) return res.json({ ok: true, skip: true });
      if (size <= 0 || size > MAX_BYTES) return res.json({ ok: true, skip: true });
      const path = `${line.company_id}/${line.id}/${call.id}.${ext}`;
      const { data, error } = await db().storage.from(BUCKET).createSignedUploadUrl(path, { upsert: true });
      if (error) throw error;
      res.json({ ok: true, url: data.signedUrl, path });
    } catch (e) { fail(res, e); }
  });

  app.post('/api/simcalls/recording/finish', async (req, res) => {
    try {
      const line = await guard(req, res); if (!line) return;
      const call = await callOf(line, req.body);
      if (!call) return res.status(404).json({ ok: false, error: 'Call not found' });
      const dir = `${line.company_id}/${line.id}`;
      const { data: files, error } = await db().storage.from(BUCKET).list(dir, { search: call.id, limit: 10 });
      if (error) throw error;
      const file = (files || []).find((f) => f.name.startsWith(call.id + '.'));
      if (!file) return res.status(409).json({ ok: false, retry: true, error: 'Upload not found' });
      const s = await settingsOf(line.company_id);
      const size = (file.metadata && Number(file.metadata.size)) || 0;
      const { error: upErr } = await db().from('sim_calls').update({
        recording_path: `${dir}/${file.name}`, recording_size: size, recording_at: new Date().toISOString(),
        recording_delete_after: new Date(Date.now() + s.recording_days * 86400000).toISOString(),
      }).eq('id', call.id);
      if (upErr) throw upErr;
      res.json({ ok: true });
    } catch (e) { fail(res, e); }
  });

  app.get('/api/simcalls/cron/retention', async (req, res) => {
    const secret = String(process.env.CRON_SECRET || '');
    if (!secret || String(req.headers.authorization || '') !== `Bearer ${secret}`) return res.status(401).json({ ok: false });
    if (!db()) return res.status(503).json({ ok: false });
    try {
      const { data: due, error } = await db().from('sim_calls').select('id, recording_path')
        .neq('recording_path', '').lt('recording_delete_after', new Date().toISOString()).limit(500);
      if (error) throw error;
      const rows = due || [];
      if (rows.length) {
        const { error: rmErr } = await db().storage.from(BUCKET).remove(rows.map((r) => r.recording_path));
        if (rmErr) throw rmErr;
        await db().from('sim_calls').update({ recording_path: '', recording_size: 0 }).in('id', rows.map((r) => r.id));
      }
      res.json({ ok: true, deleted: rows.length });
    } catch (e) { fail(res, e); }
  });
};
