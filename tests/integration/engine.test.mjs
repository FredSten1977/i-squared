// Integrasjonstester: hele motoren med minnelagring (samme kode som kjører i Apps Script).
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const Engine = require('../../src/shared/engine.js');
const { createMemStore } = require('../../dev/memstore.js');

const PIN = 'testpin123';

function setup() {
  let now = Date.parse('2026-10-01T18:00:00Z');
  const store = createMemStore({ adminPin: PIN, now: () => now });
  const engine = Engine.create(store);
  const login = engine.rpc('auth.login', { pin: PIN });
  assert.equal(login.ok, true, JSON.stringify(login));
  const session = login.data.session;
  const act = (action, params = {}) => engine.rpc('control.action', { session, action, params });
  const ok = (action, params) => {
    const r = act(action, params);
    assert.equal(r.ok, true, `${action}: ${r.error}`);
    return r.data;
  };
  let voterSeq = 0;
  const newVoter = () => 'voter' + String(++voterSeq).padStart(4, '0') + 'abcdefghijklmnop';
  const vote = (token, choice, pollId) => engine.rpc('public.vote', { token, choice, pollId });
  const pub = () => engine.rpc('public.state', {}).data;
  const ctl = () => engine.rpc('control.state', { session }).data;
  return { store, engine, session, act, ok, vote, newVoter, pub, ctl, tick: (ms) => (now += ms), now: () => now };
}

/** Stemmer med en liste av valg, én ny velger per valg; returnerer tokenene */
function castMany(h, pollId, choices, tokens) {
  return choices.map((c, i) => {
    const token = tokens ? tokens[i] : h.newVoter();
    const r = h.vote(token, c, pollId);
    assert.equal(r.ok, true, r.error);
    return token;
  });
}

describe('avstemning', () => {
  test('åpne avstemning, avgi stemme, endre stemme og lukke', () => {
    const h = setup();
    h.ok('openPoll', { pollId: 's1-before', showQr: true });
    const p = h.pub();
    assert.equal(p.view, 'qr');
    assert.equal(p.poll.id, 's1-before');
    assert.equal(p.poll.status, 'open');
    assert.equal(p.event.status, 'statement_1_before_poll');

    const token = h.newVoter();
    assert.equal(h.vote(token, 'against', 's1-before').data.result, 'created');
    assert.equal(h.pub().poll.count, 1);

    // Endre stemme: oppdateres, ikke ny stemme
    assert.equal(h.vote(token, 'for', 's1-before').data.result, 'updated');
    const c = h.ctl();
    assert.equal(c.polls['s1-before'].count, 1);

    // Rask dobbel innsending av samme valg
    assert.equal(h.vote(token, 'for', 's1-before').data.result, 'unchanged');
    assert.equal(h.ctl().polls['s1-before'].count, 1);

    h.ok('closePoll', {});
    const after = h.ctl();
    assert.equal(after.polls['s1-before'].status, 'closed');
    assert.deepEqual(after.polls['s1-before'].distribution, { against: 0, neutral: 0, for: 1 });
  });

  test('stemme avvises når avstemningen er lukket eller ikke åpnet', () => {
    const h = setup();
    const r1 = h.vote(h.newVoter(), 'for', 's1-before');
    assert.equal(r1.ok, false);
    assert.equal(r1.code, 'POLL_CLOSED');
    h.ok('openPoll', { pollId: 's1-before' });
    h.ok('closePoll', { pollId: 's1-before' });
    const r2 = h.vote(h.newVoter(), 'for', 's1-before');
    assert.equal(r2.code, 'POLL_CLOSED');
    assert.equal(h.ctl().polls['s1-before'].count, 0);
  });

  test('bare én avstemning er åpen om gangen', () => {
    const h = setup();
    h.ok('openPoll', { pollId: 'main-before' });
    h.ok('openPoll', { pollId: 's1-before' });
    const c = h.ctl();
    assert.equal(c.polls['main-before'].status, 'closed');
    assert.equal(c.polls['s1-before'].status, 'open');
  });

  test('før- og etter-avstemning lagres separat per velger', () => {
    const h = setup();
    const token = h.newVoter();
    h.ok('openPoll', { pollId: 's1-before' });
    h.vote(token, 'against', 's1-before');
    h.ok('openPoll', { pollId: 's1-after' });
    h.vote(token, 'for', 's1-after');
    const c = h.ctl();
    assert.equal(c.polls['s1-before'].count, 1);
    assert.equal(c.polls['s1-after'].count, 1);
    assert.deepEqual(c.polls['s1-before'].distribution, { against: 1, neutral: 0, for: 0 });
  });

  test('ugyldig token eller valg avvises', () => {
    const h = setup();
    h.ok('openPoll', { pollId: 's1-before' });
    assert.equal(h.vote('kort', 'for', 's1-before').code, 'VALIDATION');
    assert.equal(h.vote(h.newVoter(), 'kanskje', 's1-before').code, 'VALIDATION');
    assert.equal(h.vote(h.newVoter(), 'for', 's9-before').code, 'VALIDATION');
  });

  test('rate limiting per velger', () => {
    const h = setup();
    h.ok('openPoll', { pollId: 's1-before' });
    const token = h.newVoter();
    let limited = 0;
    for (let i = 0; i < 14; i++) {
      const r = h.vote(token, i % 2 ? 'for' : 'against', 's1-before');
      if (!r.ok && r.code === 'RATE_LIMIT') limited++;
    }
    assert.ok(limited >= 3, 'forventet at noen forsøk ble begrenset');
    h.tick(31_000);
    assert.equal(h.vote(token, 'neutral', 's1-before').ok, true);
  });

  test('fordeling skjules på skjermen mens avstemningen er åpen, til den vises eksplisitt', () => {
    const h = setup();
    h.ok('openPoll', { pollId: 's1-before' });
    castMany(h, 's1-before', ['for', 'against']);
    assert.equal(h.pub().qrPoll.distribution, undefined);
    assert.equal(h.ctl().polls['s1-before'].distribution, undefined);
    h.ok('setReveal', { reveal: true });
    assert.deepEqual(h.pub().qrPoll.distribution, { against: 1, neutral: 0, for: 1 });
  });

  test('stemmesiden finner aktiv avstemning og direktelenker per påstand', () => {
    const h = setup();
    assert.equal(h.engine.rpc('public.voteState', {}).data.poll, null);
    h.ok('openPoll', { pollId: 's2-after' });
    assert.equal(h.engine.rpc('public.voteState', {}).data.poll.id, 's2-after');
    assert.equal(h.engine.rpc('public.voteState', { poll: 's2' }).data.poll.id, 's2-after');
    const s1 = h.engine.rpc('public.voteState', { poll: 's1' }).data.poll;
    assert.equal(s1.id, 's1-before');
    assert.equal(s1.status, 'draft');
    const main = h.engine.rpc('public.voteState', { poll: 'main' }).data.poll;
    assert.deepEqual(Object.keys(main.labels), ['against', 'neutral', 'for']);
  });

  test('offentlig tilstand inneholder aldri voter-token eller hash', () => {
    const h = setup();
    h.ok('openPoll', { pollId: 's1-before' });
    const token = h.newVoter();
    h.vote(token, 'for', 's1-before');
    const hash = h.store.hmac('voter:' + token);
    const blob = JSON.stringify(h.pub()) + JSON.stringify(h.ctl()) + JSON.stringify(h.engine.rpc('public.voteState', {}));
    assert.ok(!blob.includes(token));
    assert.ok(!blob.includes(hash));
  });
});

describe('resultat og leaderboard', () => {
  test('beregne resultat med likt antall stemmer legges automatisk i leaderboard', () => {
    const h = setup();
    h.ok('openPoll', { pollId: 's1-before' });
    const tokens = castMany(h, 's1-before', ['against', 'against', 'neutral', 'for']);
    h.ok('closePoll', {});
    h.ok('startSegment', { kind: 'opening', team: 'north' });
    h.ok('openPoll', { pollId: 's1-after' });
    castMany(h, 's1-after', ['neutral', 'for', 'for', 'for'], tokens);
    h.ok('closePoll', {});
    const d = h.ok('computeResult', { statementNo: 1 });
    assert.equal(d.result.netMovement, 4);
    assert.equal(d.result.status, 'approved');
    assert.equal(d.result.south, 4, 'Lag Sør argumenterer FOR påstand 1');
    const p = h.pub();
    assert.equal(p.view, 'result');
    assert.equal(p.result.winner, 'south');
    assert.equal(p.leaderboard.south, 4);
    assert.equal(p.leaderboard.north, 0);
  });

  test('resultat kan ikke beregnes mens avstemningen er åpen', () => {
    const h = setup();
    h.ok('openPoll', { pollId: 's1-before' });
    const r = h.act('computeResult', { statementNo: 1 });
    assert.equal(r.ok, false);
    assert.match(r.error, /lukket/);
  });

  test('ulikt antall stemmer normaliseres automatisk og merkes', () => {
    const h = setup();
    h.ok('openPoll', { pollId: 's1-before' });
    castMany(h, 's1-before', ['against', 'against', 'neutral', 'for']);
    h.ok('openPoll', { pollId: 's1-after' });
    castMany(h, 's1-after', ['for', 'for', 'for']);
    const d = h.ok('closePoll', {});
    const r = d.result.result;
    assert.equal(r.status, 'approved', 'godkjennes uten at operatøren må gjøre noe');
    assert.equal(r.mode, 'normalized');
    assert.equal(r.autoNormalized, true);
    // Snitt før 3/4 = 0,75, etter 6/3 = 2,0; base 3,5 → 4,375 → 4 til FOR-siden (Lag Sør på påstand 1)
    assert.equal(r.netMovement, 4);
    assert.equal(r.south, 4);
    const p = h.pub();
    assert.equal(p.view, 'result');
    assert.equal(p.result.mode, 'normalized');
    assert.equal(p.leaderboard.south, 4);
    // Operatøren kan fortsatt overstyre
    h.ok('overrideResult', { statementNo: 1, north: 0, south: 3, reason: 'Justert av jury', confirm: true });
    assert.equal(h.pub().leaderboard.south, 3);
  });

  test('ulikt antall stemmer med «krev likt antall» på: ikke automatisk godkjent, tre valg for administrator', () => {
    const h = setup();
    h.ok('updateSettings', { requireEqualTurnout: true });
    h.ok('openPoll', { pollId: 's1-before' });
    castMany(h, 's1-before', ['against', 'against', 'neutral', 'for']);
    h.ok('openPoll', { pollId: 's1-after' });
    castMany(h, 's1-after', ['for', 'for', 'for']);
    h.ok('closePoll', {});
    const d = h.ok('computeResult', { statementNo: 1 });
    assert.equal(d.result.status, 'pending');
    assert.equal(d.result.needsDecision, true);
    let p = h.pub();
    assert.equal(p.result.pending, true, 'skjermen viser ikke tall før avgjørelse');
    assert.equal(p.leaderboard.north, 0);

    // Standard godkjenning nektes
    assert.equal(h.act('approveResult', { statementNo: 1, mode: 'strict' }).ok, false);

    // 1) vent på flere stemmer: åpne etter-avstemningen igjen
    h.ok('reopenPoll', { pollId: 's1-after' });
    assert.equal(h.ctl().polls['s1-after'].status, 'open');
    h.ok('closePoll', {});

    // 2) godkjenn normalisert
    const n = h.ok('approveResult', { statementNo: 1, mode: 'normalized' });
    assert.equal(n.result.mode, 'normalized');
    assert.equal(n.result.status, 'approved');
    p = h.pub();
    assert.equal(p.result.mode, 'normalized');
    assert.ok(p.leaderboard.south > 0);

    // 3) manuell overstyring krever bekreftelse og begrunnelse
    assert.equal(h.act('overrideResult', { statementNo: 1, north: 2, south: 0, reason: 'Teknisk feil' }).ok, false);
    assert.equal(h.act('overrideResult', { statementNo: 1, north: 2, south: 0, reason: '', confirm: true }).ok, false);
    h.ok('overrideResult', { statementNo: 1, north: 2, south: 1, reason: 'Teknisk feil på nettet', confirm: true });
    p = h.pub();
    assert.equal(p.leaderboard.north, 2);
    assert.equal(p.leaderboard.south, 1);
    assert.equal(h.ctl().results['1'].overridden, true);
  });

  test('ulike lagposisjoner per påstand og summering over tre påstander', () => {
    const h = setup();
    const round = (n, before, after) => {
      h.ok('openPoll', { pollId: `s${n}-before` });
      const tokens = castMany(h, `s${n}-before`, before);
      h.ok('openPoll', { pollId: `s${n}-after` });
      castMany(h, `s${n}-after`, after, tokens);
      h.ok('closePoll', {});
      return h.ok('computeResult', { statementNo: n }).result;
    };
    // P1: Nord MOT / Sør FOR – bevegelse mot FOR (+2) gir Sør 2
    assert.equal(round(1, ['against', 'neutral'], ['neutral', 'for']).south, 2);
    // P2: Nord MOT / Sør FOR – bevegelse mot MOT (−3) gir Nord 3
    const r2 = round(2, ['for', 'for'], ['against', 'neutral']);
    assert.equal(r2.north, 3);
    // P3: Nord MOT / Sør FOR – bevegelse mot MOT (−1) gir Nord 1
    const r3 = round(3, ['neutral', 'neutral'], ['against', 'neutral']);
    assert.equal(r3.north, 1);
    assert.equal(r3.south, 0);
    const lb = h.pub().leaderboard;
    assert.equal(lb.north, 4);
    assert.equal(lb.south, 2);
    assert.equal(lb.leader, 'north');
  });

  test('lagposisjoner kan endres av administrator og brukes i beregningen', () => {
    const h = setup();
    h.ok('updateStatement', { statementNo: 1, text: 'Ny tekst for påstand 1', short: 'Ny', northPosition: 'for', southPosition: 'against' });
    h.ok('openPoll', { pollId: 's1-before' });
    const t = castMany(h, 's1-before', ['against']);
    h.ok('openPoll', { pollId: 's1-after' });
    castMany(h, 's1-after', ['for'], t);
    h.ok('closePoll', {});
    const r = h.ok('computeResult', { statementNo: 1 }).result;
    assert.equal(r.north, 2);
    assert.equal(r.south, 0);
    assert.equal(h.pub().statements[0].text, 'Ny tekst for påstand 1');
  });

  test('hovedspørsmålet påvirker ikke leaderboardet', () => {
    const h = setup();
    h.ok('openPoll', { pollId: 'main-before' });
    const t = castMany(h, 'main-before', ['against', 'against', 'against']);
    h.ok('openPoll', { pollId: 'main-after' });
    castMany(h, 'main-after', ['for', 'for', 'for'], t);
    h.ok('closePoll', {});
    const p = h.pub();
    assert.equal(p.view, 'mainResult', 'lukking av hovedspørsmålet (etter) viser resultatet');
    assert.equal(p.leaderboard.north, 0);
    assert.equal(p.leaderboard.south, 0);
    assert.equal(p.mainResult.netMovement, 6);
  });

  test('fjerne resultat krever bekreftelse', () => {
    const h = setup();
    h.ok('overrideResult', { statementNo: 2, north: 1, south: 0, reason: 'Test av fjerning', confirm: true });
    assert.equal(h.act('clearResult', { statementNo: 2 }).ok, false);
    h.ok('clearResult', { statementNo: 2, confirm: true });
    assert.equal(h.pub().leaderboard.north, 0);
  });
});

describe('synkronisering, timer og spillekort', () => {
  test('kontrollhandlinger vises i publikumsskjermens tilstand og versjonen øker', () => {
    const h = setup();
    const v0 = h.pub().version;
    h.ok('showTeam', { team: 'south' });
    const p = h.pub();
    assert.ok(p.version > v0);
    assert.equal(p.view, 'team');
    assert.equal(p.activeTeam, 'south');
    h.ok('setView', { view: 'black' });
    assert.equal(h.pub().view, 'black');
    h.ok('setView', { view: 'leaderboard' });
    assert.equal(h.pub().previousView, 'black');
  });

  test('debattdel laster og starter timer; pause og fortsett', () => {
    const h = setup();
    h.ok('startSegment', { kind: 'opening', team: 'north' });
    let p = h.pub();
    assert.equal(p.view, 'opening');
    assert.equal(p.timer.status, 'running');
    assert.equal(p.timer.durationSeconds, 180);
    h.tick(60_000);
    h.ok('timerPause');
    p = h.pub();
    assert.equal(p.timer.status, 'paused');
    assert.equal(p.timer.pausedRemaining, 120);
    h.tick(300_000);
    h.ok('timerResume');
    p = h.pub();
    const Timer = require('../../src/shared/timer.js');
    assert.equal(Timer.remainingMs(p.timer, h.now()), 120_000);
    h.ok('timerAdjust', { delta: 60 });
    assert.equal(Timer.remainingMs(h.pub().timer, h.now()), 180_000);
    h.ok('timerSet', { seconds: 45 });
    assert.equal(h.pub().timer.status, 'idle');
    assert.equal(h.pub().timer.durationSeconds, 45);
  });

  test('sluttappell bruker 1:00 og kryssforhør markerer aktivt lag', () => {
    const h = setup();
    h.ok('startSegment', { kind: 'closing', team: 'south' });
    assert.equal(h.pub().timer.durationSeconds, 60);
    h.ok('startSegment', { kind: 'cross', team: 'north' });
    h.ok('setActiveTeam', { team: 'south' });
    const p = h.pub();
    assert.equal(p.view, 'cross');
    assert.equal(p.segment.team, 'south');
  });

  test('spillekort kan brukes én gang, vises stort og kan angres', () => {
    const h = setup();
    h.ok('startSegment', { kind: 'opening', team: 'north' });
    const d = h.ok('useCard', { team: 'north', key: 'yellow' });
    let p = h.pub();
    assert.equal(p.flash.key, 'yellow');
    assert.equal(p.flash.team, 'north');
    assert.ok(p.cards.north.yellow);
    assert.equal(p.cards.south.yellow, null);
    const again = h.act('useCard', { team: 'north', key: 'yellow' });
    assert.equal(again.ok, false);
    assert.equal(again.code, 'CARD_USED');
    // Sør kan fortsatt bruke sitt gule kort
    h.ok('useCard', { team: 'south', key: 'yellow' });
    // Angre
    h.ok('revertCard', { id: d.result.usage.id });
    p = h.pub();
    assert.equal(p.cards.north.yellow, null);
    h.ok('useCard', { team: 'north', key: 'yellow' });
    assert.equal(h.ctl().cardUsage.length, 3);
  });

  test('grønt kort legger automatisk til 60 sekunder', () => {
    const h = setup();
    const Timer = require('../../src/shared/timer.js');
    h.ok('startSegment', { kind: 'closing', team: 'south' });
    h.tick(20_000);
    h.ok('useCard', { team: 'south', key: 'green' });
    assert.equal(Timer.remainingMs(h.pub().timer, h.now()), 100_000);
  });

  test('video: spilles, går tilbake til forrige visning når ferdig, feil nonce ignoreres', () => {
    const h = setup();
    h.ok('showTeam', { team: 'north' });
    h.ok('playVideo', { key: 'introNorth' });
    let p = h.pub();
    assert.equal(p.view, 'video');
    assert.equal(p.video.returnView, 'team');
    assert.equal(h.engine.rpc('public.videoEnded', { nonce: 'feil' }).data.ignored, true);
    assert.equal(h.pub().view, 'video');
    h.engine.rpc('public.videoEnded', { nonce: p.video.nonce });
    p = h.pub();
    assert.equal(p.view, 'team');
    assert.equal(p.video, null);
    h.ok('playVideo', { key: 'extra1' });
    h.ok('pauseVideo');
    assert.equal(h.pub().video.status, 'paused');
    h.ok('stopVideo');
    assert.equal(h.pub().view, 'statement', 'ekstravideo går til påstanden');
  });

  test('publikumsskjermen melder seg og vises i kontrollflaten', () => {
    const h = setup();
    assert.equal(h.ctl().display, null);
    h.engine.rpc('public.displayPing', { clientId: 'mac1', missing: 'media/video/x.mp4', version: 3, mode: 'local' });
    const d = h.ctl().display;
    assert.equal(d.clientId, 'mac1');
    assert.equal(d.missing, 'media/video/x.mp4');
  });
});

describe('sikkerhet og administrasjon', () => {
  test('feil PIN avvises og innlogging begrenses', () => {
    const store = createMemStore({ adminPin: PIN });
    const engine = Engine.create(store);
    assert.equal(engine.rpc('auth.login', { pin: 'feil' }).code, 'AUTH');
    for (let i = 0; i < 12; i++) engine.rpc('auth.login', { pin: 'feil' + i });
    assert.equal(engine.rpc('auth.login', { pin: PIN }).code, 'RATE_LIMIT');
  });

  test('PIN hashes ved første innlogging og klartekst slettes', () => {
    const store = createMemStore({ adminPin: PIN });
    const engine = Engine.create(store);
    assert.equal(store.getProp('ADMIN_PIN'), PIN);
    engine.rpc('auth.login', { pin: PIN });
    assert.equal(store.getProp('ADMIN_PIN'), null);
    assert.ok(store.getProp('ADMIN_PIN_HASH'));
    assert.equal(engine.rpc('auth.login', { pin: PIN }).ok, true);
  });

  test('kort PIN nektes', () => {
    const engine = Engine.create(createMemStore({ adminPin: '123' }));
    assert.equal(engine.rpc('auth.login', { pin: '123' }).code, 'WEAK_PIN');
  });

  test('kontrollmetoder krever gyldig sesjon', () => {
    const h = setup();
    assert.equal(h.engine.rpc('control.state', {}).code, 'AUTH');
    assert.equal(h.engine.rpc('control.action', { session: 'a'.repeat(64), action: 'setView', params: { view: 'black' } }).code, 'AUTH');
    assert.equal(h.engine.rpc('control.action', { session: h.session, action: 'finnesIkke', params: {} }).code, 'UNKNOWN_ACTION');
    assert.equal(h.engine.rpc('ukjent.metode', {}).code, 'UNKNOWN_METHOD');
    h.engine.rpc('auth.logout', { session: h.session });
    assert.equal(h.engine.rpc('control.state', { session: h.session }).code, 'AUTH');
  });

  test('sesjonen utløper etter 6 timer uten aktivitet', () => {
    const h = setup();
    h.tick(6 * 3600 * 1000 + 1000);
    assert.equal(h.engine.rpc('control.state', { session: h.session }).code, 'AUTH');
  });

  test('kritiske handlinger krever bekreftelse', () => {
    const h = setup();
    for (const [a, p] of [
      ['resetPoll', { pollId: 's1-before' }],
      ['resetEvent', {}],
      ['clearDemo', {}],
      ['overrideResult', { statementNo: 1, north: 1, south: 0, reason: 'grunn' }]
    ]) {
      const r = h.act(a, p);
      assert.equal(r.ok, false, a);
      assert.equal(r.code, 'VALIDATION', a);
    }
    const slug = h.act('updateEvent', {
      title: 'I-Squared Statsbygg',
      kicker: 'x',
      mainQuestion: 'Et spørsmål?',
      labelAgainst: 'A',
      labelNeutral: 'B',
      labelFor: 'C',
      slug: 'nytt-arrangement'
    });
    assert.equal(slug.code, 'CONFIRM');
  });

  test('audit-logg registrerer handlinger uten PIN, token eller publikumsdata', () => {
    const h = setup();
    h.ok('openPoll', { pollId: 's1-before' });
    const token = h.newVoter();
    h.vote(token, 'for', 's1-before');
    const log = h.store._debug.logEntries;
    assert.ok(log.some((l) => l.action === 'openPoll'));
    assert.ok(log.some((l) => l.action === 'login'));
    const blob = JSON.stringify(log);
    assert.ok(!blob.includes(PIN));
    assert.ok(!blob.includes(token));
    assert.ok(!blob.includes(h.session));
    assert.ok(!log.some((l) => l.action === 'vote'), 'enkeltstemmer logges ikke');
  });

  test('nullstille avstemning sletter stemmer og tilhørende resultat', () => {
    const h = setup();
    h.ok('openPoll', { pollId: 's1-before' });
    castMany(h, 's1-before', ['for', 'for']);
    h.ok('overrideResult', { statementNo: 1, north: 1, south: 0, reason: 'midlertidig', confirm: true });
    h.ok('resetPoll', { pollId: 's1-before', confirm: true });
    const c = h.ctl();
    assert.equal(c.polls['s1-before'].count, 0);
    assert.equal(c.polls['s1-before'].status, 'draft');
    assert.equal(c.results['1'], undefined);
  });

  test('demo-modus genererer merkede stemmer som kan slettes uten å røre ekte stemmer', () => {
    const h = setup();
    h.ok('openPoll', { pollId: 's1-before' });
    castMany(h, 's1-before', ['for']);
    const g = h.ok('generateDemoVotes', { pollId: 's1-before', count: 30 });
    assert.equal(g.result.count, 30);
    let c = h.ctl();
    assert.equal(c.polls['s1-before'].count, 31);
    assert.equal(c.polls['s1-before'].demo, 30);
    assert.equal(h.pub().event.demo, true);
    // Etter-avstemning får samme antall som før når antall ikke er oppgitt
    h.ok('openPoll', { pollId: 's1-after' });
    const g2 = h.ok('generateDemoVotes', { pollId: 's1-after' });
    assert.equal(g2.result.count, 31);
    h.ok('closePoll', {});
    const r = h.ok('computeResult', { statementNo: 1 }).result;
    assert.equal(r.demo, true);
    h.ok('clearDemo', { confirm: true });
    c = h.ctl();
    assert.equal(c.polls['s1-before'].count, 1);
    assert.equal(c.polls['s1-after'].count, 0);
    assert.equal(c.results['1'], undefined);
    assert.equal(h.pub().event.demo, false);
  });

  test('nullstill arrangement beholder konfigurasjon men sletter all aktivitet', () => {
    const h = setup();
    h.ok('updateStatement', { statementNo: 2, text: 'Endret påstand to her', short: 'To', northPosition: 'against', southPosition: 'for' });
    h.ok('openPoll', { pollId: 's1-before' });
    castMany(h, 's1-before', ['for', 'against']);
    h.ok('useCard', { team: 'north', key: 'red' });
    h.ok('resetEvent', { confirm: true });
    const c = h.ctl();
    assert.equal(c.polls['s1-before'].count, 0);
    assert.equal(c.cardUsage.length, 0);
    assert.equal(c.event.status, 'setup');
    assert.equal(c.statements[1].text, 'Endret påstand to her');
  });
});
