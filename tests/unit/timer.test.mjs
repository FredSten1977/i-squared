// Enhetstester for serverstyrt timer (startedAt + durationSeconds + status).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const T = require('../../src/shared/timer.js');

test('idle timer viser full varighet', () => {
  const t = T.load(180);
  assert.equal(t.status, 'idle');
  assert.equal(T.remainingMs(t, 1000), 180000);
});

test('kjørende timer regnes ut lokalt fra startedAt', () => {
  const t = T.start(T.load(180), 10_000);
  assert.equal(T.remainingMs(t, 10_000), 180000);
  assert.equal(T.remainingMs(t, 70_000), 120000);
  assert.equal(T.remainingMs(t, 1_000_000), 0);
});

test('pause og fortsett bevarer gjenværende tid', () => {
  let t = T.start(T.load(60), 0);
  t = T.pause(t, 20_000);
  assert.equal(t.status, 'paused');
  assert.equal(T.remainingMs(t, 999_999), 40000);
  t = T.resume(t, 100_000);
  assert.equal(t.status, 'running');
  assert.equal(T.remainingMs(t, 100_000), 40000);
  assert.equal(T.remainingMs(t, 110_000), 30000);
});

test('pause på ikke-kjørende timer er ingen endring', () => {
  const t = T.load(30);
  assert.deepEqual(T.pause(t, 5), t);
});

test('fortsett på idle starter timeren', () => {
  const t = T.resume(T.load(30), 1000);
  assert.equal(t.status, 'running');
  assert.equal(t.startedAt, 1000);
});

test('+10 / −10 / +1 minutt mens timeren går', () => {
  let t = T.start(T.load(60), 0);
  t = T.adjust(t, 10, 30_000);
  assert.equal(T.remainingMs(t, 30_000), 40000);
  t = T.adjust(t, -10, 30_000);
  assert.equal(T.remainingMs(t, 30_000), 30000);
  t = T.adjust(t, 60, 30_000);
  assert.equal(T.remainingMs(t, 30_000), 90000);
});

test('justering kan ikke gi negativ tid', () => {
  let t = T.start(T.load(20), 0);
  t = T.adjust(t, -60, 10_000);
  assert.equal(T.remainingMs(t, 10_000), 0);
  let p = T.pause(T.start(T.load(20), 0), 5_000);
  p = T.adjust(p, -100, 0);
  assert.equal(p.pausedRemaining, 0);
  assert.equal(T.adjust(T.load(5), -100, 0).durationSeconds, 0);
});

test('nullstill går tilbake til full varighet', () => {
  const t = T.reset(T.start(T.load(90), 0));
  assert.equal(t.status, 'idle');
  assert.equal(T.remainingMs(t, 50_000), 90000);
});

test('format og fargefaser', () => {
  assert.equal(T.format(180), '03:00');
  assert.equal(T.format(179.2), '03:00');
  assert.equal(T.format(59.01), '01:00');
  assert.equal(T.format(9.5), '00:10');
  assert.equal(T.format(0), '00:00');
  assert.equal(T.phase(31), 'normal');
  assert.equal(T.phase(30), 'warn');
  assert.equal(T.phase(10), 'danger');
  assert.equal(T.phase(0), 'done');
});
