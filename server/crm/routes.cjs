/**
 * Leads CRM lead capture on the BI server (ported from Argus Leads backend/app/routers/integrations.py and
 * webhooks.py). The rest of the Leads CRM runs in the browser (src/crm/backend); only what needs a provider secret
 * or a public address lives here. Tables: supabase/migrations/20261203000000_crm_integrations.sql.
 *
 * Signed-in (Authorization: Bearer <BI sign-in token>; Leads CRM role owner / admin / manager, checked with
 * crm_role_for, the same rule as the original "integration:read" / "integration:manage"):
 *   GET  /api/crm/companies/:companyId/integrations                         every provider's status
 *   GET  /api/crm/companies/:companyId/integrations/:provider               one provider
 *   POST /api/crm/companies/:companyId/integrations/:provider/oauth/start   { authorize_url, state, redirect_uri, ... }
 *   POST /api/crm/companies/:companyId/integrations/:provider/disconnect
 *   POST /api/crm/companies/:companyId/integrations/:provider/sync
 *   (the activity log is read by the browser straight from crm_integration_logs; row security applies)
 *
 * Public (the provider calls them; each verifies itself exactly like the original):
 *   GET  /api/crm/oauth/:provider/callback          single-use state (+ PKCE for LinkedIn), then back to /crm/integrations
 *   GET  /api/crm/webhooks/meta                     Meta subscription check (META_WEBHOOK_VERIFY_TOKEN)
 *   POST /api/crm/webhooks/meta                     lead ads, X-Hub-Signature-256 checked with META_APP_SECRET
 *   GET  /api/crm/webhooks/linkedin                 LinkedIn challenge (challengeCode, HMAC with the client secret)
 *   POST /api/crm/webhooks/linkedin                 lead-gen events
 *   POST /api/crm/webhooks/website-form/:companyId  a company's own website form (X-Argus-Signature optional)
 *
 * Settings: see providers.cjs. Errors are answered as { code, message, details } (the original's envelope).
 */
'use strict';
const crypto = require('crypto');
const fernet = require('./fernet.cjs');
const P = require('./providers.cjs');

const { CrmError } = P;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MANAGE_ROLES = ['owner', 'admin', 'manager'];
const CONNECTION_SELECT = 'id, company_id, provider, status, external_account_id, external_account_name, page_id, ad_account_id, form_id, '
  + 'organization_id, scopes, permissions, sync_enabled, last_sync_at, last_sync_status, last_error, last_error_at, '
  + 'token_expires_at, token_revoked_at, connected_by, created_at, updated_at';

module.exports = function mountCrm(app, SB) {
  const db = () => (SB && SB.enabled ? SB.admin : null);
  const nowIso = () => new Date().toISOString();

  const send = (res, e) => {
    if (e instanceof CrmError) return res.status(e.status).json({ code: e.code, message: e.message, details: e.details || undefined });
    const msg = e && e.message ? e.message : String(e);
    if (/crm_(social_connections|integration_logs|webhook_events|oauth_states|leads)|crm_role_for/i.test(msg) && /does not exist|schema cache|PGRST20[25]|42P01|42883/i.test(msg)) {
      return res.status(503).json({ code: 'setup_needed', message: 'Lead capture is not set up in the database yet (run the Leads CRM integrations SQL first).' });
    }
    console.warn('crm:', msg);
    return res.status(500).json({ code: 'internal_error', message: msg || 'Something went wrong.' });
  };
  const must = (r) => { if (r.error) throw r.error instanceof Error ? r.error : new Error(r.error.message || 'Database error.'); return r.data; };

  // ------------------------------------------------------------------ who is calling
  async function caller(req, roles) {
    if (!db()) throw new CrmError(503, 'unavailable', 'The server is not connected to the database.');
    const h = String(req.headers.authorization || '');
    const user = h.startsWith('Bearer ') ? await SB.authUserFromToken(h.slice(7).trim()) : null;
    if (!user) throw new CrmError(401, 'unauthenticated', 'Your BI session has ended. Sign in again.');
    const companyId = String(req.params.companyId || '');
    if (!UUID.test(companyId)) throw new CrmError(404, 'not_found', 'Company not found.');
    const { data: role, error } = await db().rpc('crm_role_for', { p_company_id: companyId, p_user: user.id });
    if (error) throw error;
    if (!role) throw new CrmError(403, 'forbidden', 'You do not have access to the Leads CRM in this company.');
    if (roles && !roles.includes(role)) throw new CrmError(403, 'forbidden', 'Integrations are managed by owners, admins and managers.');
    return { userId: user.id, role, companyId };
  }

  // ------------------------------------------------------------------ app keys saved from the Integrations page
  // Meta / LinkedIn app keys can be pasted on the Integrations page by a BI Super Admin instead of being added to the
  // server environment (the environment still wins when set). Stored encrypted in crm_app_settings (server only,
  // migration 20261204000000_crm_app_settings.sql). The Meta webhook verify token is made here automatically.
  const APP_KEYS = ['META_APP_ID', 'META_APP_SECRET', 'META_WEBHOOK_VERIFY_TOKEN', 'LINKEDIN_CLIENT_ID', 'LINKEDIN_CLIENT_SECRET'];
  const SECRET_APP_KEYS = new Set(['META_APP_SECRET', 'LINKEDIN_CLIENT_SECRET']);
  const EDITABLE_APP_KEYS = ['META_APP_ID', 'META_APP_SECRET', 'LINKEDIN_CLIENT_ID', 'LINKEDIN_CLIENT_SECRET'];
  let keysLoadedAt = 0;
  let keysLoading = null;
  let keysTableReady = true;

  async function loadAppKeys(force) {
    if (!db()) return;
    if (!force && Date.now() - keysLoadedAt < 60000) return;
    keysLoading = keysLoading || (async () => {
      try {
        const k = P.derivedKey('settings');
        const read = async () => {
          const { data, error } = await db().from('crm_app_settings').select('key, value');
          if (error) throw error;
          const out = {};
          for (const r of data || []) { try { out[r.key] = fernet.decrypt(k, r.value); } catch { /* made with another key: ignore */ } }
          return out;
        };
        let out;
        try { out = await read(); } catch (e) {
          keysTableReady = !/crm_app_settings|PGRST205|42P01|schema cache|does not exist/i.test(String(e && e.message));
          if (!keysTableReady) { P.setStored({}); keysLoadedAt = Date.now(); return; }
          throw e;
        }
        keysTableReady = true;
        if (!P.fromServer('META_WEBHOOK_VERIFY_TOKEN') && !out.META_WEBHOOK_VERIFY_TOKEN) {
          const token = 'argus-' + crypto.randomBytes(12).toString('hex');
          const { error } = await db().from('crm_app_settings').insert({ key: 'META_WEBHOOK_VERIFY_TOKEN', value: fernet.encrypt(k, token) });
          out = error ? await read() : { ...out, META_WEBHOOK_VERIFY_TOKEN: token };   // another server made it first
        }
        P.setStored(out);
        keysLoadedAt = Date.now();
      } finally { keysLoading = null; }
    })();
    return keysLoading;
  }

  app.use('/api/crm', async (req, res, next) => {
    try { await loadAppKeys(false); } catch (e) { console.warn('crm app keys:', e && e.message); }
    next();
  });

  /** Signed-in person and whether they are a BI Super Admin (the only ones who may change app-wide keys). */
  async function signedIn(req) {
    if (!db()) throw new CrmError(503, 'unavailable', 'The server is not connected to the database.');
    const h = String(req.headers.authorization || '');
    const user = h.startsWith('Bearer ') ? await SB.authUserFromToken(h.slice(7).trim()) : null;
    if (!user) throw new CrmError(401, 'unauthenticated', 'Your BI session has ended. Sign in again.');
    const { data } = await db().from('company_users').select('id').eq('auth_user_id', user.id).eq('role', 'SUPER_ADMIN').eq('status', 'Active').limit(1);
    return { user, isSuper: !!(data && data.length) };
  }

  function appKeysView(isSuper) {
    const keys = {};
    for (const k of APP_KEYS) {
      const value = P.env(k);
      keys[k] = { set: !!value, from_server: P.fromServer(k), value: isSuper && value && !SECRET_APP_KEYS.has(k) ? value : null };
    }
    return {
      can_edit: isSuper,
      table_ready: keysTableReady,
      keys,
      meta: { redirect_urls: [P.redirectUri('facebook'), P.redirectUri('instagram')], webhook_url: P.webhookUrl('facebook') },
      linkedin: { redirect_url: P.redirectUri('linkedin') },
    };
  }

  app.get('/api/crm/app-keys', async (req, res) => {
    try { const me = await signedIn(req); res.json(appKeysView(me.isSuper)); } catch (e) { send(res, e); }
  });

  app.post('/api/crm/app-keys', async (req, res) => {
    try {
      const me = await signedIn(req);
      if (!me.isSuper) throw new CrmError(403, 'forbidden', 'Only a BI Super Admin can change the app keys.');
      if (!keysTableReady) throw new CrmError(503, 'setup_needed', 'Run the SQL file 20261204000000_crm_app_settings.sql first, then save again.');
      const body = req.body || {};
      const k = P.derivedKey('settings');
      const rows = [];
      for (const key of EDITABLE_APP_KEYS) {
        const v = typeof body[key] === 'string' ? body[key].trim() : '';
        if (!v) continue;   // empty = keep what is saved
        if ((key === 'META_APP_ID') && !/^\d{5,25}$/.test(v)) throw new CrmError(422, 'validation_error', 'The Meta App ID is a number (only digits).');
        if (v.length > 300) throw new CrmError(422, 'validation_error', `${key} is too long.`);
        rows.push({ key, value: fernet.encrypt(k, v), updated_by: me.user.id, updated_at: nowIso() });
      }
      if (rows.length) must(await db().from('crm_app_settings').upsert(rows, { onConflict: 'key' }));
      await loadAppKeys(true);
      res.json(appKeysView(true));
    } catch (e) {
      if (/crm_app_settings/.test(String(e && e.message))) return send(res, new CrmError(503, 'setup_needed', 'Run the SQL file 20261204000000_crm_app_settings.sql first, then save again.'));
      send(res, e);
    }
  });

  function providerOr404(name) {
    const p = P.getProvider(name);
    if (!p) throw new CrmError(404, 'not_found', `Unknown integration '${name}'.`, { available: P.PROVIDER_NAMES });
    return p;
  }

  // ------------------------------------------------------------------ log (never throws)
  async function logEvent(companyId, provider, event, message, o = {}) {
    if (!companyId || !UUID.test(companyId) || !db()) {
      console.log(`crm integrations [${provider}] ${event}: ${message}`);
      return;
    }
    const body = { company_id: companyId, provider, level: o.level || 'info', event, message: String(message).slice(0, 2000), payload: o.payload || {} };
    if (o.connectionId) body.connection_id = o.connectionId;
    if (o.statusCode) body.status_code = o.statusCode;
    if (o.durationMs !== undefined) body.duration_ms = o.durationMs;
    if (o.createdBy) body.created_by = o.createdBy;
    try { const { error } = await db().from('crm_integration_logs').insert(body); if (error) console.warn('crm log:', error.message); } catch (e) { console.warn('crm log:', e.message); }
  }

  // ------------------------------------------------------------------ connections
  async function findConnection(companyId, provider, cols = CONNECTION_SELECT) {
    const { data, error } = await db().from('crm_social_connections').select(cols).eq('company_id', companyId).eq('provider', provider).limit(1);
    if (error) throw error;
    return (data && data[0]) || null;
  }

  function encryptToken(plain) {
    if (!plain) return null;
    const key = P.env('TOKEN_ENCRYPTION_KEY');
    // fail closed: never write a plaintext credential into the database
    if (!key) throw new CrmError(503, 'integration_not_configured', 'TOKEN_ENCRYPTION_KEY is not set, so sign-in tokens cannot be stored safely.');
    return fernet.encrypt(key, plain);
  }
  function decryptToken(cipher) {
    if (!cipher) return null;
    const key = P.env('TOKEN_ENCRYPTION_KEY');
    if (!key) throw new CrmError(503, 'integration_not_configured', 'TOKEN_ENCRYPTION_KEY is not set; stored sign-in tokens cannot be read.');
    if (!String(cipher).startsWith('gAAAAA')) return cipher;   // legacy plaintext, like the original
    try { return fernet.decrypt(key, cipher); } catch {
      throw new CrmError(503, 'integration_not_configured', 'The stored sign-in token could not be decrypted. TOKEN_ENCRYPTION_KEY may have changed — reconnect the integration.');
    }
  }

  /** Create or update the company's connection row for a provider (service role: callers checked access already). */
  async function upsertConnection(companyId, provider, userId, { token, status, extra }) {
    const existing = await findConnection(companyId, provider, 'id');
    const body = { status, updated_at: nowIso() };
    if (token) {
      Object.assign(body, {
        access_token: encryptToken(token.accessToken),
        refresh_token: encryptToken(token.refreshToken),
        token_expires_at: token.expiresAt || null,
        scopes: token.scopes || [],
        external_account_id: token.accountId || null,
        external_account_name: token.accountName || null,
        connected_by: userId || null,
        last_error: null,
        last_error_at: null,
      });
    }
    if (extra) Object.assign(body, extra);
    if (existing) {
      must(await db().from('crm_social_connections').update(body).eq('id', existing.id));
      return findConnection(companyId, provider);
    }
    Object.assign(body, { company_id: companyId, provider, connected_by: userId || null });
    const rows = must(await db().from('crm_social_connections').insert(body).select(CONNECTION_SELECT));
    return (rows && rows[0]) || findConnection(companyId, provider);
  }

  async function recordFailure(companyId, provider, message, status = 'error') {
    try {
      await db().from('crm_social_connections').update({ status, last_error: String(message).slice(0, 1000), last_error_at: nowIso() })
        .eq('company_id', companyId).eq('provider', provider);
    } catch (e) { console.warn('crm recordFailure:', e.message); }
  }

  async function markSync(companyId, provider, status, message) {
    try {
      await db().from('crm_social_connections').update({
        last_sync_at: nowIso(), last_sync_status: status,
        last_error: message ? String(message).slice(0, 1000) : null, last_error_at: message ? nowIso() : null,
      }).eq('company_id', companyId).eq('provider', provider);
    } catch (e) { console.warn('crm markSync:', e.message); }
  }

  // ------------------------------------------------------------------ status
  /** Secrets never leave the server, even if a wider select is used one day. */
  const SECRET_COLUMNS = ['access_token', 'refresh_token', 'settings', 'sync_cursor'];
  const publicConnection = (row) => (row ? Object.fromEntries(Object.entries(row).filter(([k]) => !SECRET_COLUMNS.includes(k))) : null);

  async function statusFor(companyId, name) {
    const p = P.getProvider(name);
    const connection = await findConnection(companyId, name);
    const missing = p.missing();
    const { status, message } = P.deriveStatus(p.label, name, {
      connection, missingKeys: missing.map((m) => m.key), tokenExpired: !!connection && P.isExpired(connection),
    });
    return {
      provider: name,
      status,
      connection: publicConnection(connection),
      configured: !missing.length,
      requirements: missing,
      message,
      scopes: connection ? connection.scopes || [] : [],
      last_sync_at: connection ? connection.last_sync_at : null,
      last_sync_status: connection ? connection.last_sync_status : null,
      error: connection ? connection.last_error : null,
      documentation: p.documentation || undefined,
    };
  }

  /** Web address + (once) the signing secret for the company's own form. */
  async function websiteFormDetails(companyId, userId) {
    const connection = await findConnection(companyId, 'website_form', 'id, settings');
    let secret = connection && connection.settings ? connection.settings.signing_secret : null;
    let fresh = false;
    if (!connection) {
      // first look at the form integration: mint a signing secret. It is shown once, then only as has_secret.
      secret = P.newSigningSecret();
      try {
        await upsertConnection(companyId, 'website_form', userId, { status: 'connected', extra: { settings: { signing_secret: secret }, form_id: null } });
        fresh = true;
      } catch (e) {
        if (!/duplicate|23505/i.test(String(e && e.message))) throw e;   // two tabs at once: the other one won
        const again = await findConnection(companyId, 'website_form', 'id, settings');
        secret = again && again.settings ? again.settings.signing_secret : null;
      }
    }
    return {
      endpoint_url: P.websiteFormUrl(companyId),
      signing_secret: fresh ? secret : null,
      has_secret: !!secret,
      instructions: 'Send your form fields (JSON or a normal form post) to this web address. To mark entries as verified, add an '
        + 'X-Argus-Signature header set to sha256=<hex HMAC-SHA256 of the raw body, keyed with your secret key>. Without the header '
        + 'the lead is still created but marked unverified; a wrong signature is refused.',
    };
  }

  async function entryFor(companyId, name, userId) {
    const entry = await statusFor(companyId, name);
    if (P.OAUTH_PROVIDERS.includes(name)) {
      entry.callback_url = P.redirectUri(name);
      entry.webhook_url = P.webhookUrl(name);
    } else {
      Object.assign(entry, await websiteFormDetails(companyId, userId));
    }
    return entry;
  }

  const base = '/api/crm/companies/:companyId/integrations';

  app.get(base, async (req, res) => {
    try {
      const me = await caller(req, MANAGE_ROLES);
      const integrations = [];
      for (const name of P.PROVIDER_NAMES) integrations.push(await entryFor(me.companyId, name, me.userId));
      res.json({ integrations });
    } catch (e) { send(res, e); }
  });

  app.get(`${base}/:provider`, async (req, res) => {
    try {
      const me = await caller(req, MANAGE_ROLES);
      providerOr404(req.params.provider);
      res.json(await entryFor(me.companyId, req.params.provider, me.userId));
    } catch (e) { send(res, e); }
  });

  // ------------------------------------------------------------------ OAuth start
  /** Where to send the browser after the callback: the BI site, or a local dev address the browser came from. */
  function returnOrigin(asked) {
    const o = String(asked || '').replace(/\/+$/, '');
    if (/^http:\/\/(localhost|127\.0\.0\.1)(:\d{1,5})?$/.test(o)) return o;
    if (o && (o === P.FRONTEND_URL() || o === P.PUBLIC_URL())) return o;
    return P.FRONTEND_URL();
  }

  app.post(`${base}/:provider/oauth/start`, async (req, res) => {
    try {
      const me = await caller(req, MANAGE_ROLES);
      const name = req.params.provider;
      if (!P.OAUTH_PROVIDERS.includes(name)) {
        providerOr404(name);
        throw new CrmError(422, 'validation_error', `${name} does not use OAuth.`, { provider: name });
      }
      const p = providerOr404(name);
      const missing = p.missing();
      if (missing.length) throw new CrmError(503, 'integration_not_configured', `${p.label} is not configured on this server.`, { provider: name, missing });

      const redirect = P.redirectUri(name);
      const pkce = name === 'linkedin' ? P.pkcePair() : null;
      const state = P.newState();
      must(await db().from('crm_oauth_states').insert({
        company_id: me.companyId, provider: name, state, code_verifier: pkce ? pkce.verifier : null, redirect_uri: redirect,
        created_by: me.userId, expires_at: new Date(Date.now() + P.STATE_TTL() * 1000).toISOString(),
        metadata: { return_to: returnOrigin(req.body && req.body.return_origin) },
      }));
      res.json({
        provider: name,
        authorize_url: p.authorizeUrl({ redirect, state, challenge: pkce ? pkce.challenge : null }),
        state,
        redirect_uri: redirect,
        expires_in_seconds: P.STATE_TTL(),
        message: 'Open authorize_url in the browser. When the provider sends you back, the server completes the handshake and the page reports the result.',
      });
    } catch (e) { send(res, e); }
  });

  // ------------------------------------------------------------------ OAuth callback (browser redirect, no sign-in header)
  const back = (origin, q) => `${origin || P.FRONTEND_URL()}/crm/integrations?${new URLSearchParams(q)}`;
  const callbackError = (res, origin, provider, message, code) => res.redirect(302, back(origin, { provider, status: 'error', message, code }));

  /** Validate and burn a state value. Throws when absent, expired or reused. */
  async function consumeState(state, provider) {
    if (!state || state.length > 256) throw new CrmError(400, 'invalid_oauth_state', 'The sign-in link is missing or malformed. Please start again.');
    const { data, error } = await db().from('crm_oauth_states')
      .select('id, company_id, provider, code_verifier, redirect_uri, expires_at, used_at, created_by, metadata')
      .eq('state', state).eq('provider', provider).limit(1);
    if (error) throw error;
    const row = data && data[0];
    if (!row) throw new CrmError(400, 'invalid_oauth_state', 'That sign-in link is not valid. Please start again.');
    if (row.used_at) throw new CrmError(400, 'oauth_state_reused', 'That sign-in link has already been used. Please start again.', { row });
    if (row.expires_at && new Date(row.expires_at).getTime() < Date.now()) {
      throw new CrmError(400, 'oauth_state_expired', 'That sign-in link has expired. Please start again.', { row });
    }
    // burn it (single use); the used_at filter makes two simultaneous callbacks race safely
    const burnt = must(await db().from('crm_oauth_states').update({ used_at: nowIso() }).eq('id', row.id).is('used_at', null).select('id'));
    if (!burnt || !burnt.length) throw new CrmError(400, 'oauth_state_reused', 'That sign-in link has already been used. Please start again.', { row });
    return row;
  }

  /** Meta: a Page's own token (lead forms and leads are read with it); falls back to the person's token. */
  async function pageToken(userToken, pageId) {
    try {
      const r = await P.httpGet(`${P.GRAPH}/${P.META_VERSION()}/${pageId}`, { fields: 'access_token', access_token: userToken });
      return r.access_token || userToken;
    } catch { return userToken; }
  }

  app.get('/api/crm/oauth/:provider/callback', async (req, res) => {
    const name = req.params.provider;
    if (!P.OAUTH_PROVIDERS.includes(name)) return res.status(404).json({ code: 'not_found', message: `Unknown integration '${name}'.` });
    if (!db()) return callbackError(res, null, name, 'The server is not connected to the database.', 'unavailable');
    const q = req.query || {};
    let row;
    try {
      // the state row is the only thing tying this request to a company: single use, short-lived, written by a
      // signed-in owner/admin/manager
      if (q.error) {
        // the person cancelled at the provider: still burn the state so the link cannot be replayed
        let origin = null;
        try { if (q.state) origin = ((await consumeState(String(q.state), name)).metadata || {}).return_to; } catch { /* nothing to burn */ }
        return callbackError(res, origin, name, String(q.error_description || 'The provider refused the connection.'), 'provider_error');
      }
      if (!q.code || !q.state) return callbackError(res, null, name, 'The provider did not return a code.', 'missing_code');
      row = await consumeState(String(q.state), name);
    } catch (e) {
      const origin = e && e.details && e.details.row && e.details.row.metadata ? e.details.row.metadata.return_to : null;
      return callbackError(res, origin, name, e instanceof CrmError ? e.message : 'The sign-in could not be checked.', (e && e.code) || 'invalid_oauth_state');
    }

    const companyId = String(row.company_id);
    const origin = (row.metadata || {}).return_to || null;
    const p = P.getProvider(name);
    const started = Date.now();
    let token;
    try {
      token = await p.exchange({ code: String(q.code), redirect: row.redirect_uri || P.redirectUri(name), verifier: row.code_verifier });
    } catch (e) {
      const message = e instanceof CrmError ? e.message : 'The token exchange failed.';
      await recordFailure(companyId, name, message);
      await logEvent(companyId, name, 'oauth_callback', `Token exchange failed: ${message}`, { level: 'error', payload: { code: e.code || 'exchange_failed' }, durationMs: Date.now() - started });
      return callbackError(res, origin, name, message, (e && e.code) || 'exchange_failed');
    }

    try {
      const extra = {};
      const permissions = {};
      if (name === 'facebook' || name === 'instagram') {
        extra.page_id = token.accountId;
        if (token.pages) permissions.pages = token.pages;
      }
      if (name === 'linkedin') extra.organization_id = P.env('LINKEDIN_ORGANIZATION_ID') || null;
      // the handshake can succeed while the app is still unapproved: the token then lacks scopes we need, and
      // "connected" would be a lie that sync only discovers later
      const missingScopes = P.missingScopes(p, token.scopes);
      const status = missingScopes.length ? 'awaiting_approval' : 'connected';
      if (missingScopes.length) permissions.missing_scopes = missingScopes;
      extra.permissions = permissions;

      const connection = await upsertConnection(companyId, name, row.created_by, { token, status, extra });
      const account = token.accountName || token.accountId || 'account';
      const message = missingScopes.length
        ? `${p.label} returned a token without ${missingScopes.join(', ')}. The app is still in development mode or awaiting approval, so leads cannot be read yet.`
        : `${p.label} connected as ${account}.`;
      await logEvent(companyId, name, status === 'connected' ? 'oauth_connected' : 'oauth_awaiting_approval', message, {
        level: status === 'connected' ? 'info' : 'warn', connectionId: connection && connection.id, createdBy: row.created_by,
        durationMs: Date.now() - started, payload: { scopes: token.scopes, missing_scopes: missingScopes, external_account_id: token.accountId },
      });

      // Meta only sends lead webhooks for Pages subscribed to the app: subscribe the connected Page (best effort)
      if ((name === 'facebook' || name === 'instagram') && token.accountId) {
        try {
          const pt = await pageToken(token.accessToken, token.accountId);
          await P.call(`${P.GRAPH}/${P.META_VERSION()}/${token.accountId}/subscribed_apps?${new URLSearchParams({ subscribed_fields: 'leadgen', access_token: pt })}`, { method: 'POST' });
          await logEvent(companyId, name, 'page_subscribed', `Page ${token.accountName || token.accountId} now sends new leads to BI.`, { connectionId: connection && connection.id });
        } catch (e) {
          await logEvent(companyId, name, 'page_subscribe_failed', `Could not subscribe the Page to lead updates: ${e.message}`, { level: 'warn', connectionId: connection && connection.id });
        }
      }
      return res.redirect(302, back(origin, { provider: name, status, account }));
    } catch (e) {
      const message = e instanceof CrmError ? e.message : 'The connection could not be saved.';
      console.warn('crm oauth callback:', e && e.message);
      await recordFailure(companyId, name, message);
      await logEvent(companyId, name, 'oauth_callback', `Saving the connection failed: ${message}`, { level: 'error' });
      return callbackError(res, origin, name, message, (e && e.code) || 'store_failed');
    }
  });

  // ------------------------------------------------------------------ disconnect / sync
  app.post(`${base}/:provider/disconnect`, async (req, res) => {
    try {
      const me = await caller(req, MANAGE_ROLES);
      const name = req.params.provider;
      providerOr404(name);
      const connection = await findConnection(me.companyId, name, 'id');
      if (!connection) throw new CrmError(404, 'not_found', `No ${name} connection exists for this company.`);
      must(await db().from('crm_social_connections').delete().eq('id', connection.id));
      await logEvent(me.companyId, name, 'disconnected', 'Connection removed by a team member.', { level: 'warn', createdBy: me.userId });
      res.json({ provider: name, status: 'not_connected', message: 'Disconnected. Stored tokens were deleted. Existing leads are untouched.' });
    } catch (e) { send(res, e); }
  });

  const emptyRun = (provider, startedAt, message) => ({
    provider, status: 'failed', fetched: 0, created: 0, updated: 0, duplicates: 0, failed: 0, messages: [message], started_at: startedAt,
  });

  /** Insert one lead unless (company, source, external id) is already there. 'created' | 'duplicate' | 'failed'. */
  async function storeLead(row) {
    if (row.external_id) {
      const { data } = await db().from('crm_leads').select('id').eq('company_id', row.company_id).eq('source', row.source)
        .eq('external_id', row.external_id).is('deleted_at', null).limit(1);
      if (data && data.length) return { outcome: 'duplicate' };
    }
    const { data, error } = await db().from('crm_leads').insert(row).select('id, full_name, email, status');
    if (error) {
      if (error.code === '23505' || /duplicate/i.test(error.message || '')) return { outcome: 'duplicate' };
      return { outcome: 'failed', error: error.message };
    }
    return { outcome: 'created', lead: data && data[0] };
  }

  /** A Meta lead (Graph /{lead-id} shape) -> crm_leads row. */
  function metaLeadRow(companyId, source, lead, formName) {
    const m = P.metaToLead(P.metaFields(lead.field_data));
    m.external_id = String(lead.id || lead.leadgen_id || '');
    m.campaign = lead.campaign_name || lead.ad_name || (formName ? `form:${formName}` : null) || P.metaCampaign(lead);
    return P.leadRow(companyId, source, m);
  }

  async function syncMeta(companyId, name, connection, startedAt) {
    const full = await findConnection(companyId, name, 'id, page_id, access_token');
    const userToken = decryptToken(full && full.access_token);
    if (!userToken) return emptyRun(name, startedAt, 'No stored access token — reconnect the integration.');
    const pageId = connection.page_id;
    if (!pageId) return emptyRun(name, startedAt, 'No Facebook Page is linked. Reconnect and approve page access.');
    const v = P.META_VERSION();
    const token = await pageToken(userToken, pageId);

    let forms;
    try { forms = await P.httpGet(`${P.GRAPH}/${v}/${pageId}/leadgen_forms`, { access_token: token, limit: '100', fields: 'id,name' }); }
    catch (e) { return emptyRun(name, startedAt, `Could not list lead forms: ${e.message}`); }
    const formList = (forms.data || []).filter((f) => f.id);
    if (!formList.length) {
      return { provider: name, status: 'success', fetched: 0, created: 0, updated: 0, duplicates: 0, failed: 0, messages: ['Connected page has no lead-gen forms published.'], started_at: startedAt };
    }

    // only leads newer than the last run (minus a day of overlap; duplicates are skipped by external id)
    const since = connection.last_sync_at ? Math.floor(new Date(connection.last_sync_at).getTime() / 1000) - 86400 : 0;
    let fetched = 0; let created = 0; let dupes = 0; let failed = 0;
    const messages = [];
    for (const form of formList) {
      const params = { access_token: token, limit: '100', fields: 'id,created_time,field_data,ad_id,ad_name,campaign_name,form_id' };
      if (since > 0) params.filtering = JSON.stringify([{ field: 'time_created', operator: 'GREATER_THAN', value: since }]);
      let url = `${P.GRAPH}/${v}/${form.id}/leads?${new URLSearchParams(params)}`;
      for (let pageNo = 0; url && pageNo < 20; pageNo++) {
        let page;
        try { page = await P.call(url, { method: 'GET' }); } catch (e) { messages.push(`form ${form.name || form.id}: ${e.message}`); failed++; break; }
        for (const lead of page.data || []) {
          fetched++;
          if (!lead.id) { failed++; continue; }
          const r = await storeLead(metaLeadRow(companyId, name, lead, form.name));
          if (r.outcome === 'created') created++; else if (r.outcome === 'duplicate') dupes++; else failed++;
        }
        url = page.paging && page.paging.next ? page.paging.next : null;
      }
    }
    let status = 'success';
    if (failed && created) status = 'partial'; else if (failed && !created) status = 'failed';
    if (!messages.length) messages.push(`Fetched ${fetched} lead(s) from ${formList.length} form(s).`);
    return { provider: name, status, fetched, created, updated: 0, duplicates: dupes, failed, messages, started_at: startedAt };
  }

  app.post(`${base}/:provider/sync`, async (req, res) => {
    try {
      const me = await caller(req, MANAGE_ROLES);
      const name = req.params.provider;
      const p = providerOr404(name);
      const missing = p.missing();
      if (missing.length) {
        await logEvent(me.companyId, name, 'sync_skipped', 'Sync requested but the server is missing credentials.', { level: 'warn', payload: { missing: missing.map((m) => m.key) }, createdBy: me.userId });
        throw new CrmError(503, 'integration_not_configured', `${p.label} is not configured, so no synchronisation can run.`, { missing: missing.map((m) => m.key) });
      }
      const connection = await findConnection(me.companyId, name);
      if (!connection || connection.status !== 'connected') {
        throw new CrmError(422, 'validation_error', `${p.label} is not connected for this company yet.`, { status: connection ? connection.status : 'not_connected' });
      }
      const startedAt = nowIso();
      if (P.isExpired(connection)) {
        await markSync(me.companyId, name, 'failed', 'Access token has expired; reconnect to refresh it.');
        await logEvent(me.companyId, name, 'sync_failed', 'Access token expired.', { level: 'error', connectionId: connection.id, createdBy: me.userId });
        return res.json({ provider: name, status: 'failed', created: 0, fetched: 0, started_at: startedAt, finished_at: nowIso(), messages: ['Access token expired. Reconnect the integration.'] });
      }

      let result;
      if (name === 'facebook' || name === 'instagram') result = await syncMeta(me.companyId, name, connection, startedAt);
      else if (name === 'linkedin') {
        // LinkedIn has no lead pull for these apps: leads arrive by webhook. Say so rather than fake an empty run.
        result = { provider: name, status: 'success', fetched: 0, created: 0, updated: 0, duplicates: 0, failed: 0, started_at: startedAt,
          messages: ['LinkedIn delivers leads by webhook; there is nothing to pull. Leads LinkedIn sends to BI appear here automatically.'] };
      } else {
        result = emptyRun(name, startedAt, `${p.label} has no pull-based sync; leads arrive by webhook.`);
      }
      result.finished_at = nowIso();
      await markSync(me.companyId, name, result.status || 'failed', result.status === 'success' ? null : (result.messages || []).join('; ').slice(0, 500) || null);
      await logEvent(me.companyId, name, 'sync', `Sync finished: ${result.status} (${result.fetched || 0} fetched, ${result.created || 0} created).`, {
        level: result.status === 'success' ? 'info' : 'warn', connectionId: connection.id, payload: result, createdBy: me.userId,
        durationMs: Date.now() - new Date(startedAt).getTime(),
      });
      res.json(result);
    } catch (e) { send(res, e); }
  });

  // ------------------------------------------------------------------ webhooks: shared bits
  /** The exact bytes the sender signed (captured by express.json / urlencoded in server.cjs, or read here). */
  async function rawBodyOf(req) {
    if (Buffer.isBuffer(req.rawBody)) return req.rawBody;
    if (req.readable && !req.readableEnded && !req._body) {
      const chunks = [];
      let size = 0;
      for await (const c of req) { size += c.length; if (size > 1024 * 1024) throw new CrmError(413, 'too_large', 'The body is too large.'); chunks.push(c); }
      const buf = Buffer.concat(chunks);
      req.rawBody = buf;
      return buf;
    }
    // the body was already parsed by the hosting platform: rebuild it (signatures over re-serialised JSON can differ)
    if (req.body && typeof req.body === 'object' && Object.keys(req.body).length) return Buffer.from(JSON.stringify(req.body), 'utf8');
    return Buffer.alloc(0);
  }

  function jsonFrom(raw, req) {
    const type = String(req.headers['content-type'] || '').toLowerCase();
    if (type.includes('application/x-www-form-urlencoded')) {
      return Object.fromEntries(new URLSearchParams(raw.toString('utf8')));
    }
    try { return JSON.parse(raw.toString('utf8') || '{}'); } catch { throw new CrmError(422, 'validation_error', 'The webhook body is not valid JSON.'); }
  }

  /** Idempotency ledger: 'new' (process it) | 'duplicate' (already handled) | 'conflict' (still being worked). */
  async function claimEvent({ provider, eventKey, eventType, signature, headers, payload, companyId }) {
    const { data, error } = await db().from('crm_webhook_events').insert({
      company_id: companyId || null, provider, event_key: eventKey, event_type: eventType || null, signature: signature || null,
      status: 'received', attempts: 0, headers: headers || {}, payload: payload || {},
    }).select('id, status');
    if (!error && data && data[0]) return { outcome: 'new', id: data[0].id };
    if (error && error.code !== '23505' && !/duplicate/i.test(error.message || '')) {
      console.warn('crm webhook ledger:', error.message);
      return { outcome: 'new', id: null };   // ledger unavailable: fail open rather than drop the lead
    }
    const { data: ex } = await db().from('crm_webhook_events').select('id, status').eq('provider', provider).eq('event_key', eventKey).limit(1);
    const row = ex && ex[0];
    if (!row) return { outcome: 'new', id: null };
    if (row.status === 'processed' || row.status === 'duplicate') return { outcome: 'duplicate', id: row.id };
    return { outcome: 'conflict', id: row.id };
  }

  async function finishEvent(id, { status, error, companyId }) {
    if (!id) return;
    try {
      await db().from('crm_webhook_events').update({
        status, error: error ? String(error).slice(0, 1000) : null, processed_at: nowIso(), attempts: 1, company_id: companyId || null,
      }).eq('id', id);
    } catch (e) { console.warn('crm finishEvent:', e.message); }
  }

  // ------------------------------------------------------------------ Meta
  app.get('/api/crm/webhooks/meta', (req, res) => {
    const verify = P.env('META_WEBHOOK_VERIFY_TOKEN');
    if (!verify) {
      return res.status(503).json({ code: 'integration_not_configured', message: 'META_WEBHOOK_VERIFY_TOKEN is not set, so this webhook cannot be verified.' });
    }
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];
    if (mode !== 'subscribe') return res.status(422).json({ code: 'validation_error', message: "hub.mode must be 'subscribe'." });
    if (!token || !P.safeEqual(String(token), verify)) return res.status(403).json({ code: 'forbidden', message: 'Verification token mismatch.' });
    console.log('crm integrations [facebook] webhook_verify: Meta subscription verified.');
    res.type('text/plain').send(String(challenge || ''));
  });

  async function companyForPage(pageId) {
    if (!pageId) return null;
    const { data } = await db().from('crm_social_connections').select('company_id, provider').in('provider', ['facebook', 'instagram'])
      .eq('page_id', pageId).order('provider', { ascending: true }).limit(1);
    return data && data[0] ? { companyId: String(data[0].company_id), provider: data[0].provider } : null;
  }

  /** Store one Meta lead. The webhook names the lead only (leadgen_id): its answers are fetched with the Page token. */
  async function ingestMetaLead(target, pageId, value) {
    const externalId = String(value.leadgen_id || value.leadgenId || '');
    const { data: ex } = await db().from('crm_leads').select('id').eq('company_id', target.companyId).eq('source', target.provider)
      .eq('external_id', externalId).is('deleted_at', null).limit(1);
    if (ex && ex.length) return false;

    let lead = { ...value, id: externalId };
    if (!Array.isArray(value.field_data) || !value.field_data.length) {
      const conn = await findConnection(target.companyId, target.provider, 'access_token');
      const userToken = decryptToken(conn && conn.access_token);
      if (!userToken) throw new Error('No stored access token for this Page — reconnect the integration.');
      const token = await pageToken(userToken, pageId);
      const fetched = await P.httpGet(`${P.GRAPH}/${P.META_VERSION()}/${externalId}`, {
        access_token: token, fields: 'id,created_time,field_data,ad_id,ad_name,campaign_name,form_id',
      });
      lead = { ...value, ...fetched, id: externalId };
    }
    const row = metaLeadRow(target.companyId, target.provider, lead, null);
    row.campaign = row.campaign || P.metaCampaign(value);
    const r = await storeLead(row);
    if (r.outcome === 'failed') throw new Error(r.error || 'The lead could not be stored.');
    return r.outcome === 'created';
  }

  app.post('/api/crm/webhooks/meta', async (req, res) => {
    try {
      if (!db()) throw new CrmError(503, 'unavailable', 'The server is not connected to the database.');
      const secret = P.env('META_APP_SECRET');
      const raw = await rawBodyOf(req);
      const sig = req.headers['x-hub-signature-256'];
      if (!secret) throw new CrmError(503, 'integration_not_configured', 'META_APP_SECRET is not set, so webhook signatures cannot be verified.');
      // a forged request never reaches the parser, let alone the lead insert
      if (!P.verifyMetaSignature(raw, sig, secret)) {
        console.warn('crm integrations [facebook] webhook_rejected: signature verification failed.');
        throw new CrmError(403, 'invalid_signature', 'Signature verification failed.', { header: 'X-Hub-Signature-256' });
      }
      const payload = jsonFrom(raw, req);
      if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new CrmError(422, 'validation_error', 'The webhook body must be a JSON object.');
      // lead ads arrive as object "page" (field "leadgen"); the original also accepted "leadgen" / "leadgen_leadgen"
      if (!['page', 'leadgen', 'instagram'].includes(payload.object)) {
        return res.json({ received: true, ignored: true, message: `Object '${payload.object}' is not a lead-gen event.` });
      }
      const entries = Array.isArray(payload.entry) ? payload.entry : [];
      if (!entries.length) return res.json({ received: true, ignored: true, message: 'No entries in payload.' });

      let accepted = 0; let duplicates = 0; let ignored = 0; let failed = 0;
      const details = [];
      const perCompany = new Map();
      const trace = String(req.headers['x-hub-trace-event'] || '');
      for (const entry of entries) {
        const pageId = String((entry && entry.id) || '');
        for (const change of (entry && entry.changes) || []) {
          if (!change || !['leadgen', 'leadgen_leadgen'].includes(change.field)) continue;
          const value = change.value || {};
          const leadgenId = String(value.leadgen_id || value.leadgenId || '');
          if (!leadgenId) { failed++; details.push({ event: 'missing_leadgen_id' }); continue; }
          const pid = pageId || String(value.page_id || '');
          const target = await companyForPage(pid);
          const claim = await claimEvent({ provider: 'facebook', eventKey: leadgenId, eventType: 'leadgen', signature: sig, headers: { 'x-hub-trace-event': trace }, payload: value, companyId: target && target.companyId });
          if (claim.outcome === 'duplicate') { duplicates++; continue; }
          if (!target) {
            ignored++;
            await finishEvent(claim.id, { status: 'ignored', error: `No connected company owns page ${pid}.` });
            details.push({ event: 'unconnected_page', page_id: pid });
            continue;
          }
          const tally = perCompany.get(target.companyId) || { provider: target.provider, accepted: 0, duplicates: 0, failed: 0 };
          perCompany.set(target.companyId, tally);
          try {
            const created = await ingestMetaLead(target, pid, value);
            if (created) { accepted++; tally.accepted++; await finishEvent(claim.id, { status: 'processed', companyId: target.companyId }); }
            else { duplicates++; tally.duplicates++; await finishEvent(claim.id, { status: 'duplicate', companyId: target.companyId }); }
          } catch (e) {
            failed++; tally.failed++;
            await finishEvent(claim.id, { status: 'failed', error: e.message, companyId: target.companyId });
            details.push({ event: 'ingest_failed', message: e.message });
          }
        }
      }
      for (const [companyId, t] of perCompany) {
        await logEvent(companyId, t.provider, 'webhook_received', `Meta delivery: ${t.accepted} accepted, ${t.duplicates} duplicate, ${t.failed} failed.`, {
          level: t.failed ? 'warn' : 'info', payload: { trace, accepted: t.accepted },
        });
      }
      res.json({ received: true, accepted, duplicates, ignored, failed, details: details.slice(0, 50) });
    } catch (e) { send(res, e); }
  });

  // ------------------------------------------------------------------ LinkedIn
  // LinkedIn checks a webhook address with GET ?challengeCode=..., expecting the code back with its HMAC-SHA256
  // (hex) keyed by the app's client secret.
  app.get('/api/crm/webhooks/linkedin', (req, res) => {
    const code = String(req.query.challengeCode || '');
    const secret = P.env('LINKEDIN_CLIENT_SECRET');
    if (!secret) return res.status(503).json({ code: 'integration_not_configured', message: 'LINKEDIN_CLIENT_SECRET is not set, so this webhook cannot be verified.' });
    if (!code) return res.status(422).json({ code: 'validation_error', message: 'challengeCode is missing.' });
    const challengeResponse = crypto.createHmac('sha256', secret).update(code).digest('hex');
    res.json({ challengeCode: code, challengeResponse });
  });

  async function companyForLinkedIn(organizationId) {
    if (organizationId) {
      const { data } = await db().from('crm_social_connections').select('company_id').eq('provider', 'linkedin').eq('organization_id', organizationId).limit(1);
      if (data && data[0]) return String(data[0].company_id);
    }
    // no (or unmatched) organization: only when exactly one company has LinkedIn connected is it unambiguous
    const { data } = await db().from('crm_social_connections').select('company_id').eq('provider', 'linkedin').limit(2);
    return data && data.length === 1 ? String(data[0].company_id) : null;
  }

  app.post('/api/crm/webhooks/linkedin', async (req, res) => {
    try {
      if (!db()) throw new CrmError(503, 'unavailable', 'The server is not connected to the database.');
      const raw = await rawBodyOf(req);
      const sig = req.headers['x-li-signature'] ? String(req.headers['x-li-signature']) : null;
      // The original recorded X-Li-Signature without checking it. When LINKEDIN_WEBHOOK_KEY is set it is checked here
      // (hex HMAC-SHA256 of the raw body, optionally prefixed "hmacsha256=").
      const liKey = P.env('LINKEDIN_WEBHOOK_KEY');
      if (liKey) {
        const expected = crypto.createHmac('sha256', liKey).update(raw).digest('hex');
        const got = String(sig || '').trim().replace(/^hmacsha256=/i, '');
        if (!got || !P.safeEqual(expected, got)) throw new CrmError(403, 'invalid_signature', 'Signature verification failed.', { header: 'X-LI-Signature' });
      }
      const payload = jsonFrom(raw, req);
      if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new CrmError(422, 'validation_error', 'The webhook body must be a JSON object.');
      // subscription challenge: acknowledge it so LinkedIn marks the address verified
      if (payload.challenge && !payload.eventType) return res.json({ received: true, challenge: payload.challenge });

      const eventType = payload.eventType || payload.type || null;
      const orgId = payload.organization || payload.organizationId || (payload.resourceOwner || {}).id;
      const companyId = await companyForLinkedIn(orgId ? String(orgId) : '');
      const eventKey = String(payload.leadId || payload.id || payload.eventUrn || sig || '');
      if (!eventKey) throw new CrmError(422, 'validation_error', 'Could not identify this LinkedIn event (no lead id or signature).');

      const claim = await claimEvent({ provider: 'linkedin', eventKey, eventType, signature: sig, headers: {}, payload, companyId });
      if (claim.outcome === 'duplicate') return res.json({ received: true, duplicate: true });
      if (!companyId) {
        await finishEvent(claim.id, { status: 'ignored', error: 'No company is connected for that LinkedIn organization.' });
        return res.json({ received: true, ignored: true, message: 'No connected company matches this organization.' });
      }
      const m = P.linkedinToLead(payload);
      if (!m) {
        await finishEvent(claim.id, { status: 'ignored', companyId, error: 'Payload did not describe an importable lead.' });
        return res.json({ received: true, ignored: true, message: 'Payload did not describe an importable lead.' });
      }
      m.external_id = eventKey;
      const r = await storeLead(P.leadRow(companyId, 'linkedin', m));
      if (r.outcome === 'duplicate') { await finishEvent(claim.id, { status: 'duplicate', companyId }); return res.json({ received: true, duplicate: true }); }
      if (r.outcome === 'failed') {
        await finishEvent(claim.id, { status: 'failed', error: r.error, companyId });
        throw new CrmError(500, 'internal_error', r.error || 'The lead could not be stored.');
      }
      await finishEvent(claim.id, { status: 'processed', companyId });
      await logEvent(companyId, 'linkedin', 'lead_received', `LinkedIn lead from ${m.full_name || m.email}.`, { payload: { event_type: eventType } });
      res.json({ received: true, accepted: true });
    } catch (e) { send(res, e); }
  });

  // ------------------------------------------------------------------ website form
  app.post('/api/crm/webhooks/website-form/:companyId', async (req, res) => {
    try {
      if (!db()) throw new CrmError(503, 'unavailable', 'The server is not connected to the database.');
      const companyId = String(req.params.companyId || '');
      if (!UUID.test(companyId)) throw new CrmError(404, 'not_found', 'Unknown form address.');
      const raw = await rawBodyOf(req);
      const payload = jsonFrom(raw, req);
      if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new CrmError(422, 'validation_error', 'The webhook body must be a JSON object.');

      // the form must belong to a company that opened the website-form integration (that is where its secret lives)
      const connection = await findConnection(companyId, 'website_form', 'id, settings');
      if (!connection) throw new CrmError(404, 'not_found', 'Unknown form address.');
      const secret = connection.settings ? connection.settings.signing_secret : null;
      const header = req.headers['x-argus-signature'] ? String(req.headers['x-argus-signature']) : null;

      // unsigned posts are accepted but flagged; a signature that does not match is refused outright
      let verified = false;
      if (header) {
        if (!secret || !P.verifyFormSignature(secret, raw, header)) {
          await logEvent(companyId, 'website_form', 'webhook_rejected', 'Signature verification failed.', { level: 'error', connectionId: connection.id });
          throw new CrmError(403, 'invalid_signature', 'Signature verification failed.', { header: 'X-Argus-Signature' });
        }
        verified = true;
      }

      const m = P.formToLead(payload);
      if (!m) {
        throw new CrmError(422, 'validation_error', "The submission contained no name or e-mail address, so no lead could be created. Send at least a 'full_name' or 'email' field.");
      }
      const campaign = req.query && req.query.campaign ? String(req.query.campaign).slice(0, 200) : null;
      if (campaign) m.campaign = campaign;
      const submissionId = payload.submission_id || null;
      if (submissionId) m.external_id = String(submissionId).slice(0, 255);
      if (!verified) m.notes = [m.notes, '[Unverified website submission — no signature header was supplied.]'].filter(Boolean).join('\n\n');

      const r = await storeLead(P.leadRow(companyId, 'website_form', m));
      const redirectTo = typeof payload._redirect === 'string' ? payload._redirect : (typeof payload.redirect === 'string' ? payload.redirect : '');
      const goBack = /^https?:\/\//i.test(redirectTo) && String(req.headers['content-type'] || '').includes('application/x-www-form-urlencoded');
      if (r.outcome === 'duplicate') {
        if (goBack) return res.redirect(303, redirectTo);
        return res.json({ received: true, duplicate: true, message: 'That submission has already been recorded.' });
      }
      if (r.outcome === 'failed') throw new CrmError(500, 'internal_error', r.error || 'The lead could not be stored.');
      await logEvent(companyId, 'website_form', 'lead_received', `Website form lead from ${m.full_name || m.email}.`, { connectionId: connection.id, payload: { verified } });
      // a plain HTML form can name a page to show afterwards (_redirect)
      if (goBack) return res.redirect(303, redirectTo);
      res.json({ received: true, accepted: true, verified, lead_id: r.lead ? r.lead.id : null });
    } catch (e) { send(res, e); }
  });
};
