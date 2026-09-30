// Motoren slik den kjører i Supabase Edge Function: snapshot-lagring + handler mot en
// minnebasert etterligning av databasefunksjonene (samme oppførsel som SQL-en).
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createHandler } from '../../src/supabase/handler.mjs';
import { createMemoryBackend } from '../../src/supabase/memory-backend.mjs';

const require = createRequire(import.meta.url);
// ISQ_ENGINE_MODULE kan peke på en ferdig samlet engine.mjs (f.eks. den som deployes til Supabase)
const Engine = process.env.ISQ_ENGINE_MODULE ? (await import(process.env.ISQ_ENGINE_MODULE)).default : require('../../src/shared/engine.js');
const PIN = 'supabase-test-1';

async function setup() {
  const backend = createMemoryBackend();
  backend.setAdminPin(PIN);
  const h = createHandler({ Engine, backend });
  const login = await h.handle('auth.login', { pin: PIN });
  assert.equal(login.ok, true, JSON.stringify(login));
  const session = login.data.session;
  const act = async (action, params = {}) => {
    const r = await h.handle('control.action', { session, action, params });
    assert.equal(r.ok, true, `${action}: ${r.error} ${r.detail || ''}`);
    return r.data;
  };
  let seq = 0;
  const voter = () => 'velger' + String(++seq).padStart(5, '0') + 'abcdefghijkl';
  const vote = (token, choice, pollId) => h.handle('public.vote', { token, choice, pollId });
  const pub = async () => (await h.handle('public.state', {})).data;
  const ctl = async () => (await h.handle('control.state', { session })).data;
  return { backend, h, session, act, vote, voter, pub, ctl };
}

describe('Supabase-backend', () => {
  test('feil PIN avvises, riktig PIN gir sesjon', async () => {
    const t = await setup();
    const bad = await t.h.handle('auth.login', { pin: 'feil-pin-123' });
    assert.equal(bad.ok, false);
    assert.equal(bad.code, 'AUTH');
    const noSession = await t.h.handle('control.state', { session: 'abcdef0123456789abcdef' });
    assert.equal(noSession.code, 'AUTH');
  });

  test('stemmekatalogen følger dokumentet, og stemmer går rett i databasen', async () => {
    const t = await setup();
    await t.act('openPoll', { pollId: 's1-before', showQr: true });
    const live = t.backend.getLive();
    assert.equal(live.polls['s1-before'].status, 'open');
    assert.equal(live.active, 's1-before');
    assert.deepEqual(live.order.slice(0, 2), ['main-before', 'main-after']);
    assert.ok(live.polls['s1-before'].text.length > 5);
    assert.equal(live.counts, undefined, 'katalogen inneholder ingen opptelling');

    const tok = t.voter();
    assert.equal((await t.vote(tok, 'against', 's1-before')).data.result, 'created');
    assert.equal((await t.vote(tok, 'against', 's1-before')).data.result, 'unchanged');
    assert.equal((await t.vote(tok, 'for', 's1-before')).data.result, 'updated');
    const closed = await t.vote(t.voter(), 'for', 's2-before');
    assert.equal(closed.code, 'POLL_CLOSED');
    const bad = await t.vote('kort', 'for', 's1-before');
    assert.equal(bad.code, 'VALIDATION');
    assert.equal((await t.pub()).poll.count, 1);
  });

  test('hel påstand: før/etter, lukking og resultat med riktige tall', async () => {
    const t = await setup();
    await t.act('openPoll', { pollId: 's1-before', showQr: true });
    const tokens = [];
    for (const c of ['against', 'against', 'neutral', 'for']) {
      const tok = t.voter();
      tokens.push(tok);
      assert.equal((await t.vote(tok, c, 's1-before')).ok, true);
    }
    await t.act('closePoll', { pollId: 's1-before' });
    assert.equal(t.backend.getLive().polls['s1-before'].status, 'closed');
    assert.ok(t.backend.stats.freezes >= 1, 'avstemningen fryses før lukking');
    await t.act('openPoll', { pollId: 's1-after', showQr: true });
    for (const [i, c] of ['for', 'for', 'neutral', 'for'].entries()) assert.equal((await t.vote(tokens[i], c, 's1-after')).ok, true);
    await t.act('closePoll', { pollId: 's1-after' });
    const c = await t.ctl();
    const r = c.results['1'];
    assert.ok(r, 'resultat beregnet');
    // før: 0+0+1+2 = 3, etter: 2+2+1+2 = 7 → +4 til FOR-siden (Lag Sør)
    assert.equal(r.netMovement, 4);
    assert.equal(r.south, 4);
    assert.equal(r.north, 0);
    assert.equal(c.view, 'result');
  });

  test('stemmer som kommer mens avstemningen lukkes: alle godtatte stemmer telles', async () => {
    const t = await setup();
    await t.act('openPoll', { pollId: 's2-before', showQr: true });
    const choices = ['against', 'neutral', 'for'];
    const votes = Array.from({ length: 60 }, (_, i) => t.vote(t.voter(), choices[i % 3], 's2-before'));
    const close = t.act('closePoll', { pollId: 's2-before' });
    const more = Array.from({ length: 40 }, (_, i) => t.vote(t.voter(), choices[i % 3], 's2-before'));
    const all = await Promise.all([...votes, ...more]);
    await close;
    const accepted = all.filter((r) => r.ok).length;
    const rejected = all.filter((r) => r.code === 'POLL_CLOSED').length;
    assert.equal(accepted + rejected, 100);
    const st = await t.ctl();
    assert.equal(st.polls['s2-before'].status, 'closed');
    assert.equal(st.polls['s2-before'].count, accepted, 'opptellingen stemmer med godtatte stemmer');
    assert.equal(t.backend.voteCount(), accepted);
  });

  test('samtidige handlinger fra to kontrollflater gir ingen tapte endringer', async () => {
    const t = await setup();
    const before = (await t.ctl()).version;
    await Promise.all([t.act('setView', { view: 'rules' }), t.act('setView', { view: 'hero' }), t.act('dismissFlash', {})]);
    const after = await t.ctl();
    assert.equal(after.version, before + 3);
    assert.ok(t.backend.stats.conflicts >= 1, 'konflikt oppdaget og kjørt på nytt');
  });

  test('demostemmer, sletting av demo og nullstilling', async () => {
    const t = await setup();
    const d = await t.act('generateDemoVotes', { pollId: 's1-before', count: 30 });
    assert.equal(d.state.polls['s1-before'].count, 30);
    assert.equal(d.state.polls['s1-before'].demo, 30);
    const cleared = await t.act('clearDemo', { confirm: true });
    assert.equal(cleared.state.polls['s1-before'].count, 0);
    await t.act('openPoll', { pollId: 'main-before', showQr: true });
    await t.vote(t.voter(), 'for', 'main-before');
    const sessBefore = t.backend.getLive().polls['main-before'].session;
    const reset = await t.act('resetEvent', { confirm: true });
    assert.equal(reset.state.polls['main-before'].count, 0);
    assert.equal(t.backend.voteCount(), 0);
    assert.notEqual(t.backend.getLive().polls['main-before'].session, sessBefore, 'ny økt-id så mobilene glemmer gamle stemmer');
    assert.equal(t.backend.getLive().polls['main-before'].status, 'draft');
  });

  test('revisjonslogg og skjermstatus lagres', async () => {
    const t = await setup();
    await t.act('setView', { view: 'rules' });
    assert.equal((await t.h.handle('public.displayPing', { clientId: 'skjerm1', missing: '', version: 1, mode: 'local' })).ok, true);
    const c = await t.ctl();
    assert.equal(c.display.clientId, 'skjerm1');
    assert.ok(c.log.some((e) => e.action === 'setView'));
    assert.ok(c.log.some((e) => e.action === 'login'));
  });

  test('helsesjekk', async () => {
    const t = await setup();
    const hc = await t.h.handle('health', {});
    assert.equal(hc.ok, true);
    assert.equal(hc.backend, 'supabase');
  });
});
