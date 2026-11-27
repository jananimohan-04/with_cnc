/**
 * Leads CRM lead capture: the providers (ported from Argus Leads backend/app/services/integrations/*.py and
 * backend/app/config.py). Each provider knows which server settings it needs, its OAuth handshake and how its
 * lead payloads map onto crm_leads columns. Nothing here touches the database; see routes.cjs.
 *
 * Server settings (environment, same names as Argus Leads):
 *   META_APP_ID, META_APP_SECRET, META_WEBHOOK_VERIFY_TOKEN, META_API_VERSION (default v21.0), META_REDIRECT_URI
 *   LINKEDIN_CLIENT_ID, LINKEDIN_CLIENT_SECRET, LINKEDIN_REDIRECT_URI, LINKEDIN_ORGANIZATION_ID, LINKEDIN_WEBHOOK_KEY
 *   TOKEN_ENCRYPTION_KEY (Fernet key: provider tokens are stored encrypted, storage fails closed without it)
 *   OAUTH_STATE_TTL_SECONDS (default 600)
 *   PUBLIC_API_URL (this server's public address, default https://with-cnc.vercel.app) and FRONTEND_URL
 *   (where the OAuth callback sends the browser back to; default = PUBLIC_API_URL, since BI serves both).
 */
'use strict';
const crypto = require('crypto');

const env = (k) => String(process.env[k] || '').trim();
const PUBLIC_URL = () => (env('CRM_PUBLIC_URL') || env('PUBLIC_API_URL') || 'https://with-cnc.vercel.app').replace(/\/+$/, '');
const FRONTEND_URL = () => (env('CRM_FRONTEND_URL') || env('FRONTEND_URL') || PUBLIC_URL()).replace(/\/+$/, '');
const STATE_TTL = () => Math.min(3600, Math.max(60, parseInt(env('OAUTH_STATE_TTL_SECONDS') || '600', 10) || 600));
const META_VERSION = () => env('META_API_VERSION') || 'v21.0';

const PROVIDER_NAMES = ['facebook', 'instagram', 'linkedin', 'website_form'];
const OAUTH_PROVIDERS = ['facebook', 'instagram', 'linkedin'];

const GRAPH = 'https://graph.facebook.com';
const DIALOG = 'https://www.facebook.com';
const META_SCOPES = ['pages_show_list', 'pages_manage_metadata', 'pages_manage_ads', 'leads_retrieval', 'instagram_basic', 'instagram_manage_messages'];

const LI_AUTH = 'https://www.linkedin.com/oauth/v2/authorization';
const LI_TOKEN = 'https://www.linkedin.com/oauth/v2/accessToken';
const LI_USERINFO = 'https://api.linkedin.com/v2/userinfo';
const LI_SCOPES = ['openid', 'profile', 'email', 'w_organization_social', 'rw_organization_admin', 'w_member_social'];

/** An error with an HTTP status and a code, in the envelope the CRM pages understand. */
class CrmError extends Error {
  constructor(status, code, message, details) { super(message); this.status = status; this.code = code; this.details = details; }
}

// ------------------------------------------------------------------ http (readable provider errors)
async function handle(response) {
  let body;
  const text = await response.text();
  try { body = text ? JSON.parse(text) : {}; } catch { body = { raw: text.slice(0, 2000) }; }
  if (response.status >= 400) {
    const err = body && body.error;
    let message;
    let providerCode = null;
    if (err && typeof err === 'object') { message = err.message || response.statusText; providerCode = err.code || err.error || null; }
    else if (typeof err === 'string') message = body.error_description || err;
    else message = body.message || response.statusText || 'The provider rejected the request.';
    throw new CrmError(502, 'upstream_error', String(message), { status: response.status, provider_code: providerCode });
  }
  return body && typeof body === 'object' && !Array.isArray(body) ? body : { data: body };
}

async function call(url, init) {
  let response;
  try {
    response = await fetch(url, { ...init, signal: AbortSignal.timeout(20000) });
  } catch (e) {
    if (e && (e.name === 'TimeoutError' || e.name === 'AbortError')) throw new CrmError(504, 'upstream_timeout', 'The provider did not respond in time.');
    throw new CrmError(502, 'upstream_unreachable', 'Could not reach the provider.');
  }
  return handle(response);
}

const httpGet = (url, params) => call(params ? `${url}?${new URLSearchParams(params)}` : url, { method: 'GET' });
const httpPostForm = (url, form) => call(url, {
  method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(form).toString(),
});

const splitScopes = (v) => (Array.isArray(v) ? v.map(String) : String(v || '').replace(/,/g, ' ').split(/\s+/)).map((s) => s.trim()).filter(Boolean);

// ------------------------------------------------------------------ setup requirements
const req = (key, label, description) => ({ key, label, description, where_to_set: `Server settings → ${key}` });
const ENCRYPTION_REQ = req('TOKEN_ENCRYPTION_KEY', 'Token encryption key',
  'A random key the server uses to lock the stored sign-in tokens (32 random bytes in base64, for example from: openssl rand -base64 32). Kept on the server only.');

function metaMissing() {
  const out = [];
  if (!env('META_APP_ID')) out.push(req('META_APP_ID', 'Meta App ID', 'The numeric App ID from developers.facebook.com → Settings → Basic.'));
  if (!env('META_APP_SECRET')) out.push(req('META_APP_SECRET', 'Meta App Secret', 'The App Secret from the same page. Kept on the server only — never sent to the browser.'));
  if (!env('META_WEBHOOK_VERIFY_TOKEN')) {
    out.push(req('META_WEBHOOK_VERIFY_TOKEN', 'Webhook verify token',
      "An arbitrary shared string you invent. It must match the one entered in the Meta app's Webhooks → Edit subscription dialog."));
  }
  if (!env('TOKEN_ENCRYPTION_KEY')) out.push(ENCRYPTION_REQ);
  return out;
}

function linkedinMissing() {
  const out = [];
  if (!env('LINKEDIN_CLIENT_ID')) out.push(req('LINKEDIN_CLIENT_ID', 'LinkedIn Client ID', 'From developer.linkedin.com → Your app → Auth → Client ID.'));
  if (!env('LINKEDIN_CLIENT_SECRET')) out.push(req('LINKEDIN_CLIENT_SECRET', 'LinkedIn Client Secret', 'From the same Auth tab. Kept on the server only.'));
  if (!env('TOKEN_ENCRYPTION_KEY')) out.push(ENCRYPTION_REQ);
  return out;
}

// ------------------------------------------------------------------ redirect / webhook addresses
/** The exact redirect address to register at the provider; the handshake sends the same string. */
function redirectUri(provider) {
  if (provider === 'facebook' || provider === 'instagram') {
    const t = env('META_REDIRECT_URI');
    return t ? t.replace('{provider}', provider) : `${PUBLIC_URL()}/api/crm/oauth/${provider}/callback`;
  }
  if (provider === 'linkedin') return env('LINKEDIN_REDIRECT_URI') || `${PUBLIC_URL()}/api/crm/oauth/linkedin/callback`;
  return '';
}

function webhookUrl(provider) {
  if (provider === 'facebook' || provider === 'instagram') return `${PUBLIC_URL()}/api/crm/webhooks/meta`;
  if (provider === 'linkedin') return `${PUBLIC_URL()}/api/crm/webhooks/linkedin`;
  return '';
}

const websiteFormUrl = (companyId) => `${PUBLIC_URL()}/api/crm/webhooks/website-form/${companyId}`;

// ------------------------------------------------------------------ PKCE / state / secrets
function pkcePair() {
  const verifier = crypto.randomBytes(48).toString('base64url');
  const challenge = crypto.createHash('sha256').update(verifier, 'ascii').digest('base64url');
  return { verifier, challenge };
}
const newState = () => crypto.randomBytes(32).toString('base64url');
const newSigningSecret = () => 'whsec_' + crypto.randomBytes(32).toString('base64url');

/** Constant-time compare of two strings. */
function safeEqual(a, b) {
  const x = Buffer.from(String(a), 'utf8');
  const y = Buffer.from(String(b), 'utf8');
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

/** X-Hub-Signature-256: sha256=<hex HMAC-SHA256 of the raw body with META_APP_SECRET>. */
function verifyMetaSignature(raw, header, secret) {
  if (!header || !secret) return false;
  const h = String(header).trim();
  if (!h.startsWith('sha256=')) return false;
  const expected = crypto.createHmac('sha256', secret).update(raw).digest('hex');
  return safeEqual(expected, h.slice(7).trim());
}

/** X-Argus-Signature: sha256=<hex HMAC-SHA256 of the raw body with the company's signing secret>. */
function verifyFormSignature(secret, raw, header) {
  if (!secret || !header) return false;
  const expected = 'sha256=' + crypto.createHmac('sha256', secret).update(raw).digest('hex');
  return safeEqual(expected, String(header).trim());
}

// ------------------------------------------------------------------ the providers
function meta(name) {
  return {
    name,
    label: name === 'instagram' ? 'Instagram' : 'Facebook & Instagram (Meta)',
    documentation: 'https://developers.facebook.com/docs/lead-ads',
    missing: metaMissing,
    requiredScopes: META_SCOPES,
    authorizeUrl({ redirect, state }) {
      const q = new URLSearchParams({
        client_id: env('META_APP_ID'), redirect_uri: redirect, scope: META_SCOPES.join(','), state, response_type: 'code', auth_type: 'rerequest',
      });
      return `${DIALOG}/${META_VERSION()}/dialog/oauth?${q}`;
    },
    /** code -> short-lived token -> long-lived token -> the Pages the person can manage. */
    async exchange({ code, redirect }) {
      const v = META_VERSION();
      const short = await httpGet(`${GRAPH}/${v}/oauth/access_token`, {
        client_id: env('META_APP_ID'), client_secret: env('META_APP_SECRET'), redirect_uri: redirect, code,
      });
      if (!short.access_token) throw new CrmError(502, 'upstream_error', 'Meta did not return an access token.');
      const long = await httpGet(`${GRAPH}/${v}/oauth/access_token`, {
        grant_type: 'fb_exchange_token', client_id: env('META_APP_ID'), client_secret: env('META_APP_SECRET'), fb_exchange_token: short.access_token,
      });
      const token = long.access_token || short.access_token;
      const expiresIn = long.expires_in || short.expires_in;
      // what Meta actually granted, not what we asked for (the difference is what "awaiting approval" means)
      let granted = splitScopes(long.scope || short.scope);
      if (!granted.length) {
        try {
          const perms = await httpGet(`${GRAPH}/${v}/me/permissions`, { access_token: token });
          granted = (perms.data || []).filter((p) => p.status === 'granted').map((p) => String(p.permission));
        } catch { /* fall back to the requested list below, like the original */ }
      }
      const pages = await httpGet(`${GRAPH}/${v}/me/accounts`, { access_token: token, fields: 'id,name,instagram_business_account' });
      const list = pages.data || [];
      const primary = list[0] || {};
      return {
        accessToken: token,
        refreshToken: null,
        expiresAt: expiresIn ? new Date(Date.now() + Number(expiresIn) * 1000).toISOString() : null,
        scopes: granted.length ? granted : [...META_SCOPES],
        accountId: primary.id ? String(primary.id) : null,
        accountName: primary.name ? String(primary.name) : null,
        pages: list.map((p) => ({ id: p.id, name: p.name, instagram_business_account: (p.instagram_business_account || {}).id || null })),
      };
    },
  };
}

const linkedin = {
  name: 'linkedin',
  label: 'LinkedIn',
  documentation: 'https://learn.microsoft.com/linkedin/consumer/integrations/self-serve/sign-in-with-linkedin-v2',
  missing: linkedinMissing,
  requiredScopes: LI_SCOPES,
  authorizeUrl({ redirect, state, challenge }) {
    const q = new URLSearchParams({ response_type: 'code', client_id: env('LINKEDIN_CLIENT_ID'), redirect_uri: redirect, scope: LI_SCOPES.join(' '), state });
    if (challenge) { q.set('code_challenge', challenge); q.set('code_challenge_method', 'S256'); }
    return `${LI_AUTH}?${q}`;
  },
  async exchange({ code, redirect, verifier }) {
    const form = {
      grant_type: 'authorization_code', code, redirect_uri: redirect,
      client_id: env('LINKEDIN_CLIENT_ID'), client_secret: env('LINKEDIN_CLIENT_SECRET'),
    };
    if (verifier) form.code_verifier = verifier;
    const body = await httpPostForm(LI_TOKEN, form);
    if (!body.access_token) throw new CrmError(502, 'upstream_error', 'LinkedIn did not return an access token.');
    // the account's name is cosmetic: a failure here does not fail the handshake
    let accountId = null;
    let accountName = null;
    try {
      const r = await fetch(LI_USERINFO, { headers: { Authorization: `Bearer ${body.access_token}` }, signal: AbortSignal.timeout(20000) });
      if (r.status === 200) {
        const info = await r.json();
        accountId = info.sub ? String(info.sub) : null;
        accountName = [info.given_name, info.family_name].filter(Boolean).join(' ') || null;
      }
    } catch { /* store the connection without a display name */ }
    const granted = splitScopes(body.scope);
    return {
      accessToken: body.access_token,
      refreshToken: body.refresh_token || null,
      expiresAt: body.expires_in ? new Date(Date.now() + Number(body.expires_in) * 1000).toISOString() : null,
      scopes: granted.length ? granted : [...LI_SCOPES],
      accountId, accountName, pages: null,
    };
  },
};

const websiteForm = {
  name: 'website_form', label: 'Website form', documentation: '', missing: () => [], requiredScopes: [],
};

function getProvider(name) {
  const key = String(name || '').trim().toLowerCase();
  if (key === 'facebook' || key === 'instagram') return meta(key);
  if (key === 'linkedin') return linkedin;
  if (key === 'website_form') return websiteForm;
  return null;
}

/** Required scopes the provider did NOT grant (case-insensitive). */
function missingScopes(provider, granted) {
  const have = new Set((granted || []).map((s) => String(s).trim().toLowerCase()).filter(Boolean));
  return provider.requiredScopes.filter((s) => !have.has(s.toLowerCase()));
}

const isExpired = (connection) => !!(connection && connection.token_expires_at && new Date(connection.token_expires_at).getTime() <= Date.now());

// ------------------------------------------------------------------ status (pure, same states as the original)
function deriveStatus(label, providerName, { connection, missingKeys, tokenExpired }) {
  if (missingKeys.length) {
    return { status: 'setup_required', message: `${label} is not configured on this server. Add ${missingKeys.join(', ')} to the server settings and redeploy.` };
  }
  let state = connection ? (connection.status || 'error') : 'not_connected';
  if (connection && tokenExpired) state = 'expired';
  let message = null;
  if (state === 'not_connected') message = `No ${label} account is connected for this company yet.`;
  else if (state === 'awaiting_approval') {
    const pending = (connection && connection.permissions && connection.permissions.missing_scopes) || [];
    message = pending.length
      ? `${label} returned a token without ${pending.join(', ')}. Finish the provider's app review / permission requests, then reconnect.`
      : `${label} is waiting for the provider to approve the app.`;
  } else if (state === 'connected' && (providerName === 'facebook' || providerName === 'instagram') && !(connection && connection.page_id)) {
    message = 'Connected, but no Facebook Page is linked — reconnect and approve page access so lead-gen forms can be read.';
  }
  return { status: state, message };
}

// ------------------------------------------------------------------ lead mapping
const LIMITS = { full_name: 200, email: 320, phone: 50, organization: 200, job_title: 200, website: 500, campaign: 200, notes: 20000, external_id: 255 };
const cut = (v, n) => (v === null || v === undefined || String(v).trim() === '' ? null : String(v).trim().slice(0, n));

/**
 * Only real crm_leads columns, trimmed to the table's limits. A lead needs a name: when the provider gave none,
 * the e-mail or phone stands in (crm_leads.full_name is required).
 */
function leadRow(companyId, source, m) {
  const extra = m.extra && Object.keys(m.extra).length
    ? Object.entries(m.extra).filter(([, v]) => String(v ?? '').trim()).map(([k, v]) => `${k}=${v}`).join('; ')
    : '';
  const notes = [m.notes, extra].filter(Boolean).join('\n').trim();
  const name = cut(m.full_name, LIMITS.full_name) || cut(m.email, LIMITS.full_name) || cut(m.phone, LIMITS.full_name) || `${source} lead`;
  return {
    company_id: companyId,
    full_name: name,
    email: cut(m.email, LIMITS.email),
    phone: cut(m.phone, LIMITS.phone),
    organization: cut(m.organization, LIMITS.organization),
    job_title: cut(m.job_title, LIMITS.job_title),
    website: cut(m.website, LIMITS.website),
    campaign: cut(m.campaign, LIMITS.campaign),
    notes: cut(notes, LIMITS.notes),
    external_id: cut(m.external_id, LIMITS.external_id),
    source,
    status: 'new',
    priority: 'medium',
  };
}

/** [{name:'email', values:['a@b.c']}] -> {email:'a@b.c'} */
function metaFields(fieldData) {
  const out = {};
  for (const item of fieldData || []) {
    const name = String((item && item.name) || '').toLowerCase();
    const values = (item && item.values) || [];
    if (name && values.length) out[name] = String(values[0]);
  }
  return out;
}

/** Meta's field names -> lead columns (unknown fields are kept in the notes). */
function metaToLead(fields) {
  const mapping = {
    full_name: ['full_name', 'name', 'lead_name'], first_name: ['first_name'], last_name: ['last_name'],
    email: ['email', 'work_email'], phone: ['phone_number', 'phone', 'work_phone_number'],
    organization: ['company_name', 'organization'], job_title: ['job_title', 'title'], website: ['website'],
  };
  const out = {};
  const used = new Set();
  for (const [col, cands] of Object.entries(mapping)) {
    for (const c of cands) if (fields[c]) { out[col] = fields[c]; used.add(c); break; }
  }
  if (!out.full_name) {
    const joined = [out.first_name, out.last_name].filter(Boolean).join(' ');
    if (joined) out.full_name = joined;
  }
  delete out.first_name; delete out.last_name;
  const extra = {};
  for (const [k, v] of Object.entries(fields)) if (!used.has(k)) extra[k] = v;   // city, state, country, zip_code, custom questions
  out.extra = extra;
  return out;
}

function metaCampaign(value) {
  for (const k of ['campaign_name', 'campaign', 'ad_name', 'adgroup_name']) if (value && value[k]) return String(value[k]).slice(0, 200);
  const adId = value && (value.ad_id || value.adId);
  if (adId) return `ad:${adId}`;
  const formId = value && (value.form_id || value.formId);
  return formId ? `form:${formId}` : null;
}

/** LinkedIn lead-gen webhook payload -> lead columns (null when it is not an importable lead). */
function linkedinToLead(payload) {
  if (!payload || typeof payload !== 'object') return null;
  if (!['LEAD_GEN_NEW_LEAD', 'NEW_LEAD'].includes(payload.eventType)) return null;
  const formResponse = payload.formResponse || payload.lead || {};
  const values = formResponse.fields || formResponse.formValues || [];
  let fields = {};
  if (Array.isArray(values)) {
    for (const item of values) {
      const name = String((item && (item.name || item.field)) || '').toLowerCase();
      const value = item && (item.value || item.text);
      if (name && value) fields[name] = String(value);
    }
  } else if (values && typeof values === 'object') {
    fields = Object.fromEntries(Object.entries(values).filter(([, v]) => v).map(([k, v]) => [String(k).toLowerCase(), String(v)]));
  }
  const mapping = {
    full_name: ['full_name', 'first-and-last-name', 'name'], email: ['email', 'email-address'],
    phone: ['phone-number', 'phone', 'mobile-phone'], organization: ['company-name', 'organization'], job_title: ['job-title', 'title'],
  };
  const out = {};
  for (const [col, cands] of Object.entries(mapping)) for (const c of cands) if (fields[c]) { out[col] = fields[c]; break; }
  if (!out.full_name) {
    const joined = [fields['first-name'] || fields.first_name, fields['last-name'] || fields.last_name].filter(Boolean).join(' ');
    if (joined) out.full_name = joined;
  }
  if (!out.full_name && !out.email) return null;
  return out;
}

// website form: the field names a form may post, and what they map onto
const FORM_FIELDS = {
  full_name: ['full_name', 'fullname', 'name', 'first_name', 'last_name', 'contact_name'],
  email: ['email', 'email_address', 'work_email', 'mail'],
  phone: ['phone', 'phone_number', 'mobile', 'tel', 'telephone'],
  organization: ['organization', 'organisation', 'company', 'company_name'],
  job_title: ['job_title', 'title', 'position'],
  website: ['website', 'url'],
  campaign: ['campaign', 'utm_campaign', 'ad_campaign'],
  notes: ['notes', 'message', 'comments', 'description', 'enquiry'],
  source: ['source', 'channel'],
};
// never accepted from an untrusted form post (they would place a lead in a state or lane it did not earn)
const RESERVED = new Set(['status', 'priority', 'assigned_to', 'company_id', 'created_by', 'id', 'tags', 'external_id', 'sort_order',
  'next_follow_up_at', 'archived_at', 'deleted_at', 'created_at', 'updated_at', 'submission_id', 'redirect', '_redirect']);
const ALIASES = new Set(Object.values(FORM_FIELDS).flat());

/** Website form body -> lead columns (null when there is no name or e-mail). */
function formToLead(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null;
  let source = payload;
  for (const key of ['fields', 'data', 'form', 'submission', 'body']) {
    const nested = payload[key];
    if (nested && typeof nested === 'object' && !Array.isArray(nested) && Object.keys(nested).length) {
      source = { ...nested };
      for (const k of ['campaign', 'utm_campaign']) if (payload[k] !== undefined) source[k] = payload[k];
      break;
    }
  }
  const lowered = {};
  for (const [k, v] of Object.entries(source)) lowered[String(k).trim().toLowerCase()] = v;
  const out = {};
  for (const [col, aliases] of Object.entries(FORM_FIELDS)) {
    for (const a of aliases) {
      const v = lowered[a];
      if (v === null || v === undefined || typeof v === 'object' || String(v).trim() === '') continue;
      out[col] = String(v).trim();
      break;
    }
  }
  const first = lowered.first_name || lowered.firstname;
  const last = lowered.last_name || lowered.lastname;
  const joined = [first, last].filter((x) => x && typeof x !== 'object').join(' ');
  if (joined && (!out.full_name || out.full_name === String(first || '').trim())) out.full_name = joined;
  if (!out.full_name && !out.email) return null;
  delete out.source;   // always website_form
  // keep anything we do not understand rather than dropping it silently
  const unknown = Object.entries(lowered).filter(([k, v]) => !RESERVED.has(k) && !ALIASES.has(k) && k !== 'firstname' && k !== 'lastname'
    && v !== null && v !== undefined && String(typeof v === 'object' ? JSON.stringify(v) : v).trim());
  if (unknown.length) {
    const rendered = unknown.map(([k, v]) => `${k}=${typeof v === 'object' ? JSON.stringify(v) : v}`).join('; ').slice(0, 2000);
    out.notes = [out.notes, rendered].filter(Boolean).join('\n');
  }
  return out;
}

module.exports = {
  CrmError, env, PUBLIC_URL, FRONTEND_URL, STATE_TTL, META_VERSION, GRAPH, PROVIDER_NAMES, OAUTH_PROVIDERS,
  httpGet, call, getProvider, missingScopes, isExpired, deriveStatus, redirectUri, webhookUrl, websiteFormUrl,
  pkcePair, newState, newSigningSecret, safeEqual, verifyMetaSignature, verifyFormSignature,
  leadRow, metaFields, metaToLead, metaCampaign, linkedinToLead, formToLead,
};
