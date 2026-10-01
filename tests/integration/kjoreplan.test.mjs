// Kjøreplanen slik arrangøren har beskrevet innslaget (steg 1–22), kjørt med «Neste»-knappen.
// Klokken styres i testen, så timere kan testes uten å vente.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const Engine = require('../../src/shared/engine.js');
const Timer = require('../../src/shared/timer.js');
const { createMemStore } = require('../../dev/memstore.js');

function setup() {
  let now = Date.parse('2026-10-01T18:00:00Z');
  const store = createMemStore({ adminPin: 'kjoreplan1', now: () => now });
  const engine = Engine.create(store);
  const session = engine.rpc('auth.login', { pin: 'kjoreplan1' }).data.session;
  const act = (action, params = {}) => {
    const r = engine.rpc('control.action', { session, action, params });
    assert.equal(r.ok, true, `${action}: ${r.error}`);
    return r.data;
  };
  const pub = () => engine.rpc('public.state', {}).data;
  const ctl = () => engine.rpc('control.state', { session }).data;
  const next = () => act('nextCue');
  /** Simulerer at publikumsskjermen melder at videoen er ferdig */
  const videoEnds = () => {
    const v = pub().video;
    assert.ok(v, 'en video spilles');
    assert.equal(engine.rpc('public.videoEnded', { nonce: v.nonce }).data.ok, true);
  };
  const tokens = Array.from({ length: 4 }, (_, i) => `kjoreplanvelger${i}xxxxxxxx`);
  const voteAll = (pollId, choices) => choices.forEach((c, i) => assert.equal(engine.rpc('public.vote', { token: tokens[i], choice: c, pollId }).ok, true));
  const remaining = () => Timer.signedRemainingMs(pub().timer, now) / 1000;
  return { store, engine, act, pub, ctl, next, videoEnds, voteAll, remaining, tick: (sec) => (now += sec * 1000) };
}

/** Kjører én påstand (steg 8–18). Returnerer resultatet. */
function runStatement(h, n, before, after, { checkTimers = false } = {}) {
  if (n > 1) {
    // 19: påstand n vises før ekstravideoen
    h.next();
    assert.equal(h.pub().view, 'statement', `påstand ${n} vises før video`);
    assert.equal(h.pub().activeStatement, n);
  }
  // 8 / 19: ekstravideo → tilbake til påstand n
  h.next();
  assert.equal(h.pub().view, 'video');
  assert.equal(h.pub().video.key, 'extra' + n);
  h.videoEnds();
  assert.equal(h.pub().view, 'statement');
  assert.equal(h.pub().activeStatement, n);

  // 9: før-avstemning åpnes
  h.next();
  let p = h.pub();
  assert.equal(p.view, 'qr');
  assert.equal(p.poll.id, `s${n}-before`);
  assert.equal(p.poll.status, 'open');
  h.voteAll(`s${n}-before`, before);

  // 10: før-avstemning lukkes → tilbake til påstand n
  h.next();
  p = h.pub();
  assert.equal(p.view, 'statement');
  assert.equal(p.activeStatement, n);
  assert.equal(h.ctl().polls[`s${n}-before`].status, 'closed');

  const segment = (kind, team, seconds) => {
    h.next();
    const s = h.pub();
    assert.equal(s.view, kind, `${kind} ${team}`);
    assert.equal(s.segment.team, team);
    assert.equal(s.timer.status, 'running');
    assert.equal(s.timer.durationSeconds, seconds);
  };

  // 11: åpningsinnlegg Nord 3:00, fortsetter i minus til operatøren går tilbake
  segment('opening', 'north', 180);
  if (checkTimers) {
    h.tick(195);
    assert.equal(h.pub().view, 'opening', 'blir stående etter at tiden er ute');
    assert.equal(Math.round(h.remaining()), -15, 'timeren går i minus');
    assert.equal(Timer.formatSigned(h.remaining()), '−00:15');
  }
  h.next(); // tilbake til påstand
  assert.equal(h.pub().view, 'statement');

  // 12: åpningsinnlegg Sør, samme oppsett
  segment('opening', 'south', 180);
  if (checkTimers) {
    h.tick(200);
    assert.equal(h.pub().view, 'opening');
    assert.ok(h.remaining() < 0);
  }
  h.next();
  assert.equal(h.pub().view, 'statement');

  // 13: kryssforhør Nord 4:00, manuelt tilbake
  segment('cross', 'north', 240);
  if (checkTimers) {
    h.tick(250);
    assert.equal(h.pub().view, 'cross');
    assert.equal(Math.round(h.remaining()), -10);
  }
  h.next();
  assert.equal(h.pub().view, 'statement');

  // 14: kryssforhør Sør 4:00, manuelt tilbake
  segment('cross', 'south', 240);
  h.next();
  assert.equal(h.pub().view, 'statement');

  // 15: sluttappell Nord 1:00 → påstanden vises automatisk når tiden er ute
  segment('closing', 'north', 60);
  h.tick(59);
  assert.equal(h.pub().view, 'closing');
  h.tick(3); // 0 + kort «TID»
  p = h.pub();
  assert.equal(p.view, 'statement', 'automatisk tilbake til påstanden');
  assert.equal(p.activeStatement, n);
  assert.equal(p.segment, null);

  // 16: sluttappell Sør 1:00 → automatisk tilbake
  segment('closing', 'south', 60);
  h.tick(63);
  assert.equal(h.pub().view, 'statement');

  // 17: etter-avstemning åpnes
  h.next();
  p = h.pub();
  assert.equal(p.view, 'qr');
  assert.equal(p.poll.id, `s${n}-after`);
  h.voteAll(`s${n}-after`, after);

  // 18: etter-avstemning lukkes → direkte til resultat for runden
  h.next();
  p = h.pub();
  assert.equal(p.view, 'result');
  assert.equal(p.resultStatement, n);
  assert.equal(p.result.status, 'approved');
  return p.result;
}

test('innslaget steg 1–22 med «Neste»-knappen', () => {
  const h = setup();

  // 1: forside
  h.next();
  assert.equal(h.pub().view, 'hero');
  // 2: hovedspørsmål
  h.next();
  assert.equal(h.pub().view, 'mainQuestion');
  // 3: avstemning hovedspørsmål åpnes
  h.next();
  let p = h.pub();
  assert.equal(p.view, 'qr');
  assert.equal(p.poll.id, 'main-before');
  h.voteAll('main-before', ['against', 'against', 'neutral', 'for']);
  // 4: lukkes → rett til debattreglene
  h.next();
  assert.equal(h.pub().view, 'rules');
  assert.equal(h.ctl().polls['main-before'].status, 'closed');
  assert.deepEqual(h.pub().event.durations, { opening: 180, cross: 240, closing: 60, team: 60 });
  // 5: debattintro → tilbake til debattregler
  h.next();
  assert.equal(h.pub().video.key, 'introDebate');
  h.videoEnds();
  assert.equal(h.pub().view, 'rules');
  // 6: introvideo Nord → tilbake til debattregler
  h.next();
  assert.equal(h.pub().video.key, 'introNorth');
  h.videoEnds();
  assert.equal(h.pub().view, 'rules');
  // 7: introvideo Sør → påstand 1
  h.next();
  assert.equal(h.pub().video.key, 'introSouth');
  h.videoEnds();
  p = h.pub();
  assert.equal(p.view, 'statement');
  assert.equal(p.activeStatement, 1);

  // 8–18: påstand 1 (Nord MOT / Sør FOR). Før: 2 MOT, 1 NØYTRAL, 1 FOR (3) → etter: 1 NØYTRAL, 3 FOR (7) = +4 → Sør 4
  const r1 = runStatement(h, 1, ['against', 'against', 'neutral', 'for'], ['neutral', 'for', 'for', 'for'], { checkTimers: true });
  assert.equal(r1.netMovement, 4);
  assert.equal(r1.winner, 'south');
  assert.equal(r1.south, 4);

  // 19: påstand 2 (Nord MOT / Sør FOR) med ekstravideo 2. Bevegelse mot MOT: Nord vinner 3
  const r2 = runStatement(h, 2, ['for', 'for', 'neutral', 'neutral'], ['neutral', 'neutral', 'against', 'neutral']);
  assert.equal(r2.netMovement, -3);
  assert.equal(r2.north, 3);

  // 19: påstand 3 (Nord FOR / Sør MOT) med ekstravideo 3. Bevegelse mot MOT: Sør vinner 3
  const r3 = runStatement(h, 3, ['neutral', 'neutral', 'for', 'for'], ['against', 'against', 'neutral', 'for']);
  assert.equal(r3.netMovement, -3);
  assert.equal(r3.north, 3, 'Lag Nord er MOT også på påstand 3');

  // 20: vinner av debatten kåres
  h.next();
  p = h.pub();
  assert.equal(p.view, 'winner');
  assert.equal(p.leaderboard.north, 6);
  assert.equal(p.leaderboard.south, 4);
  assert.equal(p.leaderboard.leader, 'north');

  // 21: ny avstemning på hovedspørsmålet
  h.next();
  p = h.pub();
  assert.equal(p.view, 'qr');
  assert.equal(p.poll.id, 'main-after');
  h.voteAll('main-after', ['neutral', 'for', 'for', 'for']);

  // 22: avstemningen lukkes → resultat for hovedspørsmålet
  h.next();
  p = h.pub();
  assert.equal(p.view, 'mainResult');
  assert.equal(p.mainResult.beforeTotal, 4);
  assert.equal(p.mainResult.afterTotal, 4);
  assert.equal(p.mainResult.netMovement, 4);
  assert.equal(p.leaderboard.north, 6, 'hovedspørsmålet endrer ikke leaderboardet');

  const c = h.ctl();
  assert.equal(c.nextStep, null, 'kjøreplanen er fullført');
  assert.equal(c.event.status, 'completed');
});

test('manuell overstyring: «Neste» fortsetter fra det operatøren gjorde manuelt', () => {
  const h = setup();
  // Operatøren hopper rett til debattreglene manuelt
  h.act('setView', { view: 'rules' });
  assert.equal(h.ctl().nextStep.label, 'Debattintro (→ regler)');
  // … og spiller debattintroen manuelt → neste er introvideo Nord
  h.act('playVideo', { key: 'introDebate' });
  assert.equal(h.ctl().nextStep.label, 'Introvideo Lag Nord (→ regler)');
  // … velger påstand 2 og starter kryssforhør Sør manuelt
  h.act('selectStatement', { statementNo: 2 });
  h.act('startSegment', { kind: 'cross', team: 'south' });
  let c = h.ctl();
  assert.equal(c.cues[c.cueIndex].label, 'Kryssforhør Lag Sør');
  assert.equal(c.nextStep.label, 'Tilbake til påstand 2');
  h.next();
  assert.equal(h.pub().view, 'statement');
  assert.equal(h.ctl().nextStep.label, 'Sluttappell Lag Nord (→ påstand 2 automatisk)');
  // Knapper som ikke er i kjøreplanen (svart skjerm) flytter ikke «Neste»
  h.act('setView', { view: 'black' });
  c = h.ctl();
  assert.equal(c.nextStep.label, 'Sluttappell Lag Nord (→ påstand 2 automatisk)');
  // Hopp direkte til et steg i listen
  h.act('runCue', { index: 0 });
  assert.equal(h.pub().view, 'hero');
  assert.equal(h.ctl().nextStep.label, 'Vis hovedspørsmål');
});

test('manuell tilbake til påstand under åpningsinnlegg pauser timeren; i minus nullstilles den', () => {
  const h = setup();
  h.act('startSegment', { kind: 'opening', team: 'north' });
  h.tick(30);
  h.act('showStatement', { statementNo: 1 });
  let t = h.pub().timer;
  assert.equal(t.status, 'paused');
  assert.equal(t.pausedRemaining, 150);
  h.act('startSegment', { kind: 'opening', team: 'south' });
  h.tick(200);
  h.act('showStatement', { statementNo: 1 });
  t = h.pub().timer;
  assert.equal(t.status, 'idle');
});

test('lukke etter-avstemning uten gjennomført før-avstemning gir varsel og viser påstanden', () => {
  const h = setup();
  h.act('openPoll', { pollId: 's2-after' });
  const d = h.act('closePoll', { pollId: 's2-after' });
  assert.match(d.result.warning, /Før-avstemningen/);
  assert.equal(h.pub().view, 'statement');
  assert.equal(h.pub().activeStatement, 2);
});

test('ulikt antall stemmer: resultatet vises med en gang, normalisert', () => {
  const h = setup();
  h.act('openPoll', { pollId: 's1-before' });
  h.voteAll('s1-before', ['against', 'for']);
  h.act('openPoll', { pollId: 's1-after' });
  h.voteAll('s1-after', ['for', 'for', 'for']);
  h.act('closePoll', { pollId: 's1-after' });
  const p = h.pub();
  assert.equal(p.view, 'result');
  assert.equal(p.result.pending, undefined);
  assert.equal(p.result.mode, 'normalized');
  assert.ok(p.result.winner);
});

test('ulikt antall stemmer med «krev likt antall»: lukking viser «kontrolleres» og operatøren får varsel', () => {
  const h = setup();
  h.act('updateSettings', { requireEqualTurnout: true });
  h.act('openPoll', { pollId: 's1-before' });
  h.voteAll('s1-before', ['against', 'for']);
  h.act('openPoll', { pollId: 's1-after' });
  h.voteAll('s1-after', ['for', 'for', 'for']);
  const d = h.act('closePoll', { pollId: 's1-after' });
  assert.match(d.result.warning, /Ulikt antall/);
  const p = h.pub();
  assert.equal(p.view, 'result');
  assert.equal(p.result.pending, true);
});

test('eksisterende data fra forrige versjon får kryssforhør på 4 minutter', () => {
  const doc = require('../../src/shared/config.js').seedDocument();
  doc.schemaVersion = 1;
  doc.event.settings.durations.cross = 60;
  delete doc.state.cueIndex;
  const migrated = Engine.ensureDoc(doc);
  assert.equal(migrated.event.settings.durations.cross, 240);
  assert.equal(migrated.state.cueIndex, -1);
  assert.equal(migrated.schemaVersion, 4);
  assert.equal(migrated.event.settings.requireEqualTurnout, false, 'v4: normaliser automatisk');
});

test('å gå fra en debattdel til en annen visning stopper timeren', () => {
  const h = setup();
  h.act('startSegment', { kind: 'closing', team: 'south' });
  h.tick(20);
  h.act('openPoll', { pollId: 's1-after' });
  const p = h.pub();
  assert.equal(p.view, 'qr');
  assert.equal(p.segment, null);
  assert.equal(p.timer.status, 'paused');
  h.tick(120);
  assert.equal(h.pub().view, 'qr', 'ingen automatisk hopp til påstanden');
});

test('lagposisjoner: Lag Nord MOT og Lag Sør FOR på alle påstander; eldre data rettes', () => {
  const C = require('../../src/shared/config.js');
  const h = setup();
  assert.deepEqual(
    h.pub().statements.map((s) => [s.northPosition, s.southPosition]),
    [
      ['against', 'for'],
      ['against', 'for'],
      ['against', 'for']
    ]
  );
  // v2-data med de aller første standardposisjonene rettes til v3-oppsettet
  const expected = [
    ['against', 'for'],
    ['against', 'for'],
    ['for', 'against']
  ];
  // Tidligere lagret dokument med gamle standardposisjoner rettes automatisk
  const old = C.seedDocument();
  old.schemaVersion = 2;
  old.statements[0].northPosition = 'for';
  old.statements[0].southPosition = 'against';
  old.statements[1].northPosition = 'for';
  old.statements[1].southPosition = 'against';
  old.statements[2].northPosition = 'against';
  old.statements[2].southPosition = 'for';
  const m = Engine.ensureDoc(old);
  assert.deepEqual(
    m.statements.map((s) => [s.northPosition, s.southPosition]),
    expected
  );
  assert.equal(m.schemaVersion, 4);
  // Posisjoner som administrator har endret selv, røres ikke
  const custom = C.seedDocument();
  custom.schemaVersion = 2;
  custom.statements[0].northPosition = 'for';
  custom.statements[0].southPosition = 'for';
  assert.equal(Engine.ensureDoc(custom).statements[0].southPosition, 'for');
  assert.equal(Engine.ensureDoc(custom).statements[0].northPosition, 'for');
});

test('forsiden viser «I-Squared»', () => {
  const h = setup();
  assert.equal(h.pub().event.heroTitle, 'I-Squared');
});
