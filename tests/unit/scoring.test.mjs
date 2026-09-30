// Enhetstester for beregning av netto flyttede stemmesteg.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const S = require('../../src/shared/scoring.js');

const t = (against, neutral, fr) => ({ against, neutral, for: fr });
const NORD_FOR = { northPosition: 'for', southPosition: 'against' };
const NORD_MOT = { northPosition: 'against', southPosition: 'for' };

test('skala: MOT=0, NØYTRAL=1, FOR=2', () => {
  assert.equal(S.stepScore(t(5, 0, 0)), 0);
  assert.equal(S.stepScore(t(0, 5, 0)), 5);
  assert.equal(S.stepScore(t(0, 0, 5)), 10);
  assert.equal(S.stepScore(t(2, 3, 4)), 3 + 8);
});

test('MOT til NØYTRAL gir +1 mot FOR (uttelling til FOR-siden)', () => {
  const r = S.computeRound({ before: t(1, 0, 0), after: t(0, 1, 0), ...NORD_FOR });
  assert.equal(r.netMovement, 1);
  assert.equal(r.direction, 'for');
  assert.equal(r.north, 1);
  assert.equal(r.south, 0);
  assert.equal(r.winner, 'north');
});

test('NØYTRAL til FOR gir +1 mot FOR', () => {
  const r = S.computeRound({ before: t(0, 1, 0), after: t(0, 0, 1), ...NORD_FOR });
  assert.equal(r.netMovement, 1);
  assert.equal(r.north, 1);
});

test('MOT til FOR gir +2 mot FOR', () => {
  const r = S.computeRound({ before: t(1, 0, 0), after: t(0, 0, 1), ...NORD_FOR });
  assert.equal(r.netMovement, 2);
  assert.equal(r.north, 2);
  assert.equal(r.south, 0);
});

test('FOR til NØYTRAL gir +1 mot MOT (uttelling til MOT-siden)', () => {
  const r = S.computeRound({ before: t(0, 0, 1), after: t(0, 1, 0), ...NORD_FOR });
  assert.equal(r.netMovement, -1);
  assert.equal(r.direction, 'against');
  assert.equal(r.south, 1);
  assert.equal(r.north, 0);
  assert.equal(r.winner, 'south');
});

test('NØYTRAL til MOT gir +1 mot MOT', () => {
  const r = S.computeRound({ before: t(0, 1, 0), after: t(1, 0, 0), ...NORD_FOR });
  assert.equal(r.netMovement, -1);
  assert.equal(r.south, 1);
});

test('FOR til MOT gir +2 mot MOT', () => {
  const r = S.computeRound({ before: t(0, 0, 1), after: t(1, 0, 0), ...NORD_FOR });
  assert.equal(r.netMovement, -2);
  assert.equal(r.south, 2);
  assert.equal(r.north, 0);
});

test('null bevegelse gir 0 til begge lag', () => {
  const r = S.computeRound({ before: t(3, 4, 5), after: t(3, 4, 5), ...NORD_FOR });
  assert.equal(r.netMovement, 0);
  assert.equal(r.north, 0);
  assert.equal(r.south, 0);
  assert.equal(r.winner, null);
  assert.equal(r.direction, null);
});

test('bevegelser som opphever hverandre gir 0 (netto, ikke personflytting)', () => {
  // Én MOT→FOR (+2) og én FOR→MOT (−2) gir samme aggregat
  const r = S.computeRound({ before: t(5, 2, 5), after: t(5, 2, 5), ...NORD_FOR });
  assert.equal(r.netMovement, 0);
});

test('spesifikasjonens eksempel: +8 og Lag Nord FOR gir Nord 8, Sør 0', () => {
  // før: 10 MOT, 10 NØYTRAL, 10 FOR (score 30) → etter: 6 MOT, 10 NØYTRAL, 14 FOR (score 38)
  const r = S.computeRound({ before: t(10, 10, 10), after: t(6, 10, 14), ...NORD_FOR });
  assert.equal(r.netMovement, 8);
  assert.equal(r.north, 8);
  assert.equal(r.south, 0);
});

test('spesifikasjonens eksempel: −5 og Lag Sør MOT gir Sør 5, Nord 0', () => {
  const r = S.computeRound({ before: t(5, 10, 10), after: t(6, 13, 6), ...NORD_FOR });
  assert.equal(r.netMovement, -5);
  assert.equal(r.south, 5);
  assert.equal(r.north, 0);
});

test('ulike lagposisjoner: påstand der Lag Nord er MOT', () => {
  const r = S.computeRound({ before: t(0, 4, 4), after: t(4, 4, 0), ...NORD_MOT });
  assert.equal(r.netMovement, -8);
  assert.equal(r.north, 8, 'Lag Nord argumenterer MOT og får uttelling');
  assert.equal(r.south, 0);
  assert.equal(r.winner, 'north');
});

test('endring per alternativ beregnes', () => {
  const r = S.computeRound({ before: t(10, 5, 5), after: t(6, 6, 8), ...NORD_FOR });
  assert.deepEqual(r.change, { against: -4, neutral: 1, for: 3 });
});

test('ulikt antall stemmer før og etter krever avgjørelse i standardmodus', () => {
  const r = S.computeRound({ before: t(10, 10, 10), after: t(10, 10, 15), ...NORD_FOR });
  assert.equal(r.equalTurnout, false);
  assert.equal(r.needsDecision, true);
  assert.equal(r.mode, 'strict');
  assert.equal(r.beforeTotal, 30);
  assert.equal(r.afterTotal, 35);
});

test('normalisert beregning bruker gjennomsnittlig stemmesteg × gjennomsnittlig deltakelse', () => {
  // før: 30 stemmer, snitt 1,0; etter: 35 stemmer, score 40 → snitt 1,142857; base 32,5 → 4,64 → 5
  const r = S.computeRound({ before: t(10, 10, 10), after: t(10, 10, 15), ...NORD_FOR, mode: 'normalized' });
  assert.equal(r.mode, 'normalized');
  assert.equal(r.needsDecision, false);
  assert.equal(r.netMovement, 5);
  assert.equal(r.rawNetMovement, 4.64);
  assert.equal(r.north, 5);
});

test('normalisert: ingen fordelsendring når bare flere stemmer med samme fordeling', () => {
  const r = S.computeRound({ before: t(2, 2, 2), after: t(4, 4, 4), ...NORD_FOR, mode: 'normalized' });
  assert.equal(r.netMovement, 0);
});

test('normalisert med tom fase gir 0', () => {
  const r = S.computeRound({ before: t(0, 0, 0), after: t(1, 1, 1), ...NORD_FOR, mode: 'normalized' });
  assert.equal(r.netMovement, 0);
});

test('ugyldige tall behandles som 0', () => {
  const r = S.computeRound({ before: { against: -3, neutral: 'x', for: null }, after: t(0, 0, 1), ...NORD_FOR });
  assert.equal(r.beforeTotal, 0);
  assert.equal(r.afterTotal, 1);
});

test('leaderboard summerer bare godkjente runder', () => {
  const lb = S.leaderboard({
    1: { status: 'approved', north: 8, south: 0, mode: 'strict' },
    2: { status: 'approved', north: 0, south: 5, mode: 'strict' },
    3: { status: 'pending', north: 0, south: 9, mode: 'strict' }
  });
  assert.equal(lb.north, 8);
  assert.equal(lb.south, 5);
  assert.equal(lb.leader, 'north');
  assert.equal(lb.rounds[0].winner, 'north');
  assert.equal(lb.rounds[1].winner, 'south');
  assert.equal(lb.rounds[2].approved, false);
  assert.equal(lb.rounds[2].south, 0);
});

test('leaderboard uten resultater og ved likhet', () => {
  assert.deepEqual(S.leaderboard({}).north, 0);
  const lb = S.leaderboard({ 1: { status: 'approved', north: 3, south: 0 }, 2: { status: 'approved', north: 0, south: 3 } });
  assert.equal(lb.leader, null);
});

test('hovedspørsmålet: sammenligning inkluderer prosent og netto', () => {
  const m = S.mainComparison(t(10, 5, 5), t(5, 5, 10));
  assert.equal(m.beforeTotal, 20);
  assert.deepEqual(m.beforePct, { against: 50, neutral: 25, for: 25 });
  assert.equal(m.netMovement, 10);
});
