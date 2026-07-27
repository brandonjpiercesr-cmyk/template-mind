// ⬡B:core.reminder.contract:MODULE:one_due_field_every_writer_agrees_on:20260726⬡
// entered via the ABAHAM door, serving the REMINDER strand
//
// THE ONE DUE FIELD. This file exists because a reminder could not fire, structurally,
// no matter which clock was armed.
//
// WHAT WAS ACTUALLY BROKEN (founder 911, 20260726, his words: "even the reminders
// falling on deaf ears"). Three writers each invented their own name for the same fact
// and no reader agreed with any of them:
//   routes/reminder.routes.js  wrote  when      (POST /reminder/set)
//   core/tool.loop.js          wrote  due_at    (create_reminder, her own tool)
//   core/selfReminders.js      wrote  fireAt    (a station reminding ITSELF)
// and the firing side read due_at only. So every reminder POSTed to /reminder/set and
// every reminder she ever set for herself was incapable of firing, forever, on any
// world, with every flag armed. Not a timing bug: a vocabulary bug.
//
// THE CONTRACT
//   WRITE STRICTLY. The canonical field is due_at and its value is a real ISO-8601
//   instant, the exact bytes new Date(ms).toISOString() produces. Nothing else is a
//   due time. A writer that cannot produce one gets ok:false and writes nothing,
//   because a reminder stored with an unreadable due time is a promise that cannot
//   be kept, which is worse than an honest refusal.
//   READ TOLERANTLY. Rows written before this file exist and are real people's real
//   reminders. readDueAt() accepts the canonical field first, then each legacy name,
//   and reports WHICH field answered so a migration can be measured instead of guessed.
//
// WHY LEGACY VALUES ARE SHAPE-CHECKED, NOT JUST Date.parse'd
//   `when` was a free-text human field: "tomorrow at 5", "before the meeting". Date.parse
//   accepts some of that prose ("July 8") and invents a year for it. Reading a sentence as
//   an instant is exactly how a reminder fires days late, which the weave already got
//   caught doing. So a LEGACY field only counts as a due time when it is machine-shaped:
//   an epoch number, or a string that starts with a real YYYY-MM-DD. Human prose in an old
//   `when` is carried forward as prose (see whenSaid) and never silently becomes a clock.
'use strict';

// The one name. Every writer in every repo writes this and only this.
const CANONICAL_DUE_FIELD = 'due_at';
const CONTRACT_VERSION = 'anew.reminder.due.v1';

// Every name a due time was ever written under, newest debt first. Read-only: nothing
// in this codebase may write these again. Kept so old rows keep working.
const LEGACY_DUE_FIELDS = Object.freeze(['fireAt', 'fire_at', 'dueDate', 'due_date', 'due', 'when']);

// A machine-written instant: epoch ms, or a string that opens with a real calendar date.
const MACHINE_DATE_SHAPE = /^\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}|$)/;

function _instantFrom(value, requireMachineShape) {
  if (typeof value === 'number') {
    return Number.isFinite(value) && value > 0 ? value : null;
  }
  if (typeof value !== 'string') return null;
  const text = value.trim();
  if (!text) return null;
  if (requireMachineShape && !MACHINE_DATE_SHAPE.test(text)) return null;
  const ms = Date.parse(text);
  return Number.isFinite(ms) ? ms : null;
}

// TOLERANT READ. Returns which field actually answered, so the migration is measurable.
// { ok:true, ms, iso, field, legacy } or { ok:false, reason }.
function readDueAt(content) {
  if (!content || typeof content !== 'object' || Array.isArray(content)) {
    return { ok: false, reason: 'reminder_content_not_an_object' };
  }
  const canonical = _instantFrom(content[CANONICAL_DUE_FIELD], false);
  if (canonical !== null) {
    return { ok: true, ms: canonical, iso: new Date(canonical).toISOString(),
      field: CANONICAL_DUE_FIELD, legacy: false };
  }
  for (let i = 0; i < LEGACY_DUE_FIELDS.length; i++) {
    const name = LEGACY_DUE_FIELDS[i];
    const ms = _instantFrom(content[name], true);
    if (ms !== null) {
      return { ok: true, ms: ms, iso: new Date(ms).toISOString(), field: name, legacy: true };
    }
  }
  return { ok: false, reason: 'reminder_has_no_readable_due_time' };
}

// STRICT WRITE. One shape, or an honest refusal. Accepts an ISO string, a Date, or an
// epoch number and normalises all three to the exact canonical ISO bytes.
function normalizeDueAt(value) {
  let ms = null;
  if (value instanceof Date) ms = value.getTime();
  else if (typeof value === 'number') ms = Number.isFinite(value) ? value : null;
  else if (typeof value === 'string' && value.trim()) {
    const parsed = Date.parse(value.trim());
    ms = Number.isFinite(parsed) ? parsed : null;
  }
  if (ms === null || !Number.isFinite(ms)) {
    return { ok: false, reason: 'reminder_due_at_not_an_instant' };
  }
  return { ok: true, ms: ms, iso: new Date(ms).toISOString() };
}

// The one place a REMINDER bead's content is shaped. Every writer goes through here, so
// there is exactly one point of truth for what a reminder IS and no fourth field name
// can be invented by a coder in a hurry.
//
// fields:
//   text        what the person (or the station) actually asked to be reminded of
//   dueAt       the instant it comes due, strict
//   audience    'ham' (a reminder TO the human) or 'self' (she reminds herself)
//   plus any additional per-writer keys, carried through untouched
function buildReminderContent(fields) {
  fields = fields || {};
  const text = String(fields.text == null ? '' : fields.text).trim();
  if (!text) return { ok: false, reason: 'reminder_text_required' };
  const due = normalizeDueAt(fields.dueAt);
  if (!due.ok) return due;
  const audience = fields.audience === 'self' ? 'self' : 'ham';
  const content = Object.assign({}, fields.extra || {}, {
    text: text,
    audience: audience,
    fired: false,
    // The version marker is how a later reader can tell a migrated row from an old one
    // without guessing from which key happens to be present.
    reminder_contract: CONTRACT_VERSION
  });
  content[CANONICAL_DUE_FIELD] = due.iso;
  if (fields.whenSaid) content.when_said = String(fields.whenSaid).slice(0, 300);
  return { ok: true, content: content, dueAt: due.iso, dueMs: due.ms, audience: audience };
}

// A reminder is done when it fired or when the person marked it complete. Both spellings
// existed; both are terminal and neither may be dropped.
function isClosed(content) {
  if (!content || typeof content !== 'object') return false;
  return content.fired === true || content.completed === true;
}

// Whose business it is. Absent means the human, because that is what every reminder was
// before self-reminders existed and old rows carry no audience at all.
function audienceOf(content) {
  return content && content.audience === 'self' ? 'self' : 'ham';
}

// Is this reminder due at `now`, for a reader that only cares about that one fact.
function isDue(content, now) {
  const due = readDueAt(content);
  if (!due.ok) return { ok: false, due: false, reason: due.reason };
  const at = Number.isFinite(now) ? now : Date.now();
  return { ok: true, due: due.ms <= at, ms: due.ms, iso: due.iso, field: due.field };
}

module.exports = {
  CANONICAL_DUE_FIELD: CANONICAL_DUE_FIELD,
  LEGACY_DUE_FIELDS: LEGACY_DUE_FIELDS,
  CONTRACT_VERSION: CONTRACT_VERSION,
  readDueAt: readDueAt,
  normalizeDueAt: normalizeDueAt,
  buildReminderContent: buildReminderContent,
  isClosed: isClosed,
  audienceOf: audienceOf,
  isDue: isDue
};
