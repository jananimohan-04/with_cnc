/* Tele CRM adapter: Twilio Programmable Voice (browser calling with the Voice SDK, numbers, recordings, transfer).
 *
 * Environment variables (server only):
 *   TWILIO_ACCOUNT_SID      AC...  account
 *   TWILIO_AUTH_TOKEN       used for webhook signatures and the REST calls
 *   TWILIO_API_KEY_SID      SK...  signing key for browser phone tokens
 *   TWILIO_API_KEY_SECRET
 *   TWILIO_TWIML_APP_SID    AP...  "TwiML App" whose Voice URL is  <TELECRM_PUBLIC_URL>/api/telecrm/hooks/voice
 *   TWILIO_EDGE             optional, e.g. "singapore" (closest media edge for India)
 * No SDK dependency: tokens, signatures and REST calls are plain HTTPS + crypto.
 */
'use strict';
const crypto = require('crypto');

const env = (k) => String(process.env[k] || '').trim();
const REQUIRED = ['TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'TWILIO_API_KEY_SID', 'TWILIO_API_KEY_SECRET', 'TWILIO_TWIML_APP_SID'];
const API = () => `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(env('TWILIO_ACCOUNT_SID'))}`;
const basic = () => 'Basic ' + Buffer.from(`${env('TWILIO_ACCOUNT_SID')}:${env('TWILIO_AUTH_TOKEN')}`).toString('base64');

const b64url = (buf) => Buffer.from(buf).toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
const attrs = (o) => Object.entries(o).filter(([, v]) => v !== undefined && v !== null && v !== '').map(([k, v]) => ` ${k}="${esc(v)}"`).join('');

async function rest(method, path, form) {
  const init = { method, headers: { Authorization: basic() } };
  if (form) {
    init.headers['content-type'] = 'application/x-www-form-urlencoded';
    init.body = new URLSearchParams(form).toString();
  }
  const res = await fetch(`${API()}${path}`, init);
  if (!res.ok && res.status !== 204) {
    const t = await res.text().catch(() => '');
    let msg = '';
    try { msg = JSON.parse(t).message || ''; } catch { /* text */ }
    const err = new Error(msg || `The phone provider answered ${res.status}.`);
    err.status = res.status;
    throw err;
  }
  return res;
}

const identityFor = (userId) => `u_${String(userId).replace(/-/g, '')}`;
function userFromIdentity(identity) {
  const m = /^(?:client:)?u_([0-9a-f]{32})$/i.exec(String(identity || ''));
  if (!m) return null;
  const h = m[1].toLowerCase();
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

const STATUS = {   // provider status -> ours
  queued: 'initiated', initiated: 'initiated', ringing: 'ringing', 'in-progress': 'in-progress', answered: 'in-progress',
  completed: 'completed', busy: 'busy', failed: 'failed', 'no-answer': 'missed', canceled: 'cancelled',
};

module.exports = {
  id: 'twilio',
  label: 'Twilio Programmable Voice',
  browserCalling: true,
  identityFor,
  userFromIdentity,

  missingConfig: () => REQUIRED.filter((k) => !env(k)),

  /** Access token for the browser Voice SDK (HS256 JWT, Twilio "fpa" format). */
  clientToken(identity, ttl = 3600) {
    const now = Math.floor(Date.now() / 1000);
    const header = { typ: 'JWT', alg: 'HS256', cty: 'twilio-fpa;v=1' };
    const payload = {
      jti: `${env('TWILIO_API_KEY_SID')}-${now}`,
      iss: env('TWILIO_API_KEY_SID'),
      sub: env('TWILIO_ACCOUNT_SID'),
      iat: now,
      nbf: now - 5,
      exp: now + ttl,
      grants: {
        identity,
        voice: { incoming: { allow: true }, outgoing: { application_sid: env('TWILIO_TWIML_APP_SID') } },
      },
    };
    const body = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(payload))}`;
    const sig = b64url(crypto.createHmac('sha256', env('TWILIO_API_KEY_SECRET')).update(body).digest());
    return { token: `${body}.${sig}`, expiresIn: ttl, edge: env('TWILIO_EDGE') || undefined };
  },

  /** X-Twilio-Signature = base64(HMAC-SHA1(auth token, full URL + sorted POST key/values)). */
  verifyWebhook(fullUrl, params, headers) {
    const given = String(headers['x-twilio-signature'] || '');
    if (!given || !env('TWILIO_AUTH_TOKEN')) return false;
    const data = fullUrl + Object.keys(params || {}).sort().map((k) => k + (Array.isArray(params[k]) ? params[k].join('') : String(params[k] ?? ''))).join('');
    const want = crypto.createHmac('sha1', env('TWILIO_AUTH_TOKEN')).update(Buffer.from(data, 'utf8')).digest('base64');
    const a = Buffer.from(given);
    const b = Buffer.from(want);
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  },

  readVoice(p) {
    const from = String(p.From || p.Caller || '');
    const to = String(p.To || p.Called || '');
    const fromAgent = userFromIdentity(from);
    const custom = {};
    for (const k of ['contactId', 'target']) if (p[k]) custom[k] = String(p[k]);
    return {
      callId: String(p.CallSid || ''),
      from,
      to,
      fromAgent,                                   // set = a telecaller dialling out from the browser
      customerNumber: fromAgent ? to : from,
      custom,
    };
  },

  readStatus(p) {
    const raw = String(p.CallStatus || '').toLowerCase();
    return {
      callId: String(p.CallSid || ''),
      parentCallId: String(p.ParentCallSid || ''),
      rawStatus: raw,
      status: STATUS[raw] || raw,
      duration: Number(p.CallDuration || p.Duration || 0) || 0,
      seq: String(p.SequenceNumber || ''),
      toAgent: userFromIdentity(p.To || ''),
    };
  },

  readDialResult(p) {
    const raw = String(p.DialCallStatus || '').toLowerCase();
    return {
      callId: String(p.CallSid || ''),
      legId: String(p.DialCallSid || ''),
      rawStatus: raw,
      dialStatus: STATUS[raw] || raw,
      duration: Number(p.DialCallDuration || 0) || 0,
    };
  },

  readRecording(p) {
    return {
      recordingId: String(p.RecordingSid || ''),
      callId: String(p.CallSid || ''),
      duration: Number(p.RecordingDuration || 0) || 0,
      status: String(p.RecordingStatus || '').toLowerCase(),
      channels: Number(p.RecordingChannels || 1) || 1,
    };
  },

  /** Telecaller in the browser -> customer's phone. */
  xmlOutbound({ callerId, to, record, announceUrl, actionUrl, legStatusUrl, recordingUrl, timeout = 45 }) {
    return `<?xml version="1.0" encoding="UTF-8"?><Response><Dial${attrs({
      callerId, answerOnBridge: 'true', timeout,
      record: record ? 'record-from-answer-dual' : undefined,
      recordingStatusCallback: record ? recordingUrl : undefined,
      recordingStatusCallbackMethod: record ? 'POST' : undefined,
      recordingStatusCallbackEvent: record ? 'completed' : undefined,
      action: actionUrl, method: 'POST',
    })}><Number${attrs({
      statusCallback: legStatusUrl, statusCallbackMethod: 'POST', statusCallbackEvent: 'initiated ringing answered completed',
      url: announceUrl, method: announceUrl ? 'POST' : undefined,
    })}>${esc(to)}</Number></Dial></Response>`;
  },

  /** Customer -> ring these telecallers' browsers (all at once). */
  xmlInbound({ identities, announce, record, actionUrl, legStatusUrl, recordingUrl, timeout = 25, callerId, callRef }) {
    const clients = identities.map((id) => `<Client${attrs({ statusCallback: legStatusUrl, statusCallbackMethod: 'POST', statusCallbackEvent: 'ringing answered completed' })}><Identity>${esc(id)}</Identity><Parameter name="callerNumber" value="${esc(callerId || '')}"/><Parameter name="callRef" value="${esc(callRef || '')}"/></Client>`).join('');
    return `<?xml version="1.0" encoding="UTF-8"?><Response>${announce ? `<Say>${esc(announce)}</Say>` : ''}<Dial${attrs({
      answerOnBridge: 'true', timeout,
      record: record ? 'record-from-answer-dual' : undefined,
      recordingStatusCallback: record ? recordingUrl : undefined,
      recordingStatusCallbackMethod: record ? 'POST' : undefined,
      recordingStatusCallbackEvent: record ? 'completed' : undefined,
      action: actionUrl, method: 'POST',
    })}>${clients}</Dial></Response>`;
  },

  /** Ring one telecaller or an outside number for a transfer (the customer stays on the line). */
  xmlTransfer({ identity, number, callerId, record, recordingUrl, legStatusUrl, callRef, customer }) {
    const target = identity
      ? `<Client${attrs({ statusCallback: legStatusUrl, statusCallbackMethod: 'POST', statusCallbackEvent: 'answered completed' })}><Identity>${esc(identity)}</Identity><Parameter name="callRef" value="${esc(callRef || '')}"/><Parameter name="callerNumber" value="${esc(customer || '')}"/><Parameter name="transfer" value="1"/></Client>`
      : `<Number>${esc(number)}</Number>`;
    return `<?xml version="1.0" encoding="UTF-8"?><Response><Dial${attrs({
      callerId: number ? callerId : undefined, answerOnBridge: 'true', timeout: 30,
      record: record ? 'record-from-answer-dual' : undefined,
      recordingStatusCallback: record ? recordingUrl : undefined,
      recordingStatusCallbackMethod: record ? 'POST' : undefined,
    })}>${target}</Dial></Response>`;
  },

  xmlSay: (text, hangup = true) => `<?xml version="1.0" encoding="UTF-8"?><Response>${text ? `<Say>${esc(text)}</Say>` : ''}${hangup ? '<Hangup/>' : ''}</Response>`,
  xmlAnnounce: (text) => `<?xml version="1.0" encoding="UTF-8"?><Response>${text ? `<Say>${esc(text)}</Say>` : ''}</Response>`,
  xmlEmpty: () => '<?xml version="1.0" encoding="UTF-8"?><Response/>',

  /* ---- bridge calling: Twilio calls the agent's mobile first; when the agent presses 1 the customer is dialled ---- */
  bridgeCalling: true,

  /** Starts the agent leg (REST "create call"). Twilio fetches `url` when the agent answers. */
  async createCall({ to, from, url, statusUrl, timeout = 30 }) {
    const form = new URLSearchParams({ To: to, From: from, Url: url, Method: 'POST', StatusCallback: statusUrl, StatusCallbackMethod: 'POST', Timeout: String(timeout) });
    for (const ev of ['initiated', 'ringing', 'answered', 'completed']) form.append('StatusCallbackEvent', ev);
    const res = await rest('POST', '/Calls.json', form);
    const j = await res.json();
    return { callId: String(j.sid || '') };
  },

  /** Agent answered: confirm with a key press, so a voicemail box is never connected to the customer. */
  xmlConfirm: ({ actionUrl }) => `<?xml version="1.0" encoding="UTF-8"?><Response><Gather${attrs({ numDigits: 1, timeout: 8, action: actionUrl, method: 'POST' })}><Say>Tele C R M call. Press 1 to connect to the customer.</Say></Gather><Say>No key was pressed. Goodbye.</Say><Hangup/></Response>`,
  readDigits: (p) => String(p.Digits || ''),

  /** Caller-ID verification: Twilio phones the number and the person types the returned code on the keypad. */
  async startNumberVerification(e164, label, statusUrl) {
    try {
      const res = await rest('POST', '/OutgoingCallerIds.json', { PhoneNumber: e164, FriendlyName: String(label || e164).slice(0, 60), StatusCallback: statusUrl, StatusCallbackMethod: 'POST' });
      const j = await res.json();
      return { code: String(j.validation_code || ''), already: false };
    } catch (e) {
      if (await module.exports.isNumberVerified(e164)) return { code: '', already: true };   // e.g. already verified in the account
      throw e;
    }
  },
  async isNumberVerified(e164) {
    const res = await rest('GET', `/OutgoingCallerIds.json?PhoneNumber=${encodeURIComponent(e164)}`);
    const j = await res.json();
    return (j.outgoing_caller_ids || []).some((x) => x.phone_number === e164);
  },
  readVerification: (p) => ({ status: String(p.VerificationStatus || '').toLowerCase(), phone: String(p.To || p.Called || p.PhoneNumber || '') }),
  contentType: 'text/xml',

  recordingAudio: (recordingId) => rest('GET', `/Recordings/${encodeURIComponent(recordingId)}.mp3`),
  deleteRecording: async (recordingId) => {
    try { await rest('DELETE', `/Recordings/${encodeURIComponent(recordingId)}.json`); }
    catch (e) { if (e.status !== 404) throw e; }   // already gone
  },
  redirectLeg: (legId, xml) => rest('POST', `/Calls/${encodeURIComponent(legId)}.json`, { Twiml: xml }),
  hangupLeg: (legId) => rest('POST', `/Calls/${encodeURIComponent(legId)}.json`, { Status: 'completed' }),

  async findNumber(e164) {
    const res = await rest('GET', `/IncomingPhoneNumbers.json?PhoneNumber=${encodeURIComponent(e164)}`);
    const j = await res.json();
    const n = (j.incoming_phone_numbers || [])[0];
    return n ? { ref: n.sid, e164: n.phone_number, name: n.friendly_name || '' } : null;
  },
  pointNumber: (ref, voiceUrl, statusUrl) => rest('POST', `/IncomingPhoneNumbers/${encodeURIComponent(ref)}.json`, {
    VoiceUrl: voiceUrl, VoiceMethod: 'POST', StatusCallback: statusUrl, StatusCallbackMethod: 'POST',
  }),
};
