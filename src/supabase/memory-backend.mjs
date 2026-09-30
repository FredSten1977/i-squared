// @ts-check
/**
 * Minnebasert etterligning av databasefunksjonene i Supabase (isq_snapshot, isq_commit,
 * isq_freeze, isq_cast_vote, isq_set_admin_pin). Brukes av tester og den lokale dev-serveren.
 * Oppførselen skal være lik SQL-en i supabase/migrations.
 */
import { createHmac, randomBytes } from 'node:crypto';

/** @param {{now?: () => number, onChange?: (table:string) => void}} [opts] */
export function createMemoryBackend(opts) {
  const o = opts || {};
  const now = o.now || (() => Date.now());
  const salt = randomBytes(32).toString('hex');
  /** @type {{ver:number, doc:any}|null} */
  let docRow = null;
  let live = /** @type {any} */ ({});
  const tick = { ver: 0, cver: 0 };
  /** @type {Map<string, {poll:string, hash:string, choice:string, demo:boolean}>} */
  const votes = new Map();
  /** @type {Map<string, {value:string, exp:number|null}>} */
  const kv = new Map();
  /** @type {any[]} */
  const log = [];
  const stats = { snapshots: 0, commits: 0, conflicts: 0, freezes: 0, votes: 0 };

  const clone = (/** @type {any} */ x) => (x == null ? x : JSON.parse(JSON.stringify(x)));
  const hmac = (/** @type {string} */ t) => createHmac('sha256', salt).update(t, 'utf8').digest('base64url');
  const changed = (/** @type {string} */ t) => o.onChange && setTimeout(() => o.onChange && o.onChange(t), 0);

  function snapshot() {
    stats.snapshots++;
    /** @type {Record<string, {p:string,c:string,n:number,d:number}>} */
    const agg = {};
    for (const v of votes.values()) {
      const k = v.poll + '|' + v.choice;
      const a = agg[k] || (agg[k] = { p: v.poll, c: v.choice, n: 0, d: 0 });
      a.n++;
      if (v.demo) a.d++;
    }
    /** @type {Record<string,string>} */
    const kvObj = {};
    for (const [k, e] of kv) if (e.exp == null || e.exp > now()) kvObj[k] = e.value;
    return Promise.resolve(
      clone({
        ver: docRow ? docRow.ver : null,
        doc: docRow ? docRow.doc : null,
        live,
        salt,
        counts: Object.values(agg),
        kv: kvObj,
        log: log.slice(-25).reverse()
      })
    );
  }

  /** @param {{baseVer:number|null, doc:any, live:any, ops:any[]}} c */
  function commit(c) {
    if (c.doc) {
      if (c.baseVer == null) {
        if (docRow) {
          stats.conflicts++;
          return Promise.reject(Object.assign(new Error('ISQ_CONFLICT'), { code: 'CONFLICT' }));
        }
      } else if (!docRow || docRow.ver !== c.baseVer) {
        stats.conflicts++;
        return Promise.reject(Object.assign(new Error('ISQ_CONFLICT'), { code: 'CONFLICT' }));
      }
    }
    stats.commits++;
    if (c.doc) docRow = { ver: Number(c.doc.version) || 0, doc: clone(c.doc) };
    if (c.live && JSON.stringify(c.live) !== JSON.stringify(live)) {
      live = clone(c.live);
      changed('isq_live');
    }
    let voteOps = false;
    for (const op of c.ops || []) {
      if (op.t === 'kvset') kv.set(op.k, { value: String(op.v), exp: op.ttl ? now() + op.ttl * 1000 : null });
      else if (op.t === 'kvdel') kv.delete(op.k);
      else if (op.t === 'log') log.push({ at: op.at || new Date(now()).toISOString(), actor: op.actor, action: op.action, payload: op.payload });
      else if (op.t === 'clear') {
        for (const [k, v] of votes) if ((!op.poll || v.poll === op.poll) && (!op.demoOnly || v.demo)) votes.delete(k);
        voteOps = true;
      } else if (op.t === 'bulk') {
        for (const e of op.list) votes.set(op.poll + '|' + e.hash, { poll: op.poll, hash: e.hash, choice: e.choice, demo: !!e.demo });
        voteOps = true;
      } else if (op.t === 'vote') {
        votes.set(op.poll + '|' + op.hash, { poll: op.poll, hash: op.hash, choice: op.choice, demo: !!op.demo });
        voteOps = true;
      }
    }
    if (c.doc) tick.ver++;
    if (voteOps) tick.cver++;
    if (c.doc || voteOps) changed('isq_tick');
    return Promise.resolve({ ok: true });
  }

  /** @param {string[]} polls */
  function freeze(polls) {
    stats.freezes++;
    let any = false;
    for (const id of polls || []) {
      if (live && live.polls && live.polls[id]) {
        live.polls[id].status = 'closed';
        any = true;
      }
    }
    if (any) changed('isq_live');
    return Promise.resolve(null);
  }

  /** @param {{token:string, pollId:string, choice:string}} v */
  function castVote(v) {
    if (typeof v.token !== 'string' || !/^[A-Za-z0-9_-]{16,128}$/.test(v.token)) return Promise.resolve({ ok: false, code: 'VALIDATION', error: 'Ugyldige data: token' });
    if (['against', 'neutral', 'for'].indexOf(v.choice) === -1) return Promise.resolve({ ok: false, code: 'VALIDATION', error: 'Ugyldige data: choice' });
    if (typeof v.pollId !== 'string' || !/^[a-z0-9-]{1,20}$/.test(v.pollId)) return Promise.resolve({ ok: false, code: 'VALIDATION', error: 'Ugyldige data: pollId' });
    const st = live && live.polls && live.polls[v.pollId] && live.polls[v.pollId].status;
    if (st !== 'open') return Promise.resolve({ ok: false, code: 'POLL_CLOSED', error: 'Avstemningen er ikke åpen.' });
    stats.votes++;
    const hash = hmac('voter:' + v.token);
    const key = v.pollId + '|' + hash;
    const prev = votes.get(key);
    let result = 'created';
    if (prev && prev.choice === v.choice) result = 'unchanged';
    else {
      result = prev ? 'updated' : 'created';
      votes.set(key, { poll: v.pollId, hash, choice: v.choice, demo: false });
      tick.cver++;
      changed('isq_tick');
    }
    return Promise.resolve({ ok: true, data: { result, pollId: v.pollId, choice: v.choice } });
  }

  /** @param {string} pin */
  function setAdminPin(pin) {
    if (!pin || pin.length < 6) throw new Error('PIN må være minst 6 tegn.');
    kv.set('ADMIN_PIN_HASH', { value: hmac('pin:' + pin), exp: null });
    for (const k of [...kv.keys()]) if (k.startsWith('SESS_') || k.startsWith('sess:')) kv.delete(k);
  }

  return {
    snapshot,
    commit,
    freeze,
    castVote,
    setAdminPin,
    getLive: () => clone(live),
    getTick: () => ({ ...tick }),
    voteCount: () => votes.size,
    stats
  };
}
