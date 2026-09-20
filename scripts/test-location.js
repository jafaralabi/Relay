/**
 * Offline test for place matching (no network, no API key).  Run: node scripts/test-location.js
 * Reports with NO place must never get one; misspelt real places must still be found.
 */
const { fuzzyMatchLocation } = require('../src/location');
const locations = require('../data/locations.json');

const mustBeNull = [
  'Water pipe burst near my house, this is bad',
  'Something strange is happening near the junction',
  'The school gate is broken and nobody cares',
  'My neighbour is shouting at me every night',
  'Please what time does the market open on Saturday?',
  'Two traders are fighting at the bus stop',
  'The clinic has been shut for two weeks, patients are being turned away',
  'the bus stop',
  'market',
  'a b c',
  'School'
];
const mustMatch = [
  ['Agege market', 'Agege market'],
  ['Agaigee Market', 'Agege market'],
  ['agege gey market', 'Agege market'],
  ['a gay gay market', 'Agege market'],
  ['Agege', 'Agege market'],
  ['Some men are blocking the road at Oshodi bridge', 'Oshodi'],
  ['Two traders are fighting over a stall space at Mile 12 market', 'Mile 12 market'],
  ['mile12', 'Mile 12 market'],
  ['Mile 12', 'Mile 12 market'],
  ['The borehole at Ijegun primary school has been broken', 'Ijegun'],
  ['Ijegun', 'Ijegun'],
  ['Ikorodu motor park', 'Ikorodu'],
  ['ikorodu', 'Ikorodu'],
  ['Oshodi bus stop', 'Oshodi'],
  ['Ijegon', 'Ijegun'],
  ['Ikorodo', 'Ikorodu']
];

let problems = 0;
for (const t of mustBeNull) {
  const m = fuzzyMatchLocation(t, locations);
  const s = fuzzyMatchLocation(t, locations, { strict: true });
  if (m || s) { problems++; console.log('FALSE PLACE: "' + t + '" -> ' + (m || s).name); }
}
for (const [t, expected] of mustMatch) {
  const m = fuzzyMatchLocation(t, locations);
  const got = m ? m.name : 'null';
  if (got !== expected) { problems++; console.log('MISSED PLACE: "' + t + '" expected ' + expected + ' got ' + got); }
}
// strict mode (used for whole reports) only accepts exact names and aliases
for (const [t, expected] of [['Some men are blocking the road at Oshodi bridge', 'Oshodi'], ['Agege market entrance', 'Agege market'], ['mile12', 'Mile 12 market']]) {
  const m = fuzzyMatchLocation(t, locations, { strict: true });
  if (!m || m.name !== expected) { problems++; console.log('STRICT MISS: "' + t + '"'); }
}
if (problems) { console.log('\n' + problems + ' problem(s)'); process.exit(1); }
console.log('All place-matching checks passed (' + (mustBeNull.length + mustMatch.length + 3) + ' cases).');
