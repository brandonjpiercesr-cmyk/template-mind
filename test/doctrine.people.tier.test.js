'use strict';
const test = require('node:test');
const assert = require('node:assert');

const tiers = require('../pai/core/privacy/people.tier.js');
test('the structural filter is a real database predicate, and it fails closed on unstamped beads', function () {
  assert.equal(tiers.structuralFilter(0), null, 'T0 holds everything, no filter');
  // A real indexed COLUMN, not a path into content: content is TEXT on the legacy bank, so a
  // content-path predicate silently matched nothing there, including rows that genuinely
  // carried a tier. See migrations/0004_acl_tier_structural_people_ladder.sql.
  assert.equal(tiers.structuralFilter(1), 'acl_tier=gte.1');
  // The whole fail-closed claim: an unresolved reader is the LEAST privileged, never T0.
  assert.equal(tiers.effectiveTier(null), 4);
  assert.equal(tiers.effectiveTier(undefined), 4);
  assert.equal(tiers.effectiveTier('0'), 4, 'a string is not a tier');
  assert.equal(tiers.structuralFilter(null), 'acl_tier=gte.4');
});
