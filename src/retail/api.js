/* API client — same Express endpoints, same payloads/shapes as the legacy frontend. */
const SES_KEY = 'cncforge_session';
const CART_KEY = 'cncforge_cart';

export function getSession() {
  try {
    const s = JSON.parse(localStorage.getItem(SES_KEY) || 'null');
    if (s && s.role) return s;
  } catch { /* noop */ }
  return {
    role: 'super_admin',
    name: 'Janani Mohan',
    companyId: null,
    email: 'jananimohan44@gmail.com'
  };
}
export function setSession(s) {
  if (s) localStorage.setItem(SES_KEY, JSON.stringify(s));
  else localStorage.removeItem(SES_KEY);
}
export function getCart() {
  try { return JSON.parse(localStorage.getItem(CART_KEY) || '[]'); } catch { return []; }
}
export function setCart(c) { localStorage.setItem(CART_KEY, JSON.stringify(c)); }
export function googleToken() {
  try { return sessionStorage.getItem('cncforge_gtoken') || null; } catch { return null; }
}
export function setGoogleToken(t) {
  try { if (t) sessionStorage.setItem('cncforge_gtoken', t); else sessionStorage.removeItem('cncforge_gtoken'); } catch { /* noop */ }
}

function headers() {
  const s = getSession() || { role: 'sales_user', companyId: 'C-ARGUS', name: 'Argus User' };
  const t = googleToken();
  const cid = s.role === 'super_admin' ? (s.companyId || '') : (s.companyId || 'C-ARGUS');
  return {
    'Content-Type': 'application/json',
    'x-role': s.role || 'sales_user',
    'x-company-id': cid,
    'x-user-name': s.name || '',
    'x-user-email': s.email || '',
    'x-user-id': s.id || '',
    ...(t ? { Authorization: 'Bearer ' + t } : {})
  };
}

export const API_BASE = String(
  (typeof import.meta !== 'undefined' && import.meta?.env?.VITE_API_URL) ||
  (typeof import.meta !== 'undefined' && import.meta?.env?.VITE_API_BASE_URL) ||
  ''
).replace(/\/$/, '');

function resolveUrl(u) {
  if (!u) return u;
  if (/^https?:\/\//i.test(u)) return u;
  if (API_BASE && u.startsWith('/')) return `${API_BASE}${u}`;
  return u;
}

async function req(method, url, body) {
  const fullUrl = resolveUrl(url);
  const r = await fetch(fullUrl, { method, headers: headers(), body: body ? JSON.stringify(body) : undefined });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error((j && j.error) || ('HTTP ' + r.status));
  return j.data;
}

export const api = {
  get: (u) => req('GET', u),
  post: (u, b) => req('POST', u, b),
  put: (u, b) => req('PUT', u, b),
  patch: (u, b) => req('PATCH', u, b),
  del: (u) => req('DELETE', u)
};

export async function uploadFiles(files) {
  const s = getSession() || { role: 'sales_user', companyId: 'C-ARGUS', name: 'Argus User' };
  const t = googleToken();
  const cid = s.role === 'super_admin' ? (s.companyId || '') : (s.companyId || 'C-ARGUS');
  const fd = new FormData();
  [...files].forEach((f) => fd.append('files', f));
  const fullUrl = resolveUrl('/api/uploads');
  const r = await fetch(fullUrl, {
    method: 'POST',
    headers: {
      'x-role': s.role || 'sales_user',
      'x-company-id': cid,
      'x-user-name': s.name || '',
      ...(t ? { Authorization: 'Bearer ' + t } : {})
    },
    body: fd
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error((j && j.error) || ('HTTP ' + r.status));
  return j.data;
}

export const fmt = (n) => (n == null ? 'On request' : '₹' + Number(n).toLocaleString('en-IN'));
export const imgFallback = (seed, w = 700, h = 525) =>
  `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 24 24" fill="none" stroke="%2394a3b8" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="background-color:%23f1f5f9"><rect width="24" height="24" fill="%23f1f5f9"/><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="m3.3 7 8.7 5 8.7-5"/><path d="M12 22V12"/></svg>`;

