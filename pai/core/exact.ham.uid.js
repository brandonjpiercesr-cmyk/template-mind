'use strict';

var MAX_EXACT_HAM_UID_BYTES = 512;

// Syntax only. The identity has already been resolved by an authority-bearing caller. This
// function checks that its exact UTF-8 bytes can be carried without normalizing, case-folding,
// trimming, stripping punctuation, or admitting control characters.
function isValidExactHamUid(value) {
  if (typeof value !== 'string') return false;
  var byteLength = Buffer.byteLength(value, 'utf8');
  return value.trim().length > 0
    && byteLength >= 1
    && byteLength <= MAX_EXACT_HAM_UID_BYTES
    && Buffer.from(value, 'utf8').toString('utf8') === value
    && !/\p{Cc}/u.test(value);
}

module.exports = Object.freeze({
  MAX_EXACT_HAM_UID_BYTES:MAX_EXACT_HAM_UID_BYTES,
  isValidExactHamUid:isValidExactHamUid
});
