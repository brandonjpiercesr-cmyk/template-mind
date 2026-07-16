// ⬡B:core.chatterReport:MODULE:chatter_reports_20260617_canew_chatter_repor:20260710⬡
// ENTRANCE: built by the coding department through the validator pipeline
// (cold header injected by the engine; the model never writes its own stamp).
function summarizeMovement(moved) {
  if (!moved) return 'nothing';
  if (Array.isArray(moved)) {
    if (moved.length === 0) return 'nothing';
    if (moved.length === 1) return `${moved[0]}`;
    return `${moved.slice(0, 2).join(', ')}${moved.length > 2 ? ', …' : ''}`;
  }
  return `${moved}`;
}
function extractMetric(data) {
  if (data == null) return null;
  if (typeof data.budget === 'number') return data.budget;
  if (typeof data.count === 'number') return data.count;
  if (typeof data.emails === 'number') return data.emails;
  if (typeof data.metric === 'number') return data.metric;
  return null;
}
function buildReport(station, cycleData) {
  const name = station && station.name ? station.name : 'Unknown station';
  const moved = summarizeMovement(cycleData && cycleData.moved);
  const sees = cycleData && cycleData.sees ? cycleData.sees : 'nothing notable';
  const metric = extractMetric(cycleData);
  const metricPart = metric !== null ? ` (${metric})` : '';
  const directive = cycleData && cycleData.directive ? cycleData.directive : 'no directive';
  return `${name} moved ${moved}, sees ${sees}${metricPart}, directive: ${directive}.`;
}
module.exports = { buildReport };