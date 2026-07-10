// ⬡B:atmosphere:MODULE:_b_atmosphere_fix_drain_1783705590563_20:20260710⬡
// ENTRANCE: built by the coding department through the validator pipeline
// (cold header injected by the engine; the model never writes its own stamp).
const DIRECTORY_URL = process.env.DIRECTORY_URL;

let cache = null;
let cachePromise = null;

async function getDirectory() {
  if (cache) return cache;
  if (!cachePromise) {
    if (!DIRECTORY_URL) throw new Error('DIRECTORY_URL not set');
    cachePromise = fetch(DIRECTORY_URL)
      .then(res => {
        if (!res.ok) throw new Error(`Directory fetch failed: ${res.status}`);
        return res.json();
      })
      .then(data => {
        cache = data;
        return cache;
      });
  }
  return cachePromise;
}

async function resolveWorld(identifier) {
  const dir = await getDirectory();
  const entry = dir[identifier];
  if (entry && entry.hamUid && entry.worldUrl) {
    return { ok: true, hamUid: entry.hamUid, worldUrl: entry.worldUrl };
  }
  return { ok: false, reason: 'unregistered' };
}

module.exports = { resolveWorld };