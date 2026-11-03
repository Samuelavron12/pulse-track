// API client.
// The server address is fixed at BUILD time (VITE_API_URL) — users can't change it, so nobody can
// point the app at a wrong server by accident. On the website it defaults to the same server
// that served the page ("/api"); the Android app needs VITE_API_URL (set in GitHub → Variables).
const RAW = (import.meta.env.VITE_API_URL || '').trim().replace(/\/+$/, '');

const store = {
  get: k => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k, v) => { try { localStorage.setItem(k, v); } catch {} },
  del: k => { try { localStorage.removeItem(k); } catch {} },
};

export const isNative = () => !!(typeof window !== 'undefined' && window.Capacitor?.isNativePlatform?.());

function resolveBase() {
  if (RAW) return /\/api$/.test(RAW) ? RAW : `${RAW}/api`;
  return isNative() ? '' : '/api';            // '' = not configured
}
const BASE = resolveBase();
const PLACEHOLDER = /YOUR-BACKEND|example\.com|your-host/i.test(BASE);
const LOCAL_IN_APP = isNative() && /localhost|127\.0\.0\.1|10\.0\.2\.2/.test(BASE);
export const configError = !BASE || PLACEHOLDER || LOCAL_IN_APP
  ? 'This copy of the app was built without a server address. The app owner must set the API_URL variable and rebuild.'
  : null;
export const getApiBase = () => BASE;

export const TOKEN_KEY = 'pt-token';
const getToken = () => store.get(TOKEN_KEY);
export const setToken = t => (t ? store.set(TOKEN_KEY, t) : store.del(TOKEN_KEY));

// Remove cached business data (called on login/logout so one account never sees another's data).
export function clearLocalData() {
  try { Object.keys(localStorage).filter(k => k.startsWith('pt-cache:')).forEach(k => localStorage.removeItem(k)); } catch {}
}

export class ApiError extends Error {
  constructor(message, status, data) { super(message); this.status = status; this.data = data; this.code = data?.code; }
}

const sleep = ms => new Promise(r => setTimeout(r, ms));
const TIMEOUT_MS = 25000;                    // free hosting can take ~20 s to wake up
const RETRY_STATUS = new Set([502, 503, 504]);

async function fetchWithTimeout(url, opts, timeout = TIMEOUT_MS) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeout);
  try { return await fetch(url, { ...opts, signal: opts.signal || ctrl.signal }); }
  finally { clearTimeout(timer); }
}

const netError = () => Object.assign(
  new Error('Can’t reach the server right now. Check your internet connection and try again.'), { offline: true });

async function request(path, { method = 'GET', body, signal, retry } = {}) {
  if (configError) throw Object.assign(new Error(configError), { config: true });
  const headers = { 'Content-Type': 'application/json' };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  const attempts = (retry ?? method === 'GET') ? 3 : 1;      // only retry safe requests
  let lastErr;

  for (let i = 0; i < attempts; i++) {
    if (i) await sleep(1200 * i);
    let res;
    try {
      res = await fetchWithTimeout(`${BASE}${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined, signal });
    } catch { lastErr = netError(); continue; }

    if (RETRY_STATUS.has(res.status) && i < attempts - 1) { lastErr = new ApiError('The server is waking up. Please wait a moment…', res.status); continue; }
    if (res.status === 204) return null;

    const isJson = res.headers.get('content-type')?.includes('application/json');
    const data = isJson ? await res.json().catch(() => ({})) : await res.text().catch(() => '');
    if (res.ok) return data;

    // Only an invalid/expired TOKEN means "logged out". A wrong password, validation error,
    // or temporary server trouble must never throw the user out or say "session expired".
    if (res.status === 401 && (data?.code === 'TOKEN_INVALID' || data?.code === 'NO_TOKEN') && !path.startsWith('/auth/login') && !path.startsWith('/auth/register')) {
      setToken(null); clearLocalData();
      window.dispatchEvent(new Event('pt-logout'));
    }
    if (res.status === 429) throw new ApiError(data?.error || 'Too many attempts. Please wait a minute and try again.', 429, data);
    if (res.status >= 500) throw new ApiError(data?.error || 'The server had a problem. Please try again in a moment.', res.status, data);
    throw new ApiError(data?.error || `Request failed (${res.status})`, res.status, data);
  }
  throw lastErr || netError();
}

export const api = {
  get:    (path, opts)       => request(path, { ...opts }),
  post:   (path, body, opts) => request(path, { method: 'POST', body, ...opts }),
  patch:  (path, body, opts) => request(path, { method: 'PATCH', body, ...opts }),
  delete: (path, opts)       => request(path, { method: 'DELETE', ...opts }),

  // CSV export. In the Android app a blob download is unreliable, so fall back to the Web Share API.
  download: async (path, filename) => {
    const token = getToken();
    let res;
    try { res = await fetchWithTimeout(`${BASE}${path}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} }, 60000); }
    catch { throw netError(); }
    if (!res.ok) throw new ApiError('Export failed.', res.status);
    const blob = await res.blob();
    if (isNative() && navigator.canShare?.({ files: [new File([blob], filename, { type: 'text/csv' })] })) {
      try { await navigator.share({ files: [new File([blob], filename, { type: 'text/csv' })], title: filename }); return; } catch {}
    }
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  },

  upload: async (path, formData) => {
    if (configError) throw Object.assign(new Error(configError), { config: true });
    const token = getToken();
    const headers = token ? { Authorization: `Bearer ${token}` } : {};
    let res;
    try { res = await fetchWithTimeout(`${BASE}${path}`, { method: 'POST', headers, body: formData }, 90000); }
    catch { throw netError(); }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new ApiError(data?.error || 'Upload failed', res.status, data);
    return data;
  },
};

// Wake a sleeping free-tier server as soon as the app opens (fire-and-forget).
export function pingServer() {
  if (configError) return Promise.resolve(false);
  return fetchWithTimeout(`${BASE}/health`, {}, 30000).then(r => r.ok).catch(() => false);
}
