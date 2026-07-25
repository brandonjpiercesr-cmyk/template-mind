// ⬡B:core.openrouter_account_key:MODULE:monitor_reads_never_borrow_completion_seats:20260725⬡
'use strict';
// Account and credit reads are monitoring work, not model completion work. They
// therefore use one dedicated monitor-only credential. Choosing the first live
// completion seat made a free account poll indistinguishable from that seat's
// spend and taught callers that cross-seat borrowing was acceptable.
var seatMap = require('./seat.map.js');
var MONITOR_KEY_ENV = 'OR_KEY_ACCOUNT_MONITOR';

function accountKey() {
  var key = seatMap.sanitizeKey(process.env[MONITOR_KEY_ENV]);
  return { key:key, seat:key ? 'account_monitor' : null,
    keyEnv:key ? MONITOR_KEY_ENV : null, monitor_only:true };
}

module.exports = { accountKey:accountKey, MONITOR_KEY_ENV:MONITOR_KEY_ENV };
