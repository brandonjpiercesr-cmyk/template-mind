// ⬡B:reachOut:MODULE:_b_reachout_fix_template_reachout_2_2026:20260710⬡
// ENTRANCE: built by the coding department through the validator pipeline
// (cold header injected by the engine; the model never writes its own stamp).
const fetch = require('node-fetch');

async function send(env, channel, payload) {
  // Kill‑switch guard
  if (env && env.KILL_ACTIVE) {
    return { ok: false, held: true, reason: 'kill_switch' };
  }

  // Payload validation
  if (!payload || typeof payload.text !== 'string' || payload.text.trim() === '') {
    return { ok: false, held: false, reason: 'no_text' };
  }

  // Delivery routing
  const text = payload.text;
  if (channel === 'email') {
    const endpoint = env.EMAIL_ENDPOINT;
    const apiKey = env.EMAIL_API_KEY;
    if (!endpoint || !apiKey) {
      return { ok: false, held: false, reason: 'missing_email_config' };
    }
    await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ text })
    });
    return { ok: true, channel: 'email', delivered: true };
  }

  if (channel === 'voice') {
    const endpoint = env.VOICE_ENDPOINT;
    const apiKey = env.VOICE_API_KEY;
    if (!endpoint || !apiKey) {
      return { ok: false, held: false, reason: 'missing_voice_config' };
    }
    await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ text })
    });
    return { ok: true, channel: 'voice', delivered: true };
  }

  // Unknown channel
  return { ok: false, held: false, reason: 'unknown_channel' };
}

module.exports = { send };