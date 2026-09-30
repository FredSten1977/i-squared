// Integrasjonstest av den genererte Apps Script-koden (dist/gas/Kode.js) mot etterlignede Google-tjenester.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import vm from 'node:vm';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { createGasEnvironment } = require('../helpers/gas-mock.js');
const root = join(dirname(fileURLToPath(import.meta.url)), '../..');

before(() => {
  execFileSync(process.execPath, [join(root, 'scripts/build.mjs')], { stdio: 'ignore' });
  assert.ok(existsSync(join(root, 'dist/gas/Kode.js')));
});

function load(opts = {}) {
  const htmlFiles = {};
  for (const n of ['control', 'vote', 'display', 'landing']) htmlFiles[n] = readFileSync(join(root, 'dist/gas', n + '.html'), 'utf8');
  const env = createGasEnvironment({ htmlFiles, props: { ADMIN_PIN: 'hemmelig-pin' }, ...opts });
  const ctx = vm.createContext({ ...env.globals, console });
  vm.runInContext(readFileSync(join(root, 'dist/gas/Kode.js'), 'utf8'), ctx, { filename: 'Kode.js' });
  ctx.oppsett();
  const ss = [...env.spreadsheets.values()][0];
  const sheet = (n) => ss.getSheetByName(n);
  const rpc = (m, p) => JSON.parse(JSON.stringify(ctx.rpc(m, p)));
  const session = rpc('auth.login', { pin: 'hemmelig-pin' }).data.session;
  const act = (action, params = {}) => {
    const r = rpc('control.action', { session, action, params });
    assert.equal(r.ok, true, action + ': ' + r.error);
    return r.data;
  };
  const token = (i) => 'gasvoter' + String(i).padStart(4, '0') + 'xxxxxxxxxxxx';
  return { env, ctx, ss, sheet, rpc, session, act, token };
}

test('oppsett oppretter regneark, faner, salt og seed-dokument', () => {
  const g = load();
  assert.deepEqual(
    g.ss.getSheets().map((s) => s.name),
    ['Tilstand', 'Stemmer', 'Logg', 'Rapport']
  );
  assert.ok(g.env.props.get('SHEET_ID'));
  assert.ok(g.env.props.get('VOTER_SALT'));
  // Dokumentet ligger i Script Properties, delt i biter under 9 KB
  const n = Number(g.env.props.get('DOC_N'));
  assert.ok(n >= 1);
  const json = Array.from({ length: n }, (_, i) => g.env.props.get('DOC_' + i)).join('');
  const doc = JSON.parse(json);
  assert.equal(doc.event.title, 'I-Squared Statsbygg');
  assert.equal(doc.event.heroTitle, 'I-Squared');
  assert.equal(g.sheet('Stemmer').getRange(1, 1, 1, 6).getValues()[0][0], 'poll_id');
  // PIN er hashet og klartekst fjernet etter innlogging
  assert.equal(g.env.props.get('ADMIN_PIN'), undefined);
  assert.ok(g.env.props.get('ADMIN_PIN_HASH'));
});

test('oppsett og PIN-nullstilling kan ikke kjøres av anonyme brukere', () => {
  const g = load();
  g.env.setActiveUser('');
  assert.throws(() => g.ctx.oppsett(), /eieren/);
  assert.throws(() => g.ctx.nullstillAdminPin(), /eieren/);
});

test('doGet: JSON-API, JSONP, helsesjekk og ukjent metode', () => {
  const g = load();
  const st = JSON.parse(g.ctx.doGet({ parameter: { api: 'state' } }).getContent());
  assert.equal(st.ok, true);
  assert.equal(st.data.view, 'hero');
  const jsonp = g.ctx.doGet({ parameter: { api: 'state', callback: 'cb_1' } });
  assert.match(jsonp.getContent(), /^cb_1\(\{/);
  assert.equal(jsonp.mime, 'application/javascript');
  const bad = g.ctx.doGet({ parameter: { api: 'state', callback: 'alert(1)//' } });
  assert.match(bad.getContent(), /^\{/);
  const health = JSON.parse(g.ctx.doGet({ parameter: {}, pathInfo: 'health' }).getContent());
  assert.equal(health.ok, true);
  const unknown = JSON.parse(g.ctx.doGet({ parameter: { api: 'login', p: '{"pin":"x"}' } }).getContent());
  assert.equal(unknown.code, 'UNKNOWN_METHOD', 'innlogging er ikke tilgjengelig via GET');
});

test('doGet: sider via ?page= og /side/slug, og ukjent arrangement', () => {
  const g = load();
  const vote = g.ctx.doGet({ parameter: {}, pathInfo: 'vote/i-squared-statsbygg' });
  assert.match(vote.getContent(), /"page":"vote"/);
  assert.match(vote.getContent(), /Stem/);
  assert.equal(vote.meta.viewport.includes('width=device-width'), true);
  const control = g.ctx.doGet({ parameter: { page: 'control' } });
  assert.match(control.getContent(), /Administrator-PIN/);
  const admin = g.ctx.doGet({ parameter: {}, pathInfo: 'admin/i-squared-statsbygg' });
  assert.match(admin.getContent(), /"page":"admin"/);
  const display = g.ctx.doGet({ parameter: {}, pathInfo: 'display/i-squared-statsbygg' });
  assert.match(display.getContent(), /Publikumsskjerm/);
  const home = g.ctx.doGet({ parameter: {} });
  assert.match(home.getContent(), /Kontrollflate/);
  const wrong = g.ctx.doGet({ parameter: {}, pathInfo: 'vote/feil-arrangement' });
  assert.match(wrong.getContent(), /Ukjent arrangement/);
  // Boot-JSON kan ikke bryte ut av script-taggen
  assert.ok(!/<\/script>\s*<script>window\.ISQ_BOOT/.test(vote.getContent().replace('</script>', '')));
});

const voteKeys = (g) => [...g.env.props.keys()].filter((k) => k.startsWith('V|'));

test('stemmer lagres med én oppføring per velger og avstemning; hash i stedet for token', () => {
  const g = load();
  g.act('openPoll', { pollId: 's1-before' });
  for (let i = 0; i < 5; i++) assert.equal(g.rpc('public.vote', { token: g.token(i), choice: 'against', pollId: 's1-before' }).ok, true);
  // Endre to stemmer
  assert.equal(g.rpc('public.vote', { token: g.token(1), choice: 'for', pollId: 's1-before' }).data.result, 'updated');
  assert.equal(g.rpc('public.vote', { token: g.token(2), choice: 'neutral', pollId: 's1-before' }).data.result, 'updated');
  assert.equal(g.rpc('public.vote', { token: g.token(2), choice: 'neutral', pollId: 's1-before' }).data.result, 'unchanged');
  const keys = voteKeys(g);
  assert.equal(keys.length, 5, 'unik kombinasjon av avstemning og voter-hash');
  assert.ok(
    keys.every((k) => !k.includes('gasvoter')),
    'token lagres aldri i klartekst'
  );
  const c = g.rpc('control.state', { session: g.session }).data.polls['s1-before'];
  assert.equal(c.count, 5);
});

test('opptelling bygges riktig fra lagringen når cachen er tømt', () => {
  const g = load();
  g.act('openPoll', { pollId: 's1-before' });
  ['for', 'for', 'against'].forEach((ch, i) => g.rpc('public.vote', { token: g.token(i), choice: ch, pollId: 's1-before' }));
  g.env.cacheMap.clear();
  g.rpc('public.vote', { token: g.token(0), choice: 'neutral', pollId: 's1-before' });
  g.act('closePoll', {});
  const c = g.rpc('control.state', { session: g.session }).data.polls['s1-before'];
  assert.deepEqual(c.distribution, { against: 1, neutral: 1, for: 1 });
});

test('dokumentet overlever tømt cache (lagres varig i Script Properties)', () => {
  const g = load();
  g.act('showTeam', { team: 'south' });
  g.act('useCard', { team: 'north', key: 'red' });
  g.env.cacheMap.clear();
  const st = g.rpc('control.state', { session: g.session }).data;
  assert.equal(st.view, 'team');
  assert.equal(st.activeTeam, 'south');
  assert.ok(st.cards.north.red);
});

test('nullstilling av én avstemning bevarer andre stemmer og andre innstillinger', () => {
  const g = load();
  g.act('openPoll', { pollId: 's1-before' });
  g.rpc('public.vote', { token: g.token(0), choice: 'for', pollId: 's1-before' });
  g.rpc('public.vote', { token: g.token(1), choice: 'for', pollId: 's1-before' });
  g.act('openPoll', { pollId: 's2-before' });
  g.rpc('public.vote', { token: g.token(0), choice: 'against', pollId: 's2-before' });
  g.rpc('public.vote', { token: g.token(1), choice: 'against', pollId: 's2-before' });
  g.act('resetPoll', { pollId: 's1-before', confirm: true });
  g.rpc('public.vote', { token: g.token(1), choice: 'for', pollId: 's2-before' });
  assert.equal(voteKeys(g).length, 2);
  assert.ok(g.env.props.get('ADMIN_PIN_HASH'), 'PIN beholdes');
  assert.ok(g.env.props.get('VOTER_SALT'), 'salt beholdes');
  assert.ok(g.env.props.get('DOC_N'), 'dokument beholdes');
  g.env.cacheMap.clear();
  const c = g.rpc('control.state', { session: g.session }).data.polls;
  assert.equal(c['s1-before'].count, 0);
  assert.equal(c['s2-before'].count, 2);
  // Innloggingen overlever også
  assert.equal(g.rpc('control.state', { session: g.session }).ok, true);
});

test('full runde gjennom Apps Script: resultat, rapport, stemmeeksport og audit-logg', () => {
  const g = load();
  g.act('openPoll', { pollId: 's3-before' });
  ['for', 'for', 'neutral'].forEach((ch, i) => g.rpc('public.vote', { token: g.token(i), choice: ch, pollId: 's3-before' }));
  g.act('closePoll', {});
  g.act('startSegment', { kind: 'opening', team: 'south' });
  g.act('useCard', { team: 'south', key: 'english' });
  g.act('openPoll', { pollId: 's3-after' });
  ['against', 'neutral', 'neutral'].forEach((ch, i) => g.rpc('public.vote', { token: g.token(i), choice: ch, pollId: 's3-after' }));
  const r = g.act('closePoll', {}).result.result;
  assert.equal(r.netMovement, -3);
  assert.equal(r.north, 3, 'Lag Nord er MOT på påstand 3');
  const pub = JSON.parse(g.ctx.doGet({ parameter: { api: 'state' } }).getContent()).data;
  assert.equal(pub.leaderboard.north, 3);
  // Rapporten skrives ikke i selve trykket, men i et eget bakgrunnskall
  assert.equal(g.rpc('control.state', { session: g.session }).data.reportPending, true);
  assert.equal(g.rpc('control.flushReport', { session: g.session }).data.written, true);
  assert.equal(g.rpc('control.state', { session: g.session }).data.reportPending, false);
  assert.equal(pub.view, 'result');
  const report = g
    .sheet('Rapport')
    .data.map((row) => row.join('|'))
    .join('\n');
  assert.match(report, /Totalt/);
  assert.match(report, /english/);
  const votesSheet = g.sheet('Stemmer').data.slice(1);
  assert.equal(votesSheet.length, 6, 'stemmene eksporteres til regnearket når resultatet beregnes');
  const log = g
    .sheet('Logg')
    .data.map((row) => row.join('|'))
    .join('\n');
  assert.match(log, /closePoll/);
  assert.ok(!log.includes('hemmelig-pin'));
  assert.ok(!log.includes('gasvoter'));
  const tail = g.rpc('control.state', { session: g.session }).data.log;
  assert.ok(tail.some((l) => l.action === 'useCard'));
});

test('fart: vanlige scenehandlinger og stemmer åpner ikke regnearket', () => {
  const g = load();
  g.ctx.SS_ = null;
  const before = g.env.stats().sheetOpens;
  g.act('setView', { view: 'mainQuestion' });
  g.act('openPoll', { pollId: 'main-before' });
  for (let i = 0; i < 10; i++) g.rpc('public.vote', { token: g.token(i), choice: 'for', pollId: 'main-before' });
  g.act('closePoll', {});
  g.act('startSegment', { kind: 'opening', team: 'north' });
  g.act('useCard', { team: 'north', key: 'yellow' });
  g.act('timerPause');
  g.rpc('public.state', {});
  g.rpc('control.state', { session: g.session });
  assert.equal(g.env.stats().sheetOpens - before, 0, 'ingen åpning av regnearket');
});

test('long-polling: svarer med en gang ved endring, ellers etter ventetiden', () => {
  const g = load();
  const first = g.rpc('public.state', {}).data;
  assert.ok(first.stamp);
  // Ingen endring: venter ca. 500 ms
  let t0 = Date.now();
  const same = g.rpc('public.state', { stamp: first.stamp, wait: 500 }).data;
  assert.ok(Date.now() - t0 >= 450, 'ventet');
  assert.equal(same.stamp, first.stamp);
  assert.ok(same.waited >= 450);
  // Endring før kallet: svarer umiddelbart med ny tilstand
  g.act('setView', { view: 'rules' });
  t0 = Date.now();
  const changed = g.rpc('public.state', { stamp: first.stamp, wait: 5000 }).data;
  assert.ok(Date.now() - t0 < 300, 'svarte umiddelbart');
  assert.notEqual(changed.stamp, first.stamp);
  assert.equal(changed.view, 'rules');
  // Nye stemmer endrer også stempelet (antall stemmer på skjermen)
  g.act('openPoll', { pollId: 's1-before' });
  const s1 = g.rpc('public.state', {}).data.stamp;
  g.rpc('public.vote', { token: g.token(1), choice: 'for', pollId: 's1-before' });
  assert.notEqual(g.rpc('public.state', {}).data.stamp, s1);
});

test('demo-stemmer skrives samlet og slettes uten å røre ekte stemmer', () => {
  const g = load();
  g.act('openPoll', { pollId: 's1-before' });
  g.rpc('public.vote', { token: g.token(0), choice: 'for', pollId: 's1-before' });
  const calls0 = g.env.stats().propCalls;
  g.act('generateDemoVotes', { pollId: 's1-before', count: 150 });
  assert.ok(g.env.stats().propCalls - calls0 < 40, 'demo-stemmer skrives i én operasjon');
  assert.equal(g.rpc('control.state', { session: g.session }).data.polls['s1-before'].count, 151);
  g.act('clearDemo', { confirm: true });
  assert.equal(g.rpc('control.state', { session: g.session }).data.polls['s1-before'].count, 1);
  assert.equal(voteKeys(g).length, 1);
});

test('publikumsskjermen kan melde video ferdig og sende ping via GET', () => {
  const g = load();
  g.act('setView', { view: 'leaderboard' });
  g.act('playVideo', { key: 'introNorth' });
  const st = JSON.parse(g.ctx.doGet({ parameter: { api: 'state' } }).getContent()).data;
  const res = JSON.parse(g.ctx.doGet({ parameter: { api: 'videoEnded', p: JSON.stringify({ nonce: st.video.nonce }) } }).getContent());
  assert.equal(res.ok, true);
  const after = JSON.parse(g.ctx.doGet({ parameter: { api: 'state' } }).getContent()).data;
  assert.equal(after.view, 'leaderboard');
  JSON.parse(g.ctx.doGet({ parameter: { api: 'ping', p: JSON.stringify({ clientId: 'mac', missing: '' }) } }).getContent());
  assert.equal(g.rpc('control.state', { session: g.session }).data.display.clientId, 'mac');
});

test('uten ADMIN_PIN får operatøren en forklarende feilmelding', () => {
  const htmlFiles = { control: '', vote: '', display: '', landing: '' };
  const env = createGasEnvironment({ htmlFiles });
  const ctx = vm.createContext({ ...env.globals, console });
  vm.runInContext(readFileSync(join(root, 'dist/gas/Kode.js'), 'utf8'), ctx);
  ctx.oppsett();
  assert.ok(env.logs.some((l) => /ADMIN_PIN/.test(l)));
  const r = ctx.rpc('auth.login', { pin: 'x' });
  assert.equal(r.code, 'NO_PIN');
});

test('doPost: handlinger og stemmer via HTTP POST (uavhengig av Google-innlogging)', () => {
  const g = load();
  const post = (method, payload) => JSON.parse(g.ctx.doPost({ postData: { contents: JSON.stringify({ method, payload }) } }).getContent());
  const r = post('control.action', { session: g.session, action: 'openPoll', params: { pollId: 's2-before' } });
  assert.equal(r.ok, true, r.error);
  assert.equal(post('public.vote', { token: g.token(7), choice: 'for', pollId: 's2-before' }).ok, true);
  assert.equal(post('control.state', { session: g.session }).data.polls['s2-before'].count, 1);
  assert.equal(post('control.state', {}).code, 'AUTH', 'kontrollmetoder krever fortsatt innlogging');
  const bad = JSON.parse(g.ctx.doPost({ postData: { contents: 'ikke json' } }).getContent());
  assert.equal(bad.ok, false);
});

test('fart: lukking av etter-avstemning (resultat) åpner ikke regnearket', () => {
  const g = load();
  g.act('openPoll', { pollId: 's3-before' });
  ['for', 'neutral'].forEach((ch, i) => g.rpc('public.vote', { token: g.token(i), choice: ch, pollId: 's3-before' }));
  g.act('openPoll', { pollId: 's3-after' });
  ['against', 'neutral'].forEach((ch, i) => g.rpc('public.vote', { token: g.token(i), choice: ch, pollId: 's3-after' }));
  g.ctx.SS_ = null;
  const before = g.env.stats().sheetOpens;
  const d = g.act('closePoll', { pollId: 's3-after' });
  assert.equal(d.state.view, 'result');
  assert.equal(g.env.stats().sheetOpens - before, 0, 'resultatet beregnes uten å åpne regnearket');
  assert.equal(d.state.reportPending, true, 'rapporten venter på bakgrunnskallet');
});
