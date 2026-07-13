// ⬡B:core.directive.vocabulary:MODULE:a2ui_shaped_directives:20260708⬡
// entered via the ABAHAM door, serving channel internal
// Phase 2 of ANU_LIVE. The language A'NU speaks over the wire, drawn directly from the
// real A2UI shape rather than a competing invention: four proven primitives, not fifty.
// Directives DESCRIBE what should appear, they never carry executable code, so an agent
// that can only describe intent cannot inject anything dangerous by construction. Large
// repeated state travels as JSON Patch differences (RFC 6902), not full state resent.
'use strict';

// --- The four primitives ---
function createSurface(surfaceId, opts) {
  return { v: 1, op: 'createSurface', surfaceId: String(surfaceId), region: (opts && opts.region) || 'main', title: (opts && opts.title) || '' };
}
function updateComponents(surfaceId, components) {
  return { v: 1, op: 'updateComponents', surfaceId: String(surfaceId), components: Array.isArray(components) ? components : [] };
}
function updateDataModel(surfaceId, patch) {
  return { v: 1, op: 'updateDataModel', surfaceId: String(surfaceId), patch: Array.isArray(patch) ? patch : [] };
}
function deleteSurface(surfaceId) {
  return { v: 1, op: 'deleteSurface', surfaceId: String(surfaceId) };
}

const OPS = ['createSurface', 'updateComponents', 'updateDataModel', 'deleteSurface'];

// --- describe-not-execute safety validation ---
// Reject anything that looks like executable content sneaking into a declarative tree.
const FORBIDDEN = [/<script/i, /javascript:/i, /on\w+\s*=/i, /\beval\s*\(/i, /new\s+Function\s*\(/i, /\bfunction\s*\(/i];

function scanForCode(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string') {
    for (let i = 0; i < FORBIDDEN.length; i++) if (FORBIDDEN[i].test(value)) return FORBIDDEN[i].toString();
    return null;
  }
  if (typeof value === 'function') return 'function_value';
  if (typeof value === 'object') {
    const keys = Object.keys(value);
    for (let i = 0; i < keys.length; i++) { const hit = scanForCode(value[keys[i]]); if (hit) return hit; }
  }
  return null;
}

function validate(directive) {
  if (!directive || typeof directive !== 'object') return { valid: false, reason: 'not_an_object' };
  if (OPS.indexOf(directive.op) === -1) return { valid: false, reason: 'unknown_op:' + directive.op };
  if (!directive.surfaceId) return { valid: false, reason: 'missing_surfaceId' };
  const code = scanForCode(directive);
  if (code) return { valid: false, reason: 'executable_content_rejected:' + code };
  return { valid: true };
}

// --- JSON Patch (RFC 6902 subset: add / replace / remove) diff over flat/nested objects ---
function diff(oldObj, newObj, base) {
  base = base || '';
  const ops = [];
  const o = oldObj || {}; const n = newObj || {};
  Object.keys(n).forEach(function (k) {
    const path = base + '/' + String(k).replace(/~/g, '~0').replace(/\//g, '~1');
    if (!(k in o)) { ops.push({ op: 'add', path: path, value: n[k] }); return; }
    if (typeof n[k] === 'object' && n[k] !== null && typeof o[k] === 'object' && o[k] !== null && !Array.isArray(n[k]) && !Array.isArray(o[k])) {
      diff(o[k], n[k], path).forEach(function (x) { ops.push(x); });
    } else if (JSON.stringify(o[k]) !== JSON.stringify(n[k])) {
      ops.push({ op: 'replace', path: path, value: n[k] });
    }
  });
  Object.keys(o).forEach(function (k) {
    if (!(k in n)) { ops.push({ op: 'remove', path: base + '/' + String(k).replace(/~/g, '~0').replace(/\//g, '~1') }); }
  });
  return ops;
}

module.exports = { createSurface, updateComponents, updateDataModel, deleteSurface, validate, diff, scanForCode, OPS };
