// Tiny JSON cache in localStorage so POS & Suppliers keep working with no internet.
export function cacheSet(key, value) {
  try { localStorage.setItem(`pt-cache:${key}`, JSON.stringify({ at: Date.now(), value })); } catch {}
}
export function cacheGet(key, fallback = null) {
  try { const r = JSON.parse(localStorage.getItem(`pt-cache:${key}`)); return r ? r.value : fallback; } catch { return fallback; }
}
// Network-first read: returns fresh data and refreshes the cache; falls back to the cache when offline.
export async function cachedGet(api, path, cacheKey = path) {
  try { const d = await api.get(path); cacheSet(cacheKey, d); return { data: d, stale: false }; }
  catch (e) {
    if (e.offline) { const c = cacheGet(cacheKey); if (c) return { data: c, stale: true }; }
    throw e;
  }
}
