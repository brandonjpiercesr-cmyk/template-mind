// ⬡B:core.active-awareness:WIRE:funneled_20260713⬡
function _bu(){return process.env.MEMORY_BANK_URL||process.env.AIBE_BRAIN_URL;}
function _bk(){return process.env.MEMORY_BANK_KEY||process.env.AIBE_BRAIN_KEY;}
function _tbl(){return process.env.BEAD_TABLE||'aibe_brain';}
function _schema(){return process.env.BRAIN_SCHEMA||'abacia_core';}
// ⬡B:core.active_awareness:MODULE:last_run_cycle:20260623⬡
/**
 * core/active-awareness.js
 * Active Awareness — every agent reads its own LAST_RUN BEAD before its cycle
 * begins and writes a new LAST_RUN BEAD when the cycle ends.
 *
 * This is what makes each cycle context-aware of what the agent did last.
 * Not what the global Memory Bank holds — what THIS agent did, specifically.
 * The BDIF advisor that found a grant last cycle already knows it exists this cycle.
 * The HUNCH agent that was tracking a hunch at 0.4 confidence continues tracking it.
 * The organ that deliberated on a question last cycle has its own reasoning available.
 *
 * Without Active Awareness the system restarts on every cycle.
 * With Active Awareness the system continues.
 *
 * Doctrine source: doctrine.active_awareness.v1.20260623
 */

// ⬡B:core.active_awareness:SETUP:env:20260623⬡
const BU = process.env.AIBE_BRAIN_URL;
const BK = process.env.AIBE_BRAIN_KEY;

const READ_HEADERS = {
  apikey: _bk(),
  Authorization: `Bearer ${BK}`,
  'Accept-Profile': _schema()
};

const WRITE_HEADERS = {
  apikey: _bk(),
  Authorization: `Bearer ${BK}`,
  'Content-Type': 'application/json',
  'Content-Profile': _schema(),
  'Accept-Profile': _schema(),
  Prefer: 'return=minimal'
};

// ⬡B:core.active_awareness:FUNCTION:readLastRun:20260623⬡
/**
 * Read the agent's own LAST_RUN BEAD before starting the current cycle.
 * Returns null on first cycle — no previous run exists yet.
 * Returns the parsed cycle data object if a previous run exists.
 *
 * @param {string} agentName - e.g. "EANEW", "BDIF_ADVISOR", "HUNCH"
 * @param {string} hamUid - the HAM this agent is serving
 * @returns {object|null} previous cycle data or null
 */
async function readLastRun(agentName, hamUid) {
  if (!_bu() || !_bk()) return null;
  const source = `agent.${agentName.toLowerCase()}.last_run.${hamUid}`;
  const url = `${_bu()}/rest/v1/${_tbl()}?source=eq.${encodeURIComponent(source)}&select=content,created_at&order=created_at.desc&limit=1`;
  
  try {
    const res = await fetch(url, { headers: READ_HEADERS });
    if (!res.ok) return null;
    const rows = await res.json();
    if (!rows || rows.length === 0) return null;
    return JSON.parse(rows[0].content);
  } catch {
    return null;
  }
}

// ⬡B:core.active_awareness:FUNCTION:writeLastRun:20260623⬡
/**
 * Write the agent's LAST_RUN BEAD after the current cycle completes.
 * Called at the END of every agent cycle, no exceptions.
 * CANON check 16 flags any agent cycle that does not call writeLastRun.
 *
 * cycleData shape:
 * {
 *   summary: string,          // one line: what this cycle did
 *   done: string[],           // what was completed
 *   found: string[],          // what was discovered
 *   flagged: string[],        // what was escalated or held
 *   handedOff: string[],      // what was passed to another agent
 *   incomplete: string[],     // what started but didn't finish
 *   nextCycle: string[]       // what the next cycle should check first
 * }
 *
 * @param {string} agentName
 * @param {string} hamUid
 * @param {object} cycleData
 * @returns {boolean} true if stamp succeeded
 */
async function writeLastRun(agentName, hamUid, cycleData) {
  if (!_bu() || !_bk()) return false;
  const source = `agent.${agentName.toLowerCase()}.last_run.${hamUid}`;
  
  const payload = {
    source,
    stamp_type: 'LAST_RUN',
    summary: `[LAST_RUN] ${agentName} cycle ${new Date().toISOString().slice(0, 10)}: ${cycleData.summary || 'cycle complete'}`,
    content: JSON.stringify({
      agent: agentName,
      hamUid,
      timestamp: new Date().toISOString(),
      summary: cycleData.summary || '',
      done: cycleData.done || [],
      found: cycleData.found || [],
      flagged: cycleData.flagged || [],
      handedOff: cycleData.handedOff || [],
      incomplete: cycleData.incomplete || [],
      nextCycle: cycleData.nextCycle || []
    }),
    ham_uid: hamUid,
    agent_global: false
  };

  try {
    const res = await fetch(`${_bu()}/rest/v1/${_tbl()}`, {
      method: 'POST',
      headers: WRITE_HEADERS,
      body: JSON.stringify(payload)
    });
    return res.ok;
  } catch {
    return false;
  }
}

// ⬡B:core.active_awareness:EXPORT:20260623⬡
module.exports = { readLastRun, writeLastRun };
