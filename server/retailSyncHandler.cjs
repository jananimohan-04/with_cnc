/**
 * ERP Inventory ↔ Retail Store Production-Ready Integration Handler
 * Handles all /api/retail-sync/* requests across environments:
 * - Vercel Serverless Function (api/retail-sync.js)
 * - Standalone Node.js server (server/sync-server.cjs)
 * - Vite dev server middleware (vite.config.ts)
 *
 * Keeps API secrets strictly on the server (never exposed to frontend).
 */

const fs = require('fs');
const path = require('path');

// Durable file-backed sync store as a reliable fallback/cache alongside Supabase
const LOGS_FILE = path.join(__dirname, 'retail_sync_logs.json');
let syncLogs = [];
try {
  if (fs.existsSync(LOGS_FILE)) {
    syncLogs = JSON.parse(fs.readFileSync(LOGS_FILE, 'utf8'));
  }
} catch (e) {
  syncLogs = [];
}

function saveLogs() {
  try {
    fs.writeFileSync(LOGS_FILE, JSON.stringify(syncLogs.slice(0, 1000), null, 2), 'utf8');
  } catch (e) {}
}

function loadLocalEnv() {
  const root = path.join(__dirname, '..');
  for (const f of ['.env.local', '.env']) {
    const p = path.join(root, f);
    if (fs.existsSync(p)) {
      try {
        const lines = fs.readFileSync(p, 'utf8').split('\n');
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith('#')) continue;
          const idx = trimmed.indexOf('=');
          if (idx > 0) {
            const k = trimmed.slice(0, idx).trim();
            const v = trimmed.slice(idx + 1).trim();
            if (!process.env[k]) process.env[k] = v;
          }
        }
      } catch (e) {}
    }
  }
}
loadLocalEnv();

// Config from environment variables. Nothing secret is written in the code:
//   RETAIL_STORE_API_BASE_URL   where the retail store runs (default http://localhost:4000)
//   RETAIL_STORE_API_KEY        the shared ERP <-> retail key (also read from ERP_INTEGRATION_KEY); required
//   RETAIL_COMPANY_ID           the company code the retail store knows this ERP company by (default C-ARGUS)
//   VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY   the ERP database (also read as SUPABASE_URL / SUPABASE_ANON_KEY)
//   SUPABASE_SERVICE_ROLE_KEY + ERP_COMPANY_ID   only for the retail store's order webhook (/order-deduct):
//                                                the ERP company (uuid) whose stock a retail order reduces
const env = (...names) => { for (const n of names) if (process.env[n]) return process.env[n]; return ''; };
const SUPABASE_SECRET = env('SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_SECRET_KEY', 'SUPABASE_SERVICE_KEY');
// The Retail Store runs in this same deployment, so nothing has to be set by hand: the shared key is derived from the Supabase secret
// (the Retail server derives the very same value) and its address is this site's own address.
const DERIVED_KEY = SUPABASE_SECRET ? require('crypto').createHash('sha256').update('erp-retail-sync:' + SUPABASE_SECRET).digest('hex').slice(0, 40) : '';
const RETAIL_STORE_API_BASE_URL_ENV = env('RETAIL_STORE_API_BASE_URL');
const RETAIL_STORE_API_KEY = env('RETAIL_STORE_API_KEY', 'ERP_INTEGRATION_KEY') || DERIVED_KEY;
function retailBase(req) {
  if (RETAIL_STORE_API_BASE_URL_ENV) return RETAIL_STORE_API_BASE_URL_ENV.replace(/\/$/, '');
  if (process.env.VERCEL && req && req.headers) {
    const host = req.headers['x-forwarded-host'] || req.headers.host;
    if (host) return `${req.headers['x-forwarded-proto'] || 'https'}://${host}`;
  }
  return 'http://localhost:4000';
}
const RETAIL_STORE_API_BASE_URL = RETAIL_STORE_API_BASE_URL_ENV || 'http://localhost:4000';
const RETAIL_COMPANY_ID = env('RETAIL_COMPANY_ID') || 'C-ARGUS';
const SUPABASE_URL = env('VITE_SUPABASE_URL', 'SUPABASE_URL');
const SUPABASE_ANON_KEY = env('VITE_SUPABASE_ANON_KEY', 'SUPABASE_ANON_KEY');
const SUPABASE_SERVICE_ROLE_KEY = SUPABASE_SECRET;
const ERP_COMPANY_ID = env('ERP_COMPANY_ID');
const NOT_CONFIGURED = 'RETAIL_STORE_API_KEY is not set on the server, so the Retail Store cannot be reached. Add it to the server environment (.env.local for local dev).';

// Designated warehouse storage per company (persistent fallback)
const DESIGNATIONS_FILE = path.join(__dirname, 'retail_warehouse_designations.json');
let designations = {};
function loadDesignations() {
  try {
    if (fs.existsSync(DESIGNATIONS_FILE)) {
      designations = JSON.parse(fs.readFileSync(DESIGNATIONS_FILE, 'utf8'));
    }
  } catch (e) {}
  return designations || {};
}
loadDesignations();

function saveDesignations() {
  try {
    fs.writeFileSync(DESIGNATIONS_FILE, JSON.stringify(designations, null, 2), 'utf8');
  } catch (e) {}
}

// Helper: parse body if not parsed
async function parseBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  return new Promise((resolve) => {
    let data = '';
    req.on('data', chunk => { data += chunk; });
    req.on('end', () => {
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch (e) {
        resolve({});
      }
    });
  });
}

function sendJson(res, status, data) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(data));
}

// Call a Supabase RPC. `token` is the signed-in user's JWT (the functions work out the company from it);
// the service-role call for the order webhook passes the service key instead.
async function callSupabaseRpc(fn, args, token, apiKey) {
  if (!SUPABASE_URL || !(apiKey || SUPABASE_ANON_KEY)) return { ok: false, error: 'Supabase URL / key not configured on the server' };
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
      method: 'POST',
      headers: {
        'apikey': apiKey || SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${token || apiKey || SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(args || {})
    });
    if (!res.ok) {
      return { ok: false, status: res.status, error: await res.text() };
    }
    return { ok: true, data: await res.json() };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

/* Who is calling? The signed-in BI user's token is checked by the database itself (erp_current_user only returns an
   Active user of an Active company). The company always comes from that user - never from a header or the request body. */
async function restGet(pathAndQuery, token) {
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${pathAndQuery}`, { headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` } });
    return res.ok ? await res.json() : null;
  } catch (e) { return null; }
}
async function authenticate(req) {
  const token = bearer(req);
  if (!token) return { ok: false, status: 401, error: 'Sign in to Business Intelligence first' };
  const who = await callSupabaseRpc('erp_current_user', {}, token);
  const me = who.ok ? who.data : null;
  if (!me || !me.id) return { ok: false, status: 401, error: 'Your sign-in was not accepted (expired, inactive user or suspended company)' };
  let companyUuid = me.company_id;
  if (me.role === 'SUPER_ADMIN') {   // a Super Admin works inside the company chosen in BI
    const rc = await callSupabaseRpc('erp_report_company', {}, token);
    companyUuid = rc.ok && typeof rc.data === 'string' ? rc.data : null;
  }
  if (!companyUuid) return { ok: false, status: 400, error: 'No company selected' };
  const rows = await restGet(`companies?id=eq.${encodeURIComponent(companyUuid)}&select=code,company_name`, token);
  const co = Array.isArray(rows) ? rows[0] : null;
  if (!co) return { ok: false, status: 403, error: 'Company not available' };
  return { ok: true, role: me.role, companyUuid, companyCode: co.code || ('C-' + String(co.company_name || 'CO').slice(0, 3).toUpperCase()) };
}
/* the ERP company (uuid) behind a Retail company code - used by the Retail order webhook, with the service key */
async function erpCompanyForRetailCode(code) {
  if (!code || !SUPABASE_SERVICE_ROLE_KEY || !SUPABASE_URL) return null;
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/companies?code=eq.${encodeURIComponent(code)}&select=id`, { headers: { apikey: SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}` } });
    const rows = res.ok ? await res.json() : [];
    return rows && rows[0] ? rows[0].id : null;
  } catch (e) { return null; }
}

const bearer = (req) => String(req.headers['authorization'] || '').replace(/^Bearer\s+/i, '') || '';
const sameKey = (a, b) => {
  if (!a || !b) return false;
  try { return require('crypto').timingSafeEqual(Buffer.from(String(a)), Buffer.from(String(b))); } catch { return false; }
};

/**
 * Main request router for /api/retail-sync
 */
async function handleRetailSyncRequest(req, res) {
  loadDesignations();
  // Extract path relative to /api/retail-sync
  const urlObj = new URL(req.url, 'http://localhost');
  let subpath = urlObj.pathname.replace(/^\/api\/retail-sync/, '');
  if (!subpath || subpath === '') subpath = '/';

  const method = req.method.toUpperCase();

  // everything except the Retail Store's own order webhook needs a real BI sign-in
  let authCompany = null, authRole = null;
  if (subpath !== '/order-deduct' && subpath !== '/order-record') {
    const a = await authenticate(req);
    if (!a.ok) return sendJson(res, a.status, { ok: false, error: a.error });
    authCompany = a.companyCode; authRole = a.role;
  }

  // 1. GET /api/retail-sync/status
  if (method === 'GET' && (subpath === '/status' || subpath === '/')) {
    const companyId = authCompany;
    if (!RETAIL_STORE_API_KEY) return sendJson(res, 200, { ok: false, connection: 'disconnected', storeUrl: retailBase(req), error: NOT_CONFIGURED, syncSummary: { synced: 0, pending: 0, failed: 0, updated: 0, removed: 0, total: 0 }, designatedWarehouse: designations[companyId] || null });
    try {
      const storeRes = await fetch(`${retailBase(req)}/api/integrations/erp/status`, {
        headers: {
          'x-erp-api-key': RETAIL_STORE_API_KEY,
          'x-company-id': companyId
        }
      });

      let storeData = null;
      if (storeRes.ok) {
        const j = await storeRes.json();
        storeData = j.data || j;
      }

      // Compute summary from durable logs
      const coLogs = syncLogs.filter(l => !l.companyId || l.companyId === companyId);
      const summary = {
        synced: coLogs.filter(l => l.sync_status === 'synced').length,
        pending: coLogs.filter(l => l.sync_status === 'pending').length,
        failed: coLogs.filter(l => l.sync_status === 'failed').length,
        updated: coLogs.filter(l => l.sync_status === 'updated').length,
        removed: coLogs.filter(l => l.sync_status === 'removed').length,
        total: coLogs.length
      };

      return sendJson(res, 200, {
        ok: true,
        connection: storeRes.ok ? 'connected' : 'disconnected',
        storeUrl: retailBase(req),
        store: storeData?.store || null,
        metrics: storeData?.metrics || null,
        syncSummary: summary,
        designatedWarehouse: designations[companyId] || null
      });
    } catch (err) {
      return sendJson(res, 200, {
        ok: false,
        connection: 'disconnected',
        storeUrl: retailBase(req),
        error: err.message,
        syncSummary: {
          synced: syncLogs.filter(l => l.sync_status === 'synced').length,
          pending: syncLogs.filter(l => l.sync_status === 'pending').length,
          failed: syncLogs.filter(l => l.sync_status === 'failed').length,
          updated: syncLogs.filter(l => l.sync_status === 'updated').length,
          removed: syncLogs.filter(l => l.sync_status === 'removed').length,
          total: syncLogs.length
        },
        designatedWarehouse: designations[companyId] || null
      });
    }
  }

  // 2. POST /api/retail-sync/sync-item
  if (method === 'POST' && subpath === '/sync-item') {
    const body = await parseBody(req);
    const companyId = authCompany;
    if (!RETAIL_STORE_API_KEY) return sendJson(res, 503, { ok: false, error: NOT_CONFIGURED });

    // Resilient SKU extraction across all possible fields
    const rawSku = body.sku || body.code || body.part_number || body.part_no || body.item_code || body.itemCode || body.product || body.erp_item_id || body.id || '';
    let sku = String(rawSku).trim();
    if (!sku) {
      const namePart = (body.name || body.item_name || 'ITEM').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8) || 'ITEM';
      sku = `SKU-${namePart}-${Date.now().toString(36).slice(-4).toUpperCase()}`;
    }
    body.sku = sku;
    body.code = body.code || sku;
    body.name = body.name || body.item_name || body.part_name || sku;

    // Resilient warehouse handling
    const des = designations[companyId];
    if (!body.warehouse || body.warehouse === 'Other Warehouse') {
      body.warehouse = des?.warehouse_name || 'Retail Store Warehouse';
    }
    if (body.is_retail_warehouse === undefined) {
      body.is_retail_warehouse = true;
    }
    const idempotencyKey = req.headers['x-idempotency-key'] || body.idempotency_key || `erp-sync-${sku}-${Date.now()}`;

    try {
      const storeRes = await fetch(`${retailBase(req)}/api/integrations/erp/sync-product`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-erp-api-key': RETAIL_STORE_API_KEY,
          'x-company-id': companyId,
          'x-idempotency-key': idempotencyKey
        },
        body: JSON.stringify({
          ...body,
          companyId
        })
      });

      const storeJson = await storeRes.json();
      if (!storeRes.ok) {
        throw new Error(storeJson.error || `Retail Store responded with ${storeRes.status}`);
      }

      const syncResult = storeJson.data || storeJson;
      const status = syncResult.action === 'deactivated' ? 'removed' :
        syncResult.action === 'updated' ? 'updated' : 'synced';

      // Record in durable sync log
      const logEntry = {
        id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        companyId,
        item_kind: body.item_kind || 'PART',
        item_id: body.erp_item_id || body.id || '',
        item_code: body.sku || body.code || '',
        item_name: body.name || '',
        warehouse_id: body.warehouse_id || '',
        warehouse_name: body.warehouse || '',
        erp_stock: Number(body.stock || 0),
        retail_stock: Number(syncResult.product?.stock ?? body.stock ?? 0),
        sync_status: status,
        last_sync_at: new Date().toISOString(),
        error_message: null,
        retry_count: 0,
        idempotency_key: idempotencyKey
      };

      // Upsert in local syncLogs
      const existingIdx = syncLogs.findIndex(l => l.item_code === logEntry.item_code && l.companyId === companyId);
      if (existingIdx >= 0) syncLogs[existingIdx] = { ...syncLogs[existingIdx], ...logEntry };
      else syncLogs.unshift(logEntry);
      saveLogs();

      // Persist to the database as the signed-in user (awaited, so a failure is reported instead of lost)
      const token = bearer(req);
      let dbLogged = false, dbError = null;
      if (token && logEntry.item_id && logEntry.item_code) {
        const r = await callSupabaseRpc('erp_record_retail_sync', { p_entry: logEntry }, token);
        dbLogged = r.ok; dbError = r.ok ? null : r.error;
      }

      return sendJson(res, 200, {
        ok: true,
        action: syncResult.action,
        product: syncResult.product,
        log: logEntry,
        dbLogged,
        dbError
      });
    } catch (err) {
      // Record failure in log
      const failedEntry = {
        id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        companyId,
        item_kind: body.item_kind || 'PART',
        item_id: body.erp_item_id || body.id || '',
        item_code: body.sku || body.code || '',
        item_name: body.name || '',
        warehouse_id: body.warehouse_id || '',
        warehouse_name: body.warehouse || '',
        erp_stock: Number(body.stock || 0),
        retail_stock: null,
        sync_status: 'failed',
        last_sync_at: new Date().toISOString(),
        error_message: err.message,
        retry_count: 1,
        idempotency_key: idempotencyKey
      };

      const existingIdx = syncLogs.findIndex(l => l.item_code === failedEntry.item_code && l.companyId === companyId);
      if (existingIdx >= 0) {
        failedEntry.retry_count = (syncLogs[existingIdx].retry_count || 0) + 1;
        syncLogs[existingIdx] = { ...syncLogs[existingIdx], ...failedEntry };
      } else {
        syncLogs.unshift(failedEntry);
      }
      saveLogs();
      const token = bearer(req);
      if (token && failedEntry.item_id && failedEntry.item_code) {
        await callSupabaseRpc('erp_record_retail_sync', { p_entry: failedEntry }, token);
      }

      return sendJson(res, 400, { ok: false, error: err.message, log: failedEntry });
    }
  }

  // 3. POST /api/retail-sync/sync-all (Bulk synchronization)
  if (method === 'POST' && subpath === '/sync-all') {
    const body = await parseBody(req);
    const companyId = authCompany;
    const rawItems = Array.isArray(body.items) ? body.items : [];
    if (!RETAIL_STORE_API_KEY) return sendJson(res, 503, { ok: false, error: NOT_CONFIGURED });

    const des = designations[companyId];
    const items = rawItems.map(it => {
      const rawSku = it.sku || it.code || it.part_number || it.part_no || it.item_code || it.itemCode || it.product || it.erp_item_id || it.id || '';
      let sku = String(rawSku).trim();
      if (!sku) {
        const namePart = (it.name || it.item_name || 'ITEM').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8) || 'ITEM';
        sku = `SKU-${namePart}-${Date.now().toString(36).slice(-4).toUpperCase()}`;
      }
      return {
        ...it,
        sku,
        code: it.code || sku,
        name: it.name || it.item_name || it.part_name || sku,
        warehouse: (it.warehouse && it.warehouse !== 'Other Warehouse') ? it.warehouse : (des?.warehouse_name || 'Retail Store Warehouse'),
        is_retail_warehouse: it.is_retail_warehouse !== false
      };
    });

    try {
      const storeRes = await fetch(`${retailBase(req)}/api/integrations/erp/sync-batch`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-erp-api-key': RETAIL_STORE_API_KEY,
          'x-company-id': companyId,
          'x-idempotency-key': `batch-${Date.now()}`
        },
        body: JSON.stringify({
          companyId,
          items
        })
      });

      const storeJson = await storeRes.json();
      if (!storeRes.ok) {
        throw new Error(storeJson.error || `Retail Store responded with ${storeRes.status}`);
      }

      const result = storeJson.data || storeJson;

      // Update sync logs for items (an item the Retail Store refused is logged as failed, not as synced)
      const failedBy = {};
      for (const e of (result.errors || [])) failedBy[e.index] = e.error;
      const token = bearer(req);
      const dbEntries = [];
      for (let idx = 0; idx < items.length; idx++) {
        const it = items[idx];
        const failedMsg = failedBy[idx];
        const status = failedMsg ? 'failed' : (it.is_retail_warehouse !== false ? 'synced' : 'removed');
        const existingIdx = syncLogs.findIndex(l => l.item_code === it.sku && l.companyId === companyId);
        const entry = {
          id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          companyId,
          item_kind: it.item_kind || 'PART',
          item_id: it.erp_item_id || it.id || '',
          item_code: it.sku || it.code || '',
          item_name: it.name || '',
          warehouse_id: it.warehouse_id || '',
          warehouse_name: it.warehouse || '',
          erp_stock: Number(it.stock || 0),
          retail_stock: failedMsg ? null : Number(it.stock || 0),
          sync_status: status,
          last_sync_at: new Date().toISOString(),
          error_message: failedMsg || null,
          retry_count: failedMsg ? 1 : 0
        };
        if (existingIdx >= 0) syncLogs[existingIdx] = { ...syncLogs[existingIdx], ...entry };
        else syncLogs.unshift(entry);
        if (entry.item_id && entry.item_code) dbEntries.push(entry);
      }
      saveLogs();
      // the sync log screen reads the database, so write each item there too (as the signed-in user)
      if (token) await Promise.all(dbEntries.map(e => callSupabaseRpc('erp_record_retail_sync', { p_entry: e }, token)));

      return sendJson(res, 200, { ok: true, batchResult: result });
    } catch (err) {
      return sendJson(res, 400, { ok: false, error: err.message });
    }
  }

  // 4. GET /api/retail-sync/logs
  if (method === 'GET' && subpath === '/logs') {
    const companyId = authCompany;
    const status = urlObj.searchParams.get('status');
    const q = (urlObj.searchParams.get('q') || '').toLowerCase();

    let list = syncLogs.filter(l => !companyId || l.companyId === companyId);
    if (status && status !== 'all') {
      list = list.filter(l => l.sync_status === status);
    }
    if (q) {
      list = list.filter(l => (l.item_code + ' ' + l.item_name).toLowerCase().includes(q));
    }
    return sendJson(res, 200, { ok: true, logs: list });
  }

  // 5. POST /api/retail-sync/designate-warehouse
  if (method === 'POST' && subpath === '/designate-warehouse') {
    const body = await parseBody(req);
    const companyId = authCompany;
    if (authRole !== 'SUPER_ADMIN' && authRole !== 'COMPANY_ADMIN') return sendJson(res, 403, { ok: false, error: 'Only an admin can choose the Retail Store warehouse' });
    const warehouseId = body.warehouse_id;
    const warehouseName = body.warehouse_name || 'Retail Store Warehouse';

    if (!warehouseId) {
      return sendJson(res, 400, { error: 'warehouse_id is required' });
    }

    designations[companyId] = {
      warehouse_id: warehouseId,
      warehouse_name: warehouseName,
      designated_at: new Date().toISOString()
    };
    saveDesignations();

    const token = bearer(req);
    let dbSaved = false, dbError = null;
    if (token) {
      const r = await callSupabaseRpc('erp_designate_retail_warehouse', { p_warehouse_id: String(warehouseId) }, token);
      dbSaved = r.ok; dbError = r.ok ? null : r.error;
    }

    return sendJson(res, 200, { ok: true, designation: designations[companyId], dbSaved, dbError });
  }

  // 6. POST /api/retail-sync/order-deduct (the Retail Store reports an order; the ERP stock is reduced)
  if (method === 'POST' && subpath === '/order-deduct') {
    if (!RETAIL_STORE_API_KEY) return sendJson(res, 503, { success: false, error: NOT_CONFIGURED });
    if (!sameKey(req.headers['x-erp-api-key'], RETAIL_STORE_API_KEY)) {
      return sendJson(res, 401, { success: false, error: 'Unauthorized: Invalid ERP integration key' });
    }
    if (!SUPABASE_SERVICE_ROLE_KEY) {
      return sendJson(res, 503, { success: false, error: 'Order deduction is not configured: set SUPABASE_SERVICE_ROLE_KEY on the server. No stock was changed.' });
    }

    const body = await parseBody(req);
    const { order_id, items, customer } = body;
    // the ERP company is the one that owns the Retail company the order was placed in
    const retailCo = String(body.company_id || req.headers['x-company-id'] || '');
    let erpCompany = await erpCompanyForRetailCode(retailCo);
    if (!erpCompany && ERP_COMPANY_ID && (!retailCo || retailCo === RETAIL_COMPANY_ID)) erpCompany = ERP_COMPANY_ID;   // single-company setups
    if (!erpCompany) return sendJson(res, 404, { success: false, error: `No ERP company matches Retail company "${retailCo}". No stock was changed.` });
    if (!order_id || !Array.isArray(items) || !items.length) {
      return sendJson(res, 400, { success: false, error: 'order_id and items[] are required' });
    }

    const rpcRes = await callSupabaseRpc('erp_retail_deduct_stock_service', {
      p_company: erpCompany,
      p_deduction: {
        order_id: String(order_id),
        items,
        customer: customer || 'Retail Store Order',
        idempotency_key: body.idempotency_key || `erp-deduct-${order_id}`
      }
    }, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_SERVICE_ROLE_KEY);

    if (rpcRes.ok && rpcRes.data?.success) {
      return sendJson(res, 200, rpcRes.data);
    }
    // Refused (unknown item, not enough stock, database function missing...): say so, so the store does not treat it as done.
    let msg = rpcRes.error || 'Stock could not be deducted';
    try { const j = JSON.parse(msg); msg = j.message || msg; } catch (e) { /* plain text */ }
    return sendJson(res, rpcRes.status && rpcRes.status < 500 ? 409 : 502, { success: false, order_id, error: msg, note: 'No ERP stock was changed.' });
  }

  // 7. POST /api/retail-sync/order-record (the Retail Store sends every order, with who ordered it, so Business Intelligence lists it)
  if (method === 'POST' && subpath === '/order-record') {
    if (!RETAIL_STORE_API_KEY) return sendJson(res, 503, { success: false, error: NOT_CONFIGURED });
    if (!sameKey(req.headers['x-erp-api-key'], RETAIL_STORE_API_KEY)) return sendJson(res, 401, { success: false, error: 'Unauthorized: Invalid ERP integration key' });
    if (!SUPABASE_SERVICE_ROLE_KEY) return sendJson(res, 503, { success: false, error: 'Set SUPABASE_SERVICE_ROLE_KEY on the server.' });
    const body = await parseBody(req);
    const retailCo = String(body.company_id || req.headers['x-company-id'] || '');
    let erpCompany = await erpCompanyForRetailCode(retailCo);
    if (!erpCompany && ERP_COMPANY_ID && (!retailCo || retailCo === RETAIL_COMPANY_ID)) erpCompany = ERP_COMPANY_ID;
    if (!erpCompany) return sendJson(res, 404, { success: false, error: `No ERP company matches Retail company "${retailCo}".` });
    if (!body.order || !body.order.order_no) return sendJson(res, 400, { success: false, error: 'order.order_no is required' });
    const r = await callSupabaseRpc('erp_retail_record_order', { p_company: erpCompany, p_order: body.order }, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_SERVICE_ROLE_KEY);
    if (r.ok && r.data?.success) return sendJson(res, 200, r.data);
    let msg = r.error || 'Order could not be recorded';
    try { const j = JSON.parse(msg); msg = j.message || msg; } catch (e) { /* plain text */ }
    return sendJson(res, 502, { success: false, error: msg });
  }

  // 404 for unknown subpaths
  return sendJson(res, 404, { error: `Unknown endpoint /api/retail-sync${subpath}` });
}

module.exports = {
  handleRetailSyncRequest,
  RETAIL_STORE_API_BASE_URL
};
