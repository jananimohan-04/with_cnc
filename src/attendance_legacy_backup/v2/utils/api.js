// Small request helper for AI Attendance (works like the axios client the pages were written for:
// api.get/post/put/patch/delete return { data }, failures carry err.response.status and
// err.response.data.detail). Every call goes to our own server under /api/attendance/v1 and is
// signed with the BI sign-in, the same way src/attendance/api.ts signs its calls.
import { supabase } from '@/lib/supabase';
import { API_BASE } from '@/retail/api';
import { isTauri } from '@/lib/desktop/isTauri';

// The desktop app's own pages are not the website, so there the server is reached at the website itself
// (same address the Adviser uses in src/lib/adviser/serverAi.ts).
const WEB_ORIGIN = 'https://with-cnc.vercel.app';
const ORIGIN = String(API_BASE || (isTauri() ? WEB_ORIGIN : '')).replace(/\/+$/, '');

export const API_BASE_URL = `${ORIGIN}/api/attendance/v1`;

const DEFAULT_TIMEOUT = 45000;

function getStoredToken() {
  try {
    return sessionStorage.getItem('cncforge_gtoken') || null;
  } catch {
    return null;
  }
}

/** The BI sign-in token (the same one every attendance call is signed with). */
export async function getAuthToken() {
  let token = getStoredToken();
  if (!token) {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      token = session?.access_token || null;
    } catch {
      // ignore
    }
  }
  return token;
}

async function getAuthHeader() {
  const token = await getAuthToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function doFetch(input, init) {
  if (isTauri()) {
    const { fetch: desktopFetch } = await import('@tauri-apps/plugin-http');
    return desktopFetch(input, init);
  }
  return window.fetch(input, init);
}

function buildUrl(url, params) {
  let full = /^https?:\/\//i.test(url) ? url : `${API_BASE_URL}${url.startsWith('/') ? '' : '/'}${url}`;
  if (params && typeof params === 'object') {
    const qs = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => {
      if (v === undefined || v === null) return;
      if (Array.isArray(v)) v.forEach((item) => qs.append(k, String(item)));
      else qs.append(k, String(v));
    });
    const s = qs.toString();
    if (s) full += (full.includes('?') ? '&' : '?') + s;
  }
  return full;
}

function makeError(message, extra = {}) {
  const err = new Error(message);
  Object.assign(err, extra);
  return err;
}

export const extractErrorMessage = (err, fallback = 'An unexpected error occurred.') => {
  if (!err) return fallback;
  const detail = err.response?.data?.detail ?? err.detail;
  if (typeof detail === 'string' && detail.trim()) return detail;
  if (Array.isArray(detail)) {
    return detail
      .map((d) => {
        if (typeof d === 'string') return d;
        const field = Array.isArray(d?.loc) ? d.loc.filter((l) => l !== 'body').join('.') : '';
        const msg = d?.msg || JSON.stringify(d);
        return field ? `${field}: ${msg}` : msg;
      })
      .join('; ');
  }
  if (detail && typeof detail === 'object') {
    return detail.message || detail.msg || JSON.stringify(detail);
  }
  if (!err.response && (err.message === 'Network Error' || err.code === 'ERR_NETWORK')) {
    return 'Connection issue: the server could not be reached. Please try again in a few seconds.';
  }
  if (typeof err === 'string' && err.trim()) return err;
  if (err.message) return err.message;
  return fallback;
};

async function request(config) {
  const method = (config.method || 'get').toUpperCase();
  const url = buildUrl(config.url || '', config.params);
  const timeout = config.timeout ?? DEFAULT_TIMEOUT;
  const auth = await getAuthHeader();
  const headers = { Accept: 'application/json', ...auth, ...(config.headers || {}) };

  let body;
  if (config.data !== undefined && method !== 'GET' && method !== 'HEAD') {
    if (typeof FormData !== 'undefined' && config.data instanceof FormData) {
      body = config.data;
    } else if (typeof Blob !== 'undefined' && config.data instanceof Blob) {
      body = config.data;
    } else {
      headers['Content-Type'] = headers['Content-Type'] || 'application/json';
      body = typeof config.data === 'string' ? config.data : JSON.stringify(config.data);
    }
  }

  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  let timer = null;
  if (controller && timeout > 0) timer = setTimeout(() => controller.abort(), timeout);

  let res;
  try {
    res = await doFetch(url, { method, headers, body, signal: controller?.signal });
  } catch (e) {
    if (timer) clearTimeout(timer);
    const aborted = e && (e.name === 'AbortError' || controller?.signal?.aborted);
    throw makeError(aborted ? `timeout of ${timeout}ms exceeded` : 'Network Error', {
      code: aborted ? 'ECONNABORTED' : 'ERR_NETWORK',
      config,
      response: undefined,
    });
  }
  if (timer) clearTimeout(timer);

  let data;
  if (config.responseType === 'blob') {
    data = res.ok ? await res.blob() : await res.json().catch(() => ({}));
  } else {
    const text = await res.text().catch(() => '');
    if (text) {
      try {
        data = JSON.parse(text);
      } catch {
        data = text;
      }
    } else {
      data = '';
    }
  }

  const response = {
    data,
    status: res.status,
    statusText: res.statusText,
    headers: Object.fromEntries(res.headers ? Array.from(res.headers.entries()) : []),
    config,
  };

  if (!res.ok) {
    if (!data || typeof data !== 'object') {
      response.data = { detail: typeof data === 'string' && data && !/^\s*</.test(data) ? data : `Request failed with status code ${res.status}` };
    } else if (data.detail === undefined && data.error) {
      response.data = { ...data, detail: data.error };
    }
    const err = makeError(`Request failed with status code ${res.status}`, {
      code: res.status >= 500 ? 'ERR_BAD_RESPONSE' : 'ERR_BAD_REQUEST',
      config,
      response,
    });
    if (response.data.detail && typeof response.data.detail !== 'string') {
      response.data.detail = extractErrorMessage(err);
    }
    throw err;
  }
  return response;
}

async function requestWithRetry(config) {
  let attempt = 0;
  // Auto-retry GET requests on network failures or 502/503/504, like the original client.
  for (;;) {
    try {
      return await request(config);
    } catch (error) {
      const isNetworkOrGateway = !error.response || [502, 503, 504].includes(error.response?.status);
      const isGet = (config.method || 'get').toLowerCase() === 'get';
      if (isNetworkOrGateway && isGet && error.code !== 'ECONNABORTED' && attempt < 3) {
        attempt += 1;
        await new Promise((resolve) => setTimeout(resolve, attempt * 1500));
        continue;
      }
      throw error;
    }
  }
}

function api(config) {
  return requestWithRetry(config || {});
}

api.defaults = { baseURL: API_BASE_URL, timeout: DEFAULT_TIMEOUT };
api.request = (config) => requestWithRetry(config || {});
api.get = (url, config = {}) => requestWithRetry({ ...config, url, method: 'get' });
api.delete = (url, config = {}) => requestWithRetry({ ...config, url, method: 'delete' });
api.post = (url, data, config = {}) => requestWithRetry({ ...config, url, data, method: 'post' });
api.put = (url, data, config = {}) => requestWithRetry({ ...config, url, data, method: 'put' });
api.patch = (url, data, config = {}) => requestWithRetry({ ...config, url, data, method: 'patch' });

/**
 * Downloads a file from the server with the sign-in attached (a plain link / window.open cannot send it).
 * path is relative to /api/attendance/v1, e.g. '/reports/export-csv'.
 */
export async function downloadFromServer(path, fallbackName = 'download') {
  const res = await request({ url: path, method: 'get', responseType: 'blob', timeout: 120000 });
  const blob = res.data;
  let name = fallbackName;
  const cd = res.headers['content-disposition'] || '';
  const m = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(cd);
  if (m && m[1]) {
    try {
      name = decodeURIComponent(m[1]);
    } catch {
      name = m[1];
    }
  }
  const href = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = href;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(href), 4000);
}

export default api;
