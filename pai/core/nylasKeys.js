// ⬡B:core.nylasKeys:MODULE:grant_to_key_resolver:20260709⬡
// entered via the ABAHAM door, serving channel MESSAGES
// THE GRANT-TO-KEY RESOLVER. Born from a real live failure 20260709: CLAIR queried
// sandbox grants with the production key and reported seven healthy grants as dead,
// a false 911. The code had the same structural flaw: ONE env key used everywhere,
// so every grant living on the OTHER Nylas app fails with grant-not-found on every
// send and read. Nylas has TWO apps; grants belong to exactly one:
//   SANDBOX app (5-grant ceiling): claudette@gmg, brandon@gmg, personal gmail,
//     BDIF, mr.brandonjpierce@gmail
//   PRODUCTION app: Mediators, MH Action
// One call, keyForGrant(grantId), returns the right key. Nobody -- her, CLAIR, or
// any station -- has to remember which app a grant lives on ever again.
'use strict';

var SANDBOX_GRANTS = JSON.parse(process.env.NYLAS_GRANT_MAP || '{}') /* grant map lives in env, never literals */;
var PRODUCTION_GRANTS = JSON.parse(process.env.NYLAS_GRANT_MAP || '{}') /* production grants also from env */;
// \u2b21B:core.nylasKeys:WIRE:anu_grant_env_driven_20260711\u2b21
// A'NU's own mailbox migration (aba@gmg -> anu@anu-anew.com). The sandbox app is
// full (5/5), so the new grant lives on the PRODUCTION app. Its ID is env-driven
// (NYLAS_ANU_GRANT) so it is recognized the instant the founder creates the grant
// via OAuth -- no code edit needed at switch time, just the env var. Reads the
// production key like every other production grant.
(function () {
  var anuGrant = process.env.NYLAS_ANU_GRANT;
  if (anuGrant) PRODUCTION_GRANTS[String(anuGrant).toLowerCase()] = 'anu@anu-anew.com';
})();

function keyForGrant(grantId) {
  var g = String(grantId || '').toLowerCase();
  if (SANDBOX_GRANTS[g]) return process.env.NYLAS_SANDBOX_KEY || process.env.NYLAS_API_KEY;
  if (PRODUCTION_GRANTS[g]) return process.env.NYLAS_PRODUCTION_KEY || process.env.NYLAS_API_KEY;
  // Unknown grant: fall back to the default key, but say so in the log so a new
  // grant gets registered here instead of silently riding the wrong app.
  console.log('[nylasKeys] unknown grant ' + g.slice(0, 8) + ', using default key; register it in core/nylasKeys.js');
  return process.env.NYLAS_API_KEY;
}

module.exports = { keyForGrant: keyForGrant, SANDBOX_GRANTS: SANDBOX_GRANTS, PRODUCTION_GRANTS: PRODUCTION_GRANTS };
