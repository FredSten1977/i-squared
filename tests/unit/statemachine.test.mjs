// Enhetstester for statusmaskinen og validering.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const SM = require('../../src/shared/statemachine.js');
const V = require('../../src/shared/validate.js');
const C = require('../../src/shared/config.js');

test('kjøreplanen følger innslagets 22 steg i riktig rekkefølge', () => {
  const ids = SM.CUES.map((c) => c.id);
  const stmt = (n) => [
    `s${n}-video`,
    `s${n}-open`,
    `s${n}-close`,
    `s${n}-open-n`,
    `s${n}-back1`,
    `s${n}-open-s`,
    `s${n}-back2`,
    `s${n}-cross-n`,
    `s${n}-back3`,
    `s${n}-cross-s`,
    `s${n}-back4`,
    `s${n}-close-n`,
    `s${n}-close-s`,
    `s${n}-after-open`,
    `s${n}-after-close`
  ];
  assert.deepEqual(ids, [
    'hero',
    'mainq',
    'main-open',
    'main-close',
    'intro-d',
    'intro-n',
    'intro-s',
    ...stmt(1),
    's2-show',
    ...stmt(2),
    's3-show',
    ...stmt(3),
    'winner',
    'main2-open',
    'main2-close'
  ]);
  assert.equal(new Set(ids).size, ids.length, 'unike steg');
  for (const c of SM.CUES) {
    assert.ok(c.label.length > 3);
    assert.ok(SM.isValid(c.status), c.id);
    assert.ok(c.actions.length > 0);
  }
  assert.equal(SM.CUES[0].step, '1');
  assert.equal(SM.CUES.at(-1).step, '22');
  assert.equal(SM.cueIndex('winner'), SM.CUES.length - 3);
});

test('statusliste i config og statusmaskin er identiske', () => {
  assert.deepEqual(C.STATUSES, SM.ORDER);
});

test('avstemningsåpning gir riktig status', () => {
  assert.equal(SM.statusForPollOpen('main-before'), 'main_poll_before');
  assert.equal(SM.statusForPollOpen('s2-after'), 'statement_2_after_poll');
  assert.equal(SM.statusForPollOpen('x'), null);
});

test('etiketter er på norsk', () => {
  assert.equal(SM.label('statement_3_debate'), 'Påstand 3: debatt');
  assert.equal(SM.label('final_result'), 'Vinner kåret');
});

test('validering: gyldige og ugyldige verdier', () => {
  const schema = V.object({ n: V.number({ int: true, min: 1, max: 3 }), s: V.string({ min: 2 }), o: V.optional(V.oneOf(['a'])) });
  assert.deepEqual(V.parse(schema, { n: '2', s: ' ok ' }), { n: 2, s: 'ok' });
  assert.throws(() => V.parse(schema, { n: 4, s: 'ok' }), /for høyt/);
  assert.throws(() => V.parse(schema, { n: 1.5, s: 'ok' }), /heltall/);
  assert.throws(() => V.parse(schema, { n: 1, s: 'x' }), /for kort/);
  assert.throws(() => V.parse(schema, { n: 1, s: 'ok', o: 'b' }), /ugyldig verdi/);
  assert.throws(() => V.parse(schema, 'tekst'), /objekt/);
});

test('seed-data inneholder riktige påstander og lagposisjoner', () => {
  const d = C.seedDocument();
  assert.equal(d.event.title, 'I-Squared Statsbygg');
  assert.equal(d.event.heroTitle, 'I-Squared');
  assert.equal(d.statements.length, 3);
  assert.deepEqual(
    d.statements.map((s) => [s.northPosition, s.southPosition]),
    [
      ['against', 'for'],
      ['against', 'for'],
      ['against', 'for']
    ]
  );
  assert.equal(Object.keys(d.polls).length, 8);
  assert.equal(C.CARDS.length, 5);
  const json = JSON.stringify(d);
  assert.ok(!/Fart|Byråkrati/.test(json), 'rollebegrepene skal ikke brukes');
});
