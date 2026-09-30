// @ts-check
/**
 * Kjører motoren mot en backend (Supabase via REST, eller minnebasert i tester og dev-server).
 *
 * backend:
 *   snapshot()                         -> alt motoren trenger (isq_snapshot)
 *   commit({baseVer, doc, live, ops})  -> lagrer i én transaksjon; kaster {code:'CONFLICT'} ved samtidig endring
 *   freeze(pollIds)                    -> stenger avstemninger i stemmekatalogen (venter på stemmer som er på vei)
 *   castVote({token, pollId, choice})  -> stemme via isq_cast_vote
 */
import { createSnapshotStore } from './store.mjs';

const MAX_ATTEMPTS = 6;

/** @param {number} ms */
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Avstemninger som er åpne i katalogen nå, men ikke etter endringen. @param {any} before @param {any} after */
function closingPolls(before, after) {
  const b = (before && before.polls) || {};
  const a = (after && after.polls) || {};
  return Object.keys(b).filter((id) => b[id] && b[id].status === 'open' && (!a[id] || a[id].status !== 'open'));
}

/**
 * @param {{Engine: any, backend: any, now?: () => number}} o
 */
export function createHandler(o) {
  const { Engine, backend } = o;

  /** @param {string} method @param {any} payload @returns {Promise<any>} */
  async function run(method, payload) {
    const p = payload && typeof payload === 'object' ? payload : {};
    if (method === 'public.vote') return vote(p);
    if (method === 'health') return health();
    /** @type {string[]|null} */
    let frozen = null;
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      const snap = await backend.snapshot();
      const s = createSnapshotStore(snap, { now: o.now });
      const engine = Engine.create(s.store);
      const res = engine.rpc(method, p);
      const ch = s.changes();
      if (!ch.doc && !ch.ops.length) return res;
      const live = ch.doc ? engine.directory() : null;
      if (live && !frozen) {
        const closing = closingPolls(snap.live, live);
        if (closing.length) {
          // Steng avstemningen for nye stemmer før opptellingen leses, og kjør på nytt
          await backend.freeze(closing);
          frozen = closing;
          continue;
        }
      }
      try {
        await backend.commit({ baseVer: snap.doc ? snap.ver : null, doc: ch.doc, live, ops: ch.ops });
      } catch (e) {
        if (/** @type {any} */ (e) && /** @type {any} */ (e).code === 'CONFLICT') {
          await sleep(20 + Math.random() * 80 * (attempt + 1));
          continue;
        }
        throw e;
      }
      if (ch.votesChanged && res && res.ok && method === 'control.action' && res.data) {
        // Opptellingen er endret av handlingen (demo/nullstilling): hent riktig tilstand
        const fresh = await run('control.state', { session: p.session });
        if (fresh.ok) res.data.state = fresh.data;
      }
      return res;
    }
    if (frozen) await restoreLive();
    return { ok: false, code: 'BUSY', error: 'Serveren er opptatt. Prøv igjen om et øyeblikk.' };
  }

  /** Setter katalogen tilbake i tråd med dokumentet (hvis en endring ble gitt opp). */
  async function restoreLive() {
    try {
      const snap = await backend.snapshot();
      if (!snap.doc) return;
      const s = createSnapshotStore(snap, { now: o.now });
      const live = Engine.create(s.store).directory();
      await backend.commit({ baseVer: null, doc: null, live, ops: [] });
    } catch (e) {
      /* neste vellykkede lagring retter katalogen */
    }
  }

  /** @param {any} p */
  async function vote(p) {
    const r = await backend.castVote({ token: p.token, pollId: p.pollId, choice: p.choice });
    return r;
  }

  async function health() {
    const started = Date.now();
    try {
      const st = await run('public.state', {});
      return {
        ok: !!st.ok,
        service: 'i-squared-statsbygg',
        backend: 'supabase',
        time: new Date().toISOString(),
        version: st.ok ? st.data.version : null,
        status: st.ok ? st.data.event.status : null,
        ms: Date.now() - started,
        error: st.ok ? undefined : st.error
      };
    } catch (e) {
      return { ok: false, service: 'i-squared-statsbygg', error: String(e) };
    }
  }

  /** Som run, men fanger uventede feil og svarer alltid {ok,...}. @param {string} method @param {any} payload */
  async function handle(method, payload) {
    try {
      return await run(method, payload);
    } catch (e) {
      return { ok: false, code: 'INTERNAL', error: 'Uventet feil på serveren. Prøv igjen.', detail: String(/** @type {any} */ (e) && /** @type {any} */ (e).message ? /** @type {any} */ (e).message : e).slice(0, 300) };
    }
  }

  return { run, handle };
}
