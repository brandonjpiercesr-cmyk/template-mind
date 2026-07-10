// ⬡B:atmosphere:MODULE:_b_atmosphere_fix_template_atmosphere_20:20260710⬡
// ENTRANCE: built by the coding department through the validator pipeline
// (cold header injected by the engine; the model never writes its own stamp).
const fetch = global.fetch || (await import('node-fetch')).default;

async function resolveWorld(identifier) {
  console.log('Entering resolveWorld');
  const directoryUrl = process.env.DIRECTORY_URL;
  if (!directoryUrl) {
    throw new Error('DIRECTORY_URL environment variable is not set');
  }

  const response = await fetch(directoryUrl);
  if (!response.ok) {
    throw new Error(`Failed to fetch directory: ${response.status} ${response.statusText}`);
  }

  const directory = await response.json();
  const entry = directory.find(
    (item) =>
      item.phone === identifier ||
      item.email === identifier ||
      item.callerId === identifier
  );

  const result = entry
    ? { ok: true, hamUid: entry.hamUid, worldUrl: entry.worldUrl }
    : { ok: false, reason: 'unregistered' };

  console.log('Exiting resolveWorld');
  return result;
}

module.exports = { resolveWorld };