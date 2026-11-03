// Offline queue (IndexedDB). Sales and expenses made without internet are stored here
// and pushed to the server automatically when the connection returns.
// Each record carries a unique offline_id, so the server ignores duplicates (safe to retry).

const DB_NAME = 'pulse-track-offline';
const DB_VERSION = 1;
const STORE = 'queue';

function openDB() {
  return new Promise((resolve, reject) => {
    if (!('indexedDB' in window)) return reject(new Error('IndexedDB unavailable'));
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = e => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const s = db.createObjectStore(STORE, { keyPath: 'offlineId' });
        s.createIndex('status', 'status');
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
const tx = async (mode, fn) => {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const out = fn(t.objectStore(STORE));
    t.oncomplete = () => resolve(out?.result);
    t.onerror = () => reject(t.error);
  });
};

export async function enqueue(type, payload) {
  const offlineId = `${type}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  await tx('readwrite', s => s.put({ offlineId, type, payload, status: 'pending', createdAt: new Date().toISOString() }));
  window.dispatchEvent(new Event('pt-queue-changed'));
  return offlineId;
}
export const getAll = () => tx('readonly', s => s.getAll()).then(r => r || []);
export const getPending = async () => (await getAll()).filter(i => i.status === 'pending');
export const getFailed = async () => (await getAll()).filter(i => i.status === 'failed');
export const countPending = async () => (await getPending()).length;

async function update(offlineId, patch) {
  const all = await getAll();
  const item = all.find(i => i.offlineId === offlineId);
  if (item) await tx('readwrite', s => s.put({ ...item, ...patch }));
}
export async function retryFailed() {
  for (const f of await getFailed()) await update(f.offlineId, { status: 'pending', error: null });
  window.dispatchEvent(new Event('pt-queue-changed'));
}
export async function discardFailed() {
  for (const f of await getFailed()) await tx('readwrite', s => s.delete(f.offlineId));
  window.dispatchEvent(new Event('pt-queue-changed'));
}
async function purgeSynced() {
  const cutoff = Date.now() - 3 * 864e5;
  for (const i of await getAll()) if (i.status === 'synced' && new Date(i.createdAt).getTime() < cutoff) await tx('readwrite', s => s.delete(i.offlineId));
}

let flushing = false;
/** Push pending records. Returns { synced, failed, conflicts, networkError }. */
export async function flushQueue(apiPost) {
  if (flushing) return { synced: 0, failed: 0, conflicts: 0 };
  flushing = true;
  try {
    const pending = await getPending();
    if (!pending.length) return { synced: 0, failed: 0, conflicts: 0 };
    let synced = 0, failed = 0, conflicts = 0;
    for (let i = 0; i < pending.length; i += 25) {
      const batch = pending.slice(i, i + 25);
      let data;
      try {
        data = await apiPost('/sync/push', { device_id: 'app', items: batch.map(b => ({ offline_id: b.offlineId, type: b.type, payload: b.payload, created_at: b.createdAt })) });
      } catch (e) {
        if (e.offline || e.status >= 500 || !e.status) return { synced, failed, conflicts, networkError: true };
        throw e;
      }
      for (const r of data.results) {
        if (r.status === 'synced' || r.status === 'conflict') { await update(r.offline_id, { status: 'synced' }); synced++; if (r.status === 'conflict') conflicts++; }
        else if (r.permanent) { await update(r.offline_id, { status: 'failed', error: r.error }); failed++; }
        // non-permanent errors stay pending and are retried next time
      }
    }
    await purgeSynced();
    window.dispatchEvent(new Event('pt-queue-changed'));
    return { synced, failed, conflicts };
  } finally { flushing = false; }
}
