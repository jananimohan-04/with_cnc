/* Tele CRM server routes (mounted from server/retail_backend/server.cjs).
 *
 * Signed-in routes (Authorization: Bearer <BI sign-in token>):
 *   GET    /api/telecrm/status                     provider switched on? what is missing? who am I in Tele CRM?
 *   POST   /api/telecrm/token                      short-lived browser phone token (active telecallers only)
 *   POST   /api/telecrm/numbers                    connect a cloud number of the provider account to this company (managers)
 *   DELETE /api/telecrm/numbers/:id                disconnect it (managers)
 *   POST   /api/telecrm/calls/:id/transfer         { toUserId }  move a live call to another telecaller
 *   POST   /api/telecrm/calls/bridge               { to, contactId? }  bridge call: ring the agent's verified mobile, then the customer
 *   POST   /api/telecrm/calls/:id/hangup           end a live call
 *   POST   /api/telecrm/agent/mobile               { mobile }  start the provider's verification of my mobile
 *   POST   /api/telecrm/agent/mobile/check         re-check the verification with the provider
 *   DELETE /api/telecrm/agent/mobile               disconnect my mobile
 *   POST   /api/telecrm/recordings/:id/link        { download? } -> a 5-minute private link (permission checked)
 *   GET    /api/telecrm/recordings/:id/audio?t=    the audio, streamed through this server (never a public provider link)
 *   DELETE /api/telecrm/recordings/:id             delete at the provider and here (managers)
 * Provider webhooks (signature checked, duplicates ignored):
 *   POST   /api/telecrm/hooks/voice | dial | leg | status | recording | announce | bridge | bridge-go | verify | screen | screen-ok
 * Scheduled:
 *   GET    /api/telecrm/cron/retention             deletes recordings past the company's retention (Vercel cron, CRON_SECRET)
 *
 * Environment: TELEPHONY_PROVIDER (e.g. "twilio") + that provider's variables (see providers/*.cjs),
 *   TELECRM_PUBLIC_URL (the address the provider calls, default https://with-cnc.vercel.app), CRON_SECRET (optional).
 * The database writes here use the server key; every row gets the company found from the number / the telecaller,
 * never a company sent by the browser.
 */
'use strict';
const crypto = require('crypto');
const { getProvider, providerStatus } = require('./providers/index.cjs');

const PUBLIC_URL = () => String(process.env.TELECRM_PUBLIC_URL || 'https://with-cnc.vercel.app').trim().replace(/\/+$/, '');
const LINK_KEY = () => crypto.createHash('sha256').update('telecrm-recording:' + (process.env.TELECRM_LINK_SECRET || process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || 'local')).digest();
const BUSY_TEXT = 'Sorry, all our team members are busy right now. We will call you back shortly.';
const TERMINAL = new Set(['completed', 'missed', 'busy', 'failed', 'rejected', 'cancelled']);
const RANK = { initiated: 0, ringing: 1, 'in-progress': 2 };

/** +91 for plain 10-digit Indian mobiles; keeps numbers that already have a country code. */
function toE164(raw) {
  let s = String(raw || '').trim().replace(/[\s\-().]/g, '');
  if (!s) return '';
  if (s.startsWith('00')) s = '+' + s.slice(2);
  if (s.startsWith('+')) return /^\+\d{8,15}$/.test(s) ? s : '';
  const d = s.replace(/\D/g, '');
  if (d.length === 10 && /^[6-9]/.test(d)) return '+91' + d;
  if (d.length === 11 && d.startsWith('0')) return '+91' + d.slice(1);
  if (d.length === 12 && d.startsWith('91')) return '+' + d;
  return d.length >= 8 && d.length <= 15 ? '+' + d : '';
}
const phoneKey = (raw) => String(raw || '').replace(/\D/g, '').slice(-10);

module.exports = function mountTeleCrm(app, SB) {
  const db = () => (SB && SB.enabled ? SB.admin : null);
  const url = (path, q) => `${PUBLIC_URL()}/api/telecrm/hooks/${path}${q ? '?' + new URLSearchParams(q).toString() : ''}`;

  // ------------------------------------------------------------------ signed-in person
  async function who(req, res) {
    if (!db()) { res.status(503).json({ ok: false, error: 'The database service is not available.' }); return null; }
    const h = String(req.headers.authorization || '');
    const user = h.startsWith('Bearer ') ? await SB.authUserFromToken(h.slice(7).trim()) : null;
    if (!user) { res.status(401).json({ ok: false, error: 'Please sign in again.' }); return null; }
    const { data: rows } = await db().from('company_users').select('id, email, full_name, role, status, company_id, active_company_id')
      .eq('email', String(user.email || '').toLowerCase()).limit(5);
    const bi = (rows || []).find((r) => r.status === 'Active');
    if (!bi) { res.status(403).json({ ok: false, error: 'Your account is not active.' }); return null; }
    const role = String(bi.role || 'USER').toUpperCase();
    const companyId = role === 'SUPER_ADMIN' ? bi.active_company_id : bi.company_id;
    if (!companyId) { res.status(400).json({ ok: false, error: 'Select a company in the top bar first.' }); return null; }
    const { data: agent } = await db().from('tele_agents').select('*').eq('company_id', companyId).eq('user_id', bi.id).maybeSingle();
    const isAdmin = role === 'SUPER_ADMIN' || role === 'COMPANY_ADMIN';
    return { id: bi.id, name: bi.full_name || bi.email, role, companyId, agent: agent && agent.active ? agent : null, isManager: isAdmin || !!(agent && agent.active && agent.role === 'supervisor') };
  }

  const audit = (companyId, actorId, action, target, detail) =>
    db().from('tele_audit').insert({ company_id: companyId, actor_id: actorId || null, action, target: target || '', detail: detail || {} }).then(() => {}, () => {});

  const settingsOf = async (companyId) => {
    const { data } = await db().from('tele_settings').select('*').eq('company_id', companyId).maybeSingle();
    return data || { routing_mode: 'assigned_then_all', ring_seconds: 25, record_calls: false, announce_recording: true, announcement_text: '', retention_days: 90, allow_download: false, missed_call_followup: true };
  };

  const fail = (res, e) => {
    const msg = e instanceof Error ? e.message : String(e);
    if (/tele_\w+.*(does not exist|schema cache)|PGRST205|42P01/i.test(msg)) return res.status(503).json({ ok: false, error: 'Tele CRM is not set up in the database yet (run the Tele CRM SQL first).', setupNeeded: true });
    console.warn('telecrm:', msg);
    return res.status(500).json({ ok: false, error: msg || 'Something went wrong.' });
  };

  // ------------------------------------------------------------------ status / token
  app.get('/api/telecrm/status', async (req, res) => {
    const me = await who(req, res); if (!me) return;
    try {
      const st = providerStatus();
      const { data: nums, error } = await db().from('tele_numbers').select('id, e164, label, is_default, active').eq('company_id', me.companyId).eq('active', true);
      if (error) throw error;
      res.json({
        ok: true,
        configured: st.configured,
        browserCalling: !!st.browserCalling,
        bridgeCalling: !!st.bridgeCalling,
        provider: st.configured ? st.label : '',
        // what an administrator must add on the server (names only, never values)
        missing: me.isManager ? st.missing : [],
        // optional: only for calling from the computer
        missingBrowser: me.isManager ? (st.missingBrowser || []) : [],
        supported: me.isManager ? st.supported : [],
        webhookBase: me.isManager ? `${PUBLIC_URL()}/api/telecrm/hooks` : '',
        numbers: nums || [],
        me: { id: me.id, isManager: me.isManager, agent: me.agent },
      });
    } catch (e) { fail(res, e); }
  });

  app.post('/api/telecrm/token', async (req, res) => {
    const me = await who(req, res); if (!me) return;
    const p = getProvider();
    if (!p || p.missingConfig().length) return res.status(409).json({ ok: false, error: 'Calling is not switched on yet: the cloud phone provider is not configured on the server.' });
    if (!p.browserCalling) return res.status(409).json({ ok: false, error: 'Calling from the computer is not switched on (only calls through your mobile are).' });
    if (!me.agent || (!me.agent.can_call_out && !me.agent.can_receive)) return res.status(403).json({ ok: false, error: 'You are not set up as a telecaller in this company.' });
    try {
      const { count } = await db().from('tele_numbers').select('id', { count: 'exact', head: true }).eq('company_id', me.companyId).eq('active', true);
      if (!count) return res.status(409).json({ ok: false, error: 'No business number is connected to this company yet.' });
      const t = p.clientToken(p.identityFor(me.id), 3600);
      res.json({ ok: true, provider: p.id, identity: p.identityFor(me.id), ...t, canCallOut: me.agent.can_call_out, canReceive: me.agent.can_receive });
    } catch (e) { fail(res, e); }
  });

  // ------------------------------------------------------------------ numbers
  app.post('/api/telecrm/numbers', async (req, res) => {
    const me = await who(req, res); if (!me) return;
    if (!me.isManager) return res.status(403).json({ ok: false, error: 'Only a company admin or Tele CRM supervisor can connect numbers.' });
    const p = getProvider();
    if (!p || p.missingConfig().length) return res.status(409).json({ ok: false, error: 'The cloud phone provider is not configured on the server yet.' });
    const e164 = toE164(req.body && req.body.e164);
    if (!e164) return res.status(400).json({ ok: false, error: 'Enter the number with its country code, e.g. +91 98765 43210.' });
    try {
      const { data: taken } = await db().from('tele_numbers').select('id, company_id').eq('e164', e164).maybeSingle();
      if (taken && taken.company_id !== me.companyId) return res.status(409).json({ ok: false, error: 'This number is already connected to another company.' });
      const found = await p.findNumber(e164);
      if (!found) return res.status(404).json({ ok: false, error: 'This number was not found in the cloud phone account. Buy / port it there first.' });
      await p.pointNumber(found.ref, url('voice'), url('status'));
      const isDefault = !!(req.body && req.body.isDefault);
      if (isDefault) await db().from('tele_numbers').update({ is_default: false }).eq('company_id', me.companyId);
      const row = { company_id: me.companyId, provider: p.id, e164, label: String((req.body && req.body.label) || found.name || '').slice(0, 80), provider_ref: found.ref, is_default: isDefault, active: true };
      const q = taken ? db().from('tele_numbers').update(row).eq('id', taken.id) : db().from('tele_numbers').insert(row);
      const { error } = await q;
      if (error) throw error;
      await audit(me.companyId, me.id, 'number.connected', e164);
      res.json({ ok: true, e164 });
    } catch (e) { fail(res, e); }
  });

  app.delete('/api/telecrm/numbers/:id', async (req, res) => {
    const me = await who(req, res); if (!me) return;
    if (!me.isManager) return res.status(403).json({ ok: false, error: 'Only a company admin or Tele CRM supervisor can disconnect numbers.' });
    try {
      const { data: n } = await db().from('tele_numbers').select('id, e164').eq('id', req.params.id).eq('company_id', me.companyId).maybeSingle();
      if (!n) return res.status(404).json({ ok: false, error: 'Number not found.' });
      const { error } = await db().from('tele_numbers').update({ active: false, is_default: false }).eq('id', n.id);
      if (error) throw error;
      await audit(me.companyId, me.id, 'number.disconnected', n.e164);
      res.json({ ok: true });
    } catch (e) { fail(res, e); }
  });

  // ------------------------------------------------------------------ transfer
  app.post('/api/telecrm/calls/:id/transfer', async (req, res) => {
    const me = await who(req, res); if (!me) return;
    const p = getProvider();
    if (!p) return res.status(409).json({ ok: false, error: 'Calling is not switched on.' });
    try {
      const { data: call } = await db().from('tele_calls').select('*').eq('id', req.params.id).eq('company_id', me.companyId).maybeSingle();
      if (!call) return res.status(404).json({ ok: false, error: 'Call not found.' });
      if (!me.isManager && call.agent_user_id !== me.id && call.transferred_to !== me.id) return res.status(403).json({ ok: false, error: 'This is not your call.' });
      if (call.status !== 'in-progress') return res.status(409).json({ ok: false, error: 'Only a live call can be transferred.' });
      const toUserId = String((req.body && req.body.toUserId) || '');
      const { data: target } = await db().from('tele_agents').select('*').eq('company_id', me.companyId).eq('user_id', toUserId).maybeSingle();
      const reach = target ? reachOf(target) : null;
      if (!target || !target.active || !target.can_receive || !reach) return res.status(400).json({ ok: false, error: 'Pick a telecaller of this company who can receive calls.' });
      const customerLeg = call.direction === 'inbound' ? call.provider_call_id : call.provider_leg_id;
      if (!customerLeg) return res.status(409).json({ ok: false, error: 'The customer side of this call is not known yet; try again in a moment.' });
      const s = await settingsOf(me.companyId);
      await db().from('tele_calls').update({ transferred_to: toUserId, updated_at: new Date().toISOString() }).eq('id', call.id);
      await p.redirectLeg(customerLeg, reach.mobile
        ? p.xmlTransfer({ number: reach.mobile, callerId: call.customer_number, record: s.record_calls, recordingUrl: url('recording', { call: call.id }), legStatusUrl: url('leg', { call: call.id, agent: toUserId }), screenUrl: url('screen', { call: call.id, agent: toUserId, transfer: 1 }) })
        : p.xmlTransfer({ identity: p.identityFor(toUserId), callRef: call.id, customer: call.customer_number, record: s.record_calls, recordingUrl: url('recording', { call: call.id }), legStatusUrl: url('leg', { call: call.id }) }));
      await audit(me.companyId, me.id, 'call.transferred', call.id, { to: toUserId });
      res.json({ ok: true });
    } catch (e) { fail(res, e); }
  });

  // ------------------------------------------------------------------ agent's own mobile (bridge calling)
  const myAgentRow = async (me) => {
    const { data } = await db().from('tele_agents').select('*').eq('company_id', me.companyId).eq('user_id', me.id).maybeSingle();
    return data && data.active ? data : null;
  };

  app.post('/api/telecrm/agent/mobile', async (req, res) => {
    const me = await who(req, res); if (!me) return;
    const p = getProvider();
    if (!p || p.missingConfig().length || !p.bridgeCalling) return res.status(409).json({ ok: false, error: 'Calling through your mobile is not switched on yet: the cloud phone provider is not configured on the server.' });
    try {
      const agent = await myAgentRow(me);
      if (!agent) return res.status(403).json({ ok: false, error: 'You are not set up as a telecaller in this company.' });
      const e164 = toE164(req.body && req.body.mobile);
      if (!e164) return res.status(400).json({ ok: false, error: 'Enter your mobile number, e.g. 98765 43210.' });
      const { data: other } = await db().from('tele_agents').select('id').eq('company_id', me.companyId).eq('mobile_e164', e164).neq('id', agent.id).limit(1);
      if ((other || []).length) return res.status(409).json({ ok: false, error: 'This mobile is already connected to another telecaller of this company.' });
      const v = await p.startNumberVerification(e164, me.name + ' (Tele CRM)', url('verify', { agent: agent.id }));
      const verified = v.already;
      const { error } = await db().from('tele_agents').update({ mobile_e164: e164, mobile_status: verified ? 'verified' : 'pending', mobile_verified_at: verified ? new Date().toISOString() : null }).eq('id', agent.id);
      if (error) throw error;
      await audit(me.companyId, me.id, 'mobile.verification_started', e164);
      res.json({ ok: true, e164, verified, code: v.code });
    } catch (e) { fail(res, e); }
  });

  app.post('/api/telecrm/agent/mobile/check', async (req, res) => {
    const me = await who(req, res); if (!me) return;
    const p = getProvider();
    if (!p || !p.bridgeCalling) return res.status(409).json({ ok: false, error: 'The cloud phone provider is not configured.' });
    try {
      const agent = await myAgentRow(me);
      if (!agent || !agent.mobile_e164) return res.status(404).json({ ok: false, error: 'No mobile is connected.' });
      if (agent.mobile_status === 'verified') return res.json({ ok: true, verified: true, e164: agent.mobile_e164 });
      const verified = await p.isNumberVerified(agent.mobile_e164);
      if (verified) {
        await db().from('tele_agents').update({ mobile_status: 'verified', mobile_verified_at: new Date().toISOString() }).eq('id', agent.id);
        await audit(me.companyId, me.id, 'mobile.verified', agent.mobile_e164);
      }
      res.json({ ok: true, verified, e164: agent.mobile_e164 });
    } catch (e) { fail(res, e); }
  });

  app.delete('/api/telecrm/agent/mobile', async (req, res) => {
    const me = await who(req, res); if (!me) return;
    try {
      const agent = await myAgentRow(me);
      if (!agent) return res.status(403).json({ ok: false, error: 'You are not set up as a telecaller in this company.' });
      const { error } = await db().from('tele_agents').update({ mobile_e164: '', mobile_status: 'none', mobile_verified_at: null }).eq('id', agent.id);
      if (error) throw error;
      await audit(me.companyId, me.id, 'mobile.disconnected', agent.mobile_e164 || '');
      res.json({ ok: true });
    } catch (e) { fail(res, e); }
  });

  // ------------------------------------------------------------------ bridge call
  app.post('/api/telecrm/calls/bridge', async (req, res) => {
    const me = await who(req, res); if (!me) return;
    const p = getProvider();
    if (!p || p.missingConfig().length || !p.bridgeCalling) return res.status(409).json({ ok: false, error: 'Calling is not switched on yet: the cloud phone provider is not configured on the server.' });
    let callId = '';
    try {
      const agent = await myAgentRow(me);
      if (!agent || !agent.can_call_out) return res.status(403).json({ ok: false, error: 'You are not allowed to make calls.' });
      if (!agent.mobile_e164 || agent.mobile_status !== 'verified') return res.status(409).json({ ok: false, error: 'Connect and verify your mobile number before calling.', needMobile: true });
      const to = toE164(req.body && req.body.to);
      if (!to) return res.status(400).json({ ok: false, error: 'That phone number is not valid.' });
      if (to === agent.mobile_e164) return res.status(400).json({ ok: false, error: 'You cannot call your own mobile.' });
      const { data: nums } = await db().from('tele_numbers').select('id, e164, is_default').eq('company_id', me.companyId).eq('active', true);
      const num = (nums || []).find((n) => n.is_default) || (nums || [])[0] || null;   // optional for bridge calls
      const s = await settingsOf(me.companyId);
      // the number the customer sees: the agent's own verified SIM, or the business number when the company chose that
      const shown = s.bridge_caller_id === 'business' && num ? num.e164 : agent.mobile_e164;
      const contact = await findContact(me.companyId, to, req.body && req.body.contactId);
      if (contact && contact.status === 'Do not call') return res.status(409).json({ ok: false, error: 'This contact is marked do not call.' });
      const { data: busy } = await db().from('tele_calls').select('id').eq('company_id', me.companyId).eq('agent_user_id', me.id).in('status', ['initiated', 'ringing', 'in-progress']).gte('started_at', new Date(Date.now() - 2 * 3600000).toISOString()).limit(1);
      if ((busy || []).length) return res.status(409).json({ ok: false, error: 'You already have a call in progress. End it first.' });
      // the record first (so every webhook can find it), then the provider call
      const { data: row, error } = await db().from('tele_calls').insert({
        company_id: me.companyId, provider: p.id, provider_call_id: 'pending:' + crypto.randomUUID(), direction: 'outbound', status: 'initiated', call_mode: 'bridge',
        from_number: shown, to_number: to, customer_number: to, number_id: num ? num.id : null, contact_id: contact ? contact.id : null, agent_user_id: me.id,
      }).select('id').single();
      if (error) throw error;
      callId = row.id;
      // the agent's phone sees the business number, or (without one) their own verified number
      const started = await p.createCall({ to: agent.mobile_e164, from: num ? num.e164 : agent.mobile_e164, url: url('bridge', { call: callId }), statusUrl: url('status', { call: callId }) });
      await db().from('tele_calls').update({ provider_call_id: started.callId, updated_at: new Date().toISOString() }).eq('id', callId).like('provider_call_id', 'pending:%');
      res.json({ ok: true, callId });
    } catch (e) {
      if (callId) await db().from('tele_calls').update({ status: 'failed', ended_at: new Date().toISOString(), error_text: String(e.message || e).slice(0, 300) }).eq('id', callId);
      fail(res, e);
    }
  });

  app.post('/api/telecrm/calls/:id/hangup', async (req, res) => {
    const me = await who(req, res); if (!me) return;
    const p = getProvider();
    if (!p) return res.status(409).json({ ok: false, error: 'Calling is not switched on.' });
    try {
      const { data: call } = await db().from('tele_calls').select('*').eq('id', req.params.id).eq('company_id', me.companyId).maybeSingle();
      if (!call) return res.status(404).json({ ok: false, error: 'Call not found.' });
      if (!me.isManager && call.agent_user_id !== me.id) return res.status(403).json({ ok: false, error: 'This is not your call.' });
      if (TERMINAL.has(call.status)) return res.json({ ok: true });
      if (call.provider_call_id && !call.provider_call_id.startsWith('pending:')) {
        try { await p.hangupLeg(call.provider_call_id); } catch (e) { if (e.status !== 404) throw e; }
      }
      await advance(call, { status: call.answered_at ? 'completed' : 'cancelled', ended_at: new Date().toISOString() });
      res.json({ ok: true });
    } catch (e) { fail(res, e); }
  });

  // ------------------------------------------------------------------ recordings (private)
  const sign = (s) => crypto.createHmac('sha256', LINK_KEY()).update(s).digest('base64url');

  app.post('/api/telecrm/recordings/:id/link', async (req, res) => {
    const me = await who(req, res); if (!me) return;
    try {
      const { data: r } = await db().from('tele_recordings').select('id, call_id, status, company_id').eq('id', req.params.id).eq('company_id', me.companyId).maybeSingle();
      if (!r || r.status !== 'available') return res.status(404).json({ ok: false, error: 'This recording is not available.' });
      const { data: call } = await db().from('tele_calls').select('agent_user_id, transferred_to').eq('id', r.call_id).maybeSingle();
      const own = call && (call.agent_user_id === me.id || call.transferred_to === me.id);
      const canListen = me.isManager || (own && me.agent && me.agent.can_listen);
      if (!canListen) return res.status(403).json({ ok: false, error: 'You do not have permission to play this recording.' });
      const download = !!(req.body && req.body.download);
      if (download) {
        const s = await settingsOf(me.companyId);
        if (!s.allow_download) return res.status(403).json({ ok: false, error: 'Downloading recordings is switched off for this company.' });
        if (!me.isManager && !(me.agent && me.agent.can_download)) return res.status(403).json({ ok: false, error: 'You do not have permission to download recordings.' });
      }
      const exp = Math.floor(Date.now() / 1000) + 300;
      const payload = `${r.id}.${exp}.${download ? 1 : 0}.${me.id}`;
      await audit(me.companyId, me.id, download ? 'recording.downloaded' : 'recording.played', r.id);
      res.json({ ok: true, url: `/api/telecrm/recordings/${r.id}/audio?t=${encodeURIComponent(`${payload}.${sign(payload)}`)}`, expiresIn: 300 });
    } catch (e) { fail(res, e); }
  });

  app.get('/api/telecrm/recordings/:id/audio', async (req, res) => {
    const parts = String(req.query.t || '').split('.');
    if (parts.length !== 5) return res.status(403).end();
    const [id, exp, dl, uid, sig] = parts;
    const payload = `${id}.${exp}.${dl}.${uid}`;
    const want = sign(payload);
    if (id !== req.params.id || Number(exp) < Date.now() / 1000 || sig.length !== want.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(want))) return res.status(403).end();
    const p = getProvider();
    if (!p || !db()) return res.status(503).end();
    try {
      const { data: r } = await db().from('tele_recordings').select('provider_recording_id, status').eq('id', id).maybeSingle();
      if (!r || r.status !== 'available') return res.status(404).end();
      const up = await p.recordingAudio(r.provider_recording_id);
      res.setHeader('Content-Type', up.headers.get('content-type') || 'audio/mpeg');
      res.setHeader('Cache-Control', 'private, no-store');
      res.setHeader('Content-Disposition', dl === '1' ? `attachment; filename="call-recording-${id.slice(0, 8)}.mp3"` : 'inline');
      const buf = Buffer.from(await up.arrayBuffer());
      res.setHeader('Content-Length', String(buf.length));
      res.end(buf);
    } catch (e) { res.status(502).end(); console.warn('telecrm recording:', e.message); }
  });

  async function deleteRecording(rec, actorId) {
    const p = getProvider();
    if (p) await p.deleteRecording(rec.provider_recording_id);
    await db().from('tele_recordings').update({ status: 'deleted', deleted_at: new Date().toISOString() }).eq('id', rec.id);
    await audit(rec.company_id, actorId, actorId ? 'recording.deleted' : 'recording.expired', rec.id);
  }

  app.delete('/api/telecrm/recordings/:id', async (req, res) => {
    const me = await who(req, res); if (!me) return;
    if (!me.isManager) return res.status(403).json({ ok: false, error: 'Only a company admin or Tele CRM supervisor can delete recordings.' });
    try {
      const { data: r } = await db().from('tele_recordings').select('*').eq('id', req.params.id).eq('company_id', me.companyId).maybeSingle();
      if (!r) return res.status(404).json({ ok: false, error: 'Recording not found.' });
      if (r.status === 'available') await deleteRecording(r, me.id);
      res.json({ ok: true });
    } catch (e) { fail(res, e); }
  });

  app.get('/api/telecrm/cron/retention', async (req, res) => {
    const secret = String(process.env.CRON_SECRET || '');
    if (!secret || String(req.headers.authorization || '') !== `Bearer ${secret}`) return res.status(401).json({ ok: false });
    if (!db()) return res.status(503).json({ ok: false });
    try {
      const { data: due } = await db().from('tele_recordings').select('*').eq('status', 'available').lt('delete_after', new Date().toISOString()).limit(200);
      let n = 0;
      for (const r of due || []) { try { await deleteRecording(r, null); n += 1; } catch (e) { console.warn('telecrm retention:', e.message); } }
      res.json({ ok: true, deleted: n });
    } catch (e) { fail(res, e); }
  });

  // ------------------------------------------------------------------ webhooks
  /** Signature check + parsed params; answers 403 itself when the request is not from the provider. */
  function hook(req, res) {
    const p = getProvider();
    if (!p || !db()) { res.status(503).type('text/plain').send('not configured'); return null; }
    const params = req.body || {};
    const host = req.headers['x-forwarded-host'] || req.headers.host;
    const candidates = [`${PUBLIC_URL()}${req.originalUrl}`, `https://${host}${req.originalUrl}`];
    if (!candidates.some((u) => p.verifyWebhook(u, params, req.headers))) { res.status(403).type('text/plain').send('bad signature'); return null; }
    return { p, params };
  }
  const xml = (res, p, body) => res.status(200).type(p.contentType).send(body);

  /** true the first time an event is seen; false when the provider sends it again (retry). */
  async function firstTime(provider, companyId, key) {
    const { error } = await db().from('tele_webhook_events').insert({ company_id: companyId, provider, event_key: key.slice(0, 300) });
    if (!error) return true;
    if (error.code === '23505') return false;
    throw error;
  }

  async function findContact(companyId, number, contactId) {
    if (contactId) {
      const { data } = await db().from('tele_contacts').select('id, assigned_user_id, contact_type, status').eq('company_id', companyId).eq('id', contactId).maybeSingle();
      if (data) return data;
    }
    const key = phoneKey(number);
    if (key.length < 6) return null;
    const { data } = await db().from('tele_contacts').select('id, assigned_user_id, contact_type, status').eq('company_id', companyId).eq('phone_key', key).order('updated_at', { ascending: false }).limit(1);
    return (data || [])[0] || null;
  }

  async function routePlan(companyId, numberId, contact, s) {
    const { data: agents } = await db().from('tele_agents').select('*').eq('company_id', companyId).eq('active', true).eq('can_receive', true);
    let pool = (agents || []).filter((a) => a.presence === 'available' && reachOf(a));
    const { data: rules } = await db().from('tele_routing_rules').select('*').eq('company_id', companyId).eq('active', true).order('priority');
    const rule = (rules || []).find((r) => (!r.number_id || r.number_id === numberId) && (!r.contact_type || (contact && r.contact_type === contact.contact_type)));
    if (rule && rule.agent_user_ids && rule.agent_user_ids.length) {
      const allowed = new Set(rule.agent_user_ids);
      const narrowed = pool.filter((a) => allowed.has(a.user_id));
      if (narrowed.length) pool = narrowed;
    }
    const ids = pool.map((a) => a.user_id);
    if (!ids.length) return [];
    if (s.routing_mode === 'round_robin') {
      return pool.slice().sort((a, b) => String(a.last_assigned_at || '').localeCompare(String(b.last_assigned_at || ''))).slice(0, 4).map((a) => [a.user_id]);
    }
    if (s.routing_mode === 'assigned_then_all' && contact && contact.assigned_user_id && ids.includes(contact.assigned_user_id)) {
      const rest = ids.filter((x) => x !== contact.assigned_user_id);
      return rest.length ? [[contact.assigned_user_id], rest] : [[contact.assigned_user_id]];
    }
    return [ids];
  }

  /** How an incoming call reaches an agent: their verified mobile, or the browser phone (when it is set up). */
  function reachOf(a) {
    const p = getProvider();
    const mobileOk = a.mobile_status === 'verified' && !!a.mobile_e164;
    const browserOk = !!(p && p.browserCalling);
    if (mobileOk && (a.call_via !== 'browser' || !browserOk)) return { mobile: a.mobile_e164 };
    return browserOk ? { browser: true } : null;
  }
  /** Ring instructions for one routing step (user ids) of a call. */
  async function ringTargets(p, call, userIds) {
    const { data: rows } = await db().from('tele_agents').select('*').eq('company_id', call.company_id).in('user_id', userIds.length ? userIds : ['00000000-0000-0000-0000-000000000000']);
    const identities = []; const mobiles = [];
    for (const a of rows || []) {
      const r = reachOf(a);
      if (r && r.mobile) mobiles.push({ number: r.mobile, statusUrl: url('leg', { call: call.id, agent: a.user_id }), screenUrl: url('screen', { call: call.id, agent: a.user_id }) });
      else if (r && r.browser) identities.push(p.identityFor(a.user_id));
    }
    return { identities, mobiles };
  }

  async function missedFollowup(call, s) {
    if (!s.missed_call_followup || !call.contact_id) return;
    const { data: c } = await db().from('tele_contacts').select('assigned_user_id').eq('id', call.contact_id).maybeSingle();
    await db().from('tele_followups').insert({ company_id: call.company_id, contact_id: call.contact_id, call_id: call.id, assigned_user_id: (c && c.assigned_user_id) || null, due_at: new Date(Date.now() + 30 * 60000).toISOString(), note: 'Missed call: call back' });
  }

  /** Moves a call forward (never backwards; a finished call stays finished). */
  async function advance(call, patch) {
    const next = { ...patch, updated_at: new Date().toISOString() };
    if (patch.status) {
      if (TERMINAL.has(call.status)) delete next.status;
      else if (!TERMINAL.has(patch.status) && (RANK[patch.status] ?? 0) < (RANK[call.status] ?? 0)) delete next.status;
    }
    await db().from('tele_calls').update(next).eq('id', call.id);
    return { ...call, ...next };
  }

  app.post('/api/telecrm/hooks/voice', async (req, res) => {
    const h = hook(req, res); if (!h) return;
    const { p, params } = h;
    const v = p.readVoice(params);
    try {
      // ---- telecaller in the browser calling a customer
      if (v.fromAgent) {
        const { data: agentRows } = await db().from('tele_agents').select('company_id, active, can_call_out').eq('user_id', v.fromAgent).eq('active', true);
        const { data: person } = await db().from('company_users').select('status, role, company_id, active_company_id').eq('id', v.fromAgent).maybeSingle();
        const wanted = person && (person.role === 'SUPER_ADMIN' ? person.active_company_id : person.company_id);
        const agent = (agentRows || []).find((a) => a.company_id === wanted) || null;
        if (!person || person.status !== 'Active' || !agent || !agent.can_call_out) return xml(res, p, p.xmlSay('You are not allowed to make calls.'));
        const companyId = agent.company_id;
        const to = toE164(v.custom.target || v.to);
        if (!to) return xml(res, p, p.xmlSay('That phone number is not valid.'));
        const { data: nums } = await db().from('tele_numbers').select('id, e164, is_default').eq('company_id', companyId).eq('active', true);
        const num = (nums || []).find((n) => n.is_default) || (nums || [])[0];
        if (!num) return xml(res, p, p.xmlSay('No business number is connected for this company.'));
        const contact = await findContact(companyId, to, v.custom.contactId);
        if (contact && contact.status === 'Do not call') return xml(res, p, p.xmlSay('This contact is marked do not call.'));
        const s = await settingsOf(companyId);
        const { data: ins, error } = await db().from('tele_calls').upsert({
          company_id: companyId, provider: p.id, provider_call_id: v.callId, direction: 'outbound', status: 'initiated',
          from_number: num.e164, to_number: to, customer_number: to, number_id: num.id, contact_id: contact ? contact.id : null, agent_user_id: v.fromAgent,
        }, { onConflict: 'provider,provider_call_id' }).select('id').single();
        if (error) throw error;
        return xml(res, p, p.xmlOutbound({
          callerId: num.e164, to, record: s.record_calls,
          announceUrl: s.record_calls && s.announce_recording ? url('announce', { company: companyId }) : undefined,
          actionUrl: url('dial', { call: ins.id, stage: 0 }), legStatusUrl: url('leg', { call: ins.id }), recordingUrl: url('recording', { call: ins.id }),
        }));
      }

      // ---- customer calling the company's cloud number
      const to = toE164(v.to);
      const { data: num } = await db().from('tele_numbers').select('id, company_id, e164').eq('e164', to).eq('active', true).maybeSingle();
      if (!num) return xml(res, p, p.xmlSay('This number is not in service.'));
      const companyId = num.company_id;
      const s = await settingsOf(companyId);
      const contact = await findContact(companyId, v.customerNumber);
      const plan = await routePlan(companyId, num.id, contact, s);
      const { data: existing } = await db().from('tele_calls').select('*').eq('provider', p.id).eq('provider_call_id', v.callId).maybeSingle();
      const call = existing || (await db().from('tele_calls').insert({
        company_id: companyId, provider: p.id, provider_call_id: v.callId, direction: 'inbound', status: plan.length ? 'ringing' : 'missed',
        from_number: v.from, to_number: num.e164, customer_number: toE164(v.from) || v.from, number_id: num.id, contact_id: contact ? contact.id : null,
        route_plan: plan, ended_at: plan.length ? null : new Date().toISOString(),
      }).select('*').single()).data;
      if (!call) throw new Error('Could not save the call.');
      if (!plan.length) {
        if (!existing) await missedFollowup(call, s);
        return xml(res, p, p.xmlSay(BUSY_TEXT));
      }
      return xml(res, p, p.xmlInbound({
        ...(await ringTargets(p, call, plan[0])), callerId: call.customer_number, callRef: call.id,
        announce: s.record_calls && s.announce_recording ? s.announcement_text : '', record: s.record_calls, timeout: s.ring_seconds,
        actionUrl: url('dial', { call: call.id, stage: 0 }), legStatusUrl: url('leg', { call: call.id }), recordingUrl: url('recording', { call: call.id }),
      }));
    } catch (e) {
      console.warn('telecrm voice:', e.message);
      return xml(res, p, p.xmlSay('Sorry, we cannot take your call right now. Please try again later.'));
    }
  });

  // the <Dial> ended: answered and finished, or nobody answered (ring the next group / mark missed)
  app.post('/api/telecrm/hooks/dial', async (req, res) => {
    const h = hook(req, res); if (!h) return;
    const { p, params } = h;
    const r = p.readDialResult(params);
    try {
      const { data: call } = await db().from('tele_calls').select('*').eq('id', String(req.query.call || '')).maybeSingle();
      if (!call) return xml(res, p, p.xmlEmpty());
      const stage = Number(req.query.stage || 0) || 0;
      if (!(await firstTime(p.id, call.company_id, `dial:${call.id}:${stage}:${r.rawStatus}`))) return xml(res, p, p.xmlEmpty());
      const s = await settingsOf(call.company_id);
      if (r.dialStatus === 'completed' || r.dialStatus === 'in-progress') {
        if (call.transferred_to && call.direction === 'outbound') return xml(res, p, p.xmlEmpty());   // the customer was moved to a colleague
        await advance(call, { status: 'completed', duration_seconds: Math.max(call.duration_seconds || 0, r.duration), ended_at: new Date().toISOString(), ...(r.legId && !call.provider_leg_id ? { provider_leg_id: r.legId } : {}) });
        return xml(res, p, p.xmlEmpty());
      }
      const plan = Array.isArray(call.route_plan) ? call.route_plan : [];
      if (call.direction === 'inbound' && stage + 1 < plan.length && !TERMINAL.has(call.status)) {
        return xml(res, p, p.xmlInbound({
          ...(await ringTargets(p, call, plan[stage + 1])), callerId: call.customer_number, callRef: call.id, record: s.record_calls, timeout: s.ring_seconds,
          actionUrl: url('dial', { call: call.id, stage: stage + 1 }), legStatusUrl: url('leg', { call: call.id }), recordingUrl: url('recording', { call: call.id }),
        }));
      }
      const status = call.direction === 'inbound' ? 'missed' : (r.dialStatus === 'missed' ? 'missed' : (TERMINAL.has(r.dialStatus) ? r.dialStatus : 'failed'));
      const updated = await advance(call, { status, ended_at: new Date().toISOString() });
      if (call.direction === 'inbound' && !TERMINAL.has(call.status)) await missedFollowup(updated, s);
      return xml(res, p, call.direction === 'inbound' ? p.xmlSay(BUSY_TEXT) : p.xmlEmpty());
    } catch (e) {
      console.warn('telecrm dial:', e.message);
      return xml(res, p, p.xmlEmpty());
    }
  });

  // status of the second leg: the customer's phone (outgoing) or a telecaller's browser (incoming / transfer)
  app.post('/api/telecrm/hooks/leg', async (req, res) => {
    const h = hook(req, res); if (!h) return;
    const { p, params } = h;
    const st = p.readStatus(params);
    const viaMobile = /^[0-9a-f-]{36}$/i.test(String(req.query.agent || ''));
    if (viaMobile) st.toAgent = String(req.query.agent);
    try {
      const { data: call } = await db().from('tele_calls').select('*').eq('id', String(req.query.call || '')).maybeSingle();
      if (!call) return res.status(200).end();
      if (!(await firstTime(p.id, call.company_id, `leg:${st.callId}:${st.rawStatus}:${st.seq}`))) return res.status(200).end();
      const now = new Date().toISOString();
      if (call.direction === 'outbound' && !st.toAgent) {
        const base = call.provider_leg_id ? {} : { provider_leg_id: st.callId };
        if (st.status === 'ringing') await advance(call, { ...base, status: 'ringing' });
        else if (st.status === 'in-progress') await advance(call, { ...base, status: 'in-progress', answered_at: call.answered_at || now });
        else if (TERMINAL.has(st.status)) await advance(call, { ...base, status: call.answered_at || st.duration > 0 ? 'completed' : st.status, duration_seconds: Math.max(call.duration_seconds || 0, st.duration), ended_at: now });
        return res.status(200).end();
      }
      // a telecaller's leg (browser, or own mobile: there the press-1 screen marks it answered)
      if (st.status === 'in-progress' && st.toAgent && !viaMobile) {
        if (call.transferred_to && call.transferred_to === st.toAgent) {
          await advance(call, { status: 'in-progress' });
        } else if (!call.agent_user_id || call.agent_user_id === st.toAgent || call.direction === 'inbound') {
          await advance(call, { status: 'in-progress', agent_user_id: call.agent_user_id || st.toAgent, answered_at: call.answered_at || now, ring_seconds: Math.max(0, Math.round((Date.now() - Date.parse(call.started_at)) / 1000)) });
          await db().from('tele_agents').update({ last_assigned_at: now }).eq('company_id', call.company_id).eq('user_id', st.toAgent);
        }
      } else if (TERMINAL.has(st.status) && st.toAgent && (st.toAgent === call.transferred_to || (st.toAgent === call.agent_user_id && !call.transferred_to)) && call.answered_at) {
        await advance(call, { status: 'completed', duration_seconds: Math.max(call.duration_seconds || 0, Math.round((Date.now() - Date.parse(call.answered_at)) / 1000)), ended_at: now });
      }
      return res.status(200).end();
    } catch (e) { console.warn('telecrm leg:', e.message); return res.status(200).end(); }
  });

  // status of the first leg (the number's / app's status callback): caller hung up while ringing, etc.
  app.post('/api/telecrm/hooks/status', async (req, res) => {
    const h = hook(req, res); if (!h) return;
    const { p, params } = h;
    const st = p.readStatus(params);
    try {
      let call = null;
      if (req.query.call) {   // bridge calls name their record (the provider id may not be saved yet)
        const { data } = await db().from('tele_calls').select('*').eq('id', String(req.query.call)).maybeSingle();
        if (data && (data.provider_call_id === st.callId || data.provider_call_id.startsWith('pending:'))) call = data;
      } else {
        const { data } = await db().from('tele_calls').select('*').eq('provider', p.id).eq('provider_call_id', st.callId).maybeSingle();
        call = data;
      }
      if (!call) return res.status(200).end();
      if (!(await firstTime(p.id, call.company_id, `status:${st.callId}:${st.rawStatus}:${st.seq}`))) return res.status(200).end();
      if (call.provider_call_id.startsWith('pending:')) { await db().from('tele_calls').update({ provider_call_id: st.callId }).eq('id', call.id); call.provider_call_id = st.callId; }
      // bridge: the agent's mobile is ringing (Connected comes only when the customer answers, from the customer leg)
      if (call.call_mode === 'bridge' && (st.status === 'ringing' || st.status === 'in-progress')) { await advance(call, { status: 'ringing' }); return res.status(200).end(); }
      if (TERMINAL.has(st.status) && !TERMINAL.has(call.status)) {
        const s = await settingsOf(call.company_id);
        const answered = !!call.answered_at;
        const status = answered ? 'completed' : call.direction === 'inbound' ? 'missed' : (st.status === 'completed' ? 'cancelled' : st.status);
        const updated = await advance(call, { status, ended_at: new Date().toISOString(), ...(answered ? { duration_seconds: Math.max(call.duration_seconds || 0, Math.round((Date.now() - Date.parse(call.answered_at)) / 1000)) } : {}) });
        if (!answered && call.direction === 'inbound') await missedFollowup(updated, s);
      }
      return res.status(200).end();
    } catch (e) { console.warn('telecrm status:', e.message); return res.status(200).end(); }
  });

  app.post('/api/telecrm/hooks/recording', async (req, res) => {
    const h = hook(req, res); if (!h) return;
    const { p, params } = h;
    const r = p.readRecording(params);
    try {
      const { data: call } = await db().from('tele_calls').select('id, company_id').eq('id', String(req.query.call || '')).maybeSingle();
      if (!call || !r.recordingId) return res.status(200).end();
      if (r.status && r.status !== 'completed') return res.status(200).end();
      const s = await settingsOf(call.company_id);
      const { error } = await db().from('tele_recordings').upsert({
        company_id: call.company_id, call_id: call.id, provider: p.id, provider_recording_id: r.recordingId,
        duration_seconds: r.duration, channels: r.channels, status: 'available',
        delete_after: new Date(Date.now() + (Number(s.retention_days) || 90) * 86400000).toISOString(),
      }, { onConflict: 'provider,provider_recording_id', ignoreDuplicates: true });
      if (error) throw error;
      return res.status(200).end();
    } catch (e) { console.warn('telecrm recording hook:', e.message); return res.status(500).end(); }   // 500 = provider retries
  });

  // bridge: the agent answered their mobile -> ask for "1" so a voicemail box is never connected to the customer
  app.post('/api/telecrm/hooks/bridge', async (req, res) => {
    const h = hook(req, res); if (!h) return;
    const { p } = h;
    try {
      const { data: call } = await db().from('tele_calls').select('id, status').eq('id', String(req.query.call || '')).maybeSingle();
      if (!call || TERMINAL.has(call.status)) return xml(res, p, p.xmlSay('This call was cancelled.'));
      return xml(res, p, p.xmlConfirm({ actionUrl: url('bridge-go', { call: call.id }) }));
    } catch (e) { console.warn('telecrm bridge:', e.message); return xml(res, p, p.xmlSay('Sorry, the call could not be connected.')); }
  });

  // bridge: the agent pressed a key -> dial the customer (same call steps as a browser call: leg / dial / recording hooks)
  app.post('/api/telecrm/hooks/bridge-go', async (req, res) => {
    const h = hook(req, res); if (!h) return;
    const { p, params } = h;
    try {
      const { data: call } = await db().from('tele_calls').select('*').eq('id', String(req.query.call || '')).maybeSingle();
      if (!call || TERMINAL.has(call.status)) return xml(res, p, p.xmlSay('This call was cancelled.'));
      if (p.readDigits(params) !== '1') return xml(res, p, p.xmlSay('Call not connected. Goodbye.'));
      const s = await settingsOf(call.company_id);
      return xml(res, p, p.xmlOutbound({
        callerId: call.from_number, to: call.customer_number, record: s.record_calls,
        announceUrl: s.record_calls && s.announce_recording ? url('announce', { company: call.company_id }) : undefined,
        actionUrl: url('dial', { call: call.id, stage: 0 }), legStatusUrl: url('leg', { call: call.id }), recordingUrl: url('recording', { call: call.id }),
      }));
    } catch (e) { console.warn('telecrm bridge-go:', e.message); return xml(res, p, p.xmlSay('Sorry, the call could not be connected.')); }
  });

  // the provider finished verifying an agent's mobile
  app.post('/api/telecrm/hooks/verify', async (req, res) => {
    const h = hook(req, res); if (!h) return;
    const { p, params } = h;
    try {
      const v = p.readVerification(params);
      const { data: agent } = await db().from('tele_agents').select('id, company_id, user_id, mobile_e164').eq('id', String(req.query.agent || '')).maybeSingle();
      if (!agent || !agent.mobile_e164) return res.status(200).end();
      if (!(await firstTime(p.id, agent.company_id, 'verify:' + agent.id + ':' + agent.mobile_e164 + ':' + v.status))) return res.status(200).end();
      const ok = v.status === 'success' || v.status === 'verified';
      await db().from('tele_agents').update(ok ? { mobile_status: 'verified', mobile_verified_at: new Date().toISOString() } : { mobile_status: 'none' }).eq('id', agent.id);
      await audit(agent.company_id, agent.user_id, ok ? 'mobile.verified' : 'mobile.verification_failed', agent.mobile_e164);
      return res.status(200).end();
    } catch (e) { console.warn('telecrm verify:', e.message); return res.status(500).end(); }
  });

  // incoming call reached an agent's own mobile: ask for 1 (voicemail never takes the customer's call)
  app.post('/api/telecrm/hooks/screen', async (req, res) => {
    const h = hook(req, res); if (!h) return;
    const { p } = h;
    const q = { call: String(req.query.call || ''), agent: String(req.query.agent || '') };
    if (req.query.transfer) q.transfer = '1';
    return xml(res, p, p.xmlScreen({ actionUrl: url('screen-ok', q) }));
  });

  app.post('/api/telecrm/hooks/screen-ok', async (req, res) => {
    const h = hook(req, res); if (!h) return;
    const { p, params } = h;
    try {
      const agentId = String(req.query.agent || '');
      const { data: call } = await db().from('tele_calls').select('*').eq('id', String(req.query.call || '')).maybeSingle();
      if (!call || p.readDigits(params) !== '1') return xml(res, p, p.xmlSay('', true));
      const now = new Date().toISOString();
      if (req.query.transfer) {
        await advance(call, { status: 'in-progress' });
      } else {
        if (call.answered_at && call.agent_user_id && call.agent_user_id !== agentId) return xml(res, p, p.xmlSay('This call was already answered by a colleague.'));
        await advance(call, { status: 'in-progress', agent_user_id: agentId, answered_at: call.answered_at || now, ring_seconds: Math.max(0, Math.round((Date.now() - Date.parse(call.started_at)) / 1000)) });
        await db().from('tele_agents').update({ last_assigned_at: now }).eq('company_id', call.company_id).eq('user_id', agentId);
      }
      return xml(res, p, p.xmlEmpty());   // empty instructions = connect this phone to the customer
    } catch (e) { console.warn('telecrm screen:', e.message); return xml(res, p, p.xmlSay('', true)); }
  });

  // played to the customer when they answer an outgoing call (recording announcement)
  app.post('/api/telecrm/hooks/announce', async (req, res) => {
    const h = hook(req, res); if (!h) return;
    const { p } = h;
    try {
      const s = await settingsOf(String(req.query.company || ''));
      return xml(res, p, p.xmlAnnounce(s.announce_recording ? s.announcement_text : ''));
    } catch { return xml(res, p, p.xmlAnnounce('')); }
  });
};

module.exports.toE164 = toE164;
module.exports.phoneKey = phoneKey;
