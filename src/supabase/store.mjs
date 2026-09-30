// @ts-check
/**
 * Lagring for motoren i Supabase Edge Function.
 *
 * Motoren er synkron. Derfor hentes alt den trenger i ett kall (isq_snapshot) før den kjører,
 * og alle endringer samles opp og lagres i ett kall etterpå (isq_commit). Dokumentet lagres med
 * optimistisk samtidighetskontroll: har noen andre lagret imellom, kjøres forespørselen på nytt.
 */
import { createHmac, randomUUID } from 'node:crypto';

const POLL_IDS = ['main-before', 'main-after', 's1-before', 's1-after', 's2-before', 's2-after', 's3-before', 's3-after'];

/** @returns {{against:number, neutral:number, for:number, total:number, demo:number}} */
function emptyTally() {
  return { against: 0, neutral: 0, for: 0, total: 0, demo: 0 };
}

/**
 * @param {any} snap  resultatet fra isq_snapshot
 * @param {{now?: () => number}} [opts]
 */
export function createSnapshotStore(snap, opts) {
  const nowFn = (opts && opts.now) || (() => Date.now());
  const salt = String((snap && snap.salt) || '');
  if (!salt) throw new Error('Mangler salt i databasen (isq_secret).');
  let docJson = snap && snap.doc ? JSON.stringify(snap.doc) : null;
  let docDirty = false;
  let votesChanged = false;

  /** @type {Record<string, any>} */
  const counts = {};
  POLL_IDS.forEach((id) => (counts[id] = emptyTally()));
  for (const row of (snap && snap.counts) || []) {
    const t = counts[row.p] || (counts[row.p] = emptyTally());
    if (/** @type {any} */ (t)[row.c] === undefined) continue;
    /** @type {any} */ (t)[row.c] += Number(row.n) || 0;
    t.total += Number(row.n) || 0;
    t.demo += Number(row.d) || 0;
  }

  /** @type {Map<string, string>} */
  const kv = new Map(Object.entries((snap && snap.kv) || {}));
  /** @type {any[]} */
  const ops = [];
  /** @type {any[]} */
  const logTail = ((snap && snap.log) || []).map((/** @type {any} */ e) => ({
    at: new Date(e.at).toISOString(),
    actor: e.actor,
    action: e.action,
    payload: JSON.stringify(e.payload || {}).slice(0, 300)
  }));

  /** @param {string} k @param {string} v @param {number} [ttl] */
  function kvSet(k, v, ttl) {
    kv.set(k, v);
    /** @type {any} */
    const op = { t: 'kvset', k, v };
    if (ttl) op.ttl = Math.max(1, Math.round(ttl));
    ops.push(op);
  }
  /** @param {string} k */
  function kvDel(k) {
    kv.delete(k);
    ops.push({ t: 'kvdel', k });
  }

  const store = {
    now: () => nowFn(),
    /** @template R @param {() => R} fn @returns {R} */
    withLock: (fn) => fn(),
    loadDoc: () => (docJson ? JSON.parse(docJson) : null),
    /** @param {any} d */
    saveDoc: (d) => {
      docJson = JSON.stringify(d);
      docDirty = true;
    },
    getCounts: () => JSON.parse(JSON.stringify(counts)),
    /** @param {string} pollId @param {string} voterHash @param {string} choice @param {boolean} demo */
    upsertVote(pollId, voterHash, choice, demo) {
      ops.push({ t: 'vote', poll: pollId, hash: voterHash, choice, demo: !!demo });
      votesChanged = true;
      const c = counts[pollId] || (counts[pollId] = emptyTally());
      /** @type {any} */ (c)[choice]++;
      c.total++;
      if (demo) c.demo++;
      return { result: 'created', previous: null };
    },
    /** @param {string} pollId @param {Array<{hash:string, choice:string, demo:boolean}>} list */
    bulkVotes(pollId, list) {
      ops.push({ t: 'bulk', poll: pollId, list: list.map((v) => ({ hash: v.hash, choice: v.choice, demo: !!v.demo })) });
      votesChanged = true;
      const c = counts[pollId] || (counts[pollId] = emptyTally());
      list.forEach((v) => {
        /** @type {any} */ (c)[v.choice]++;
        c.total++;
        if (v.demo) c.demo++;
      });
      return list.length;
    },
    /** @param {string|null} pollId @param {boolean} demoOnly */
    clearVotes(pollId, demoOnly) {
      ops.push({ t: 'clear', poll: pollId || null, demoOnly: !!demoOnly });
      votesChanged = true;
      let removed = 0;
      Object.keys(counts).forEach((id) => {
        if (pollId && id !== pollId) return;
        const c = counts[id];
        if (demoOnly) {
          removed += c.demo;
          // Demostemmenes fordeling er ukjent her; riktig opptelling hentes på nytt etter lagring
          c.total -= c.demo;
          c.demo = 0;
        } else {
          removed += c.total;
          counts[id] = emptyTally();
        }
      });
      return removed;
    },
    /** @param {string} text */
    hmac: (text) => createHmac('sha256', salt).update(String(text), 'utf8').digest('base64url'),
    randomId: () => randomUUID().replace(/-/g, ''),
    /** @param {string} k */
    cacheGet: (k) => (kv.has(k) ? /** @type {string} */ (kv.get(k)) : null),
    /** @param {string} k @param {string} v @param {number} ttl */
    cachePut: (k, v, ttl) => kvSet(k, v, ttl || 21600),
    /** @param {string} k */
    cacheRemove: (k) => kvDel(k),
    /** @param {string} k */
    getProp: (k) => (kv.has(k) ? /** @type {string} */ (kv.get(k)) : null),
    /** @param {string} k @param {string} v */
    setProp: (k, v) => kvSet(k, v),
    /** @param {string} k */
    deleteProp: (k) => kvDel(k),
    /** @param {any} entry */
    log(entry) {
      ops.push({ t: 'log', at: entry.at, actor: entry.actor, action: entry.action, payload: entry.payload || {} });
      logTail.unshift({ at: entry.at, actor: entry.actor, action: entry.action, payload: JSON.stringify(entry.payload || {}).slice(0, 300) });
    },
    /** @param {number} limit */
    readLog: (limit) => logTail.slice(0, limit)
  };

  return {
    store,
    /** Endringene som skal lagres. */
    changes() {
      return { doc: docDirty && docJson ? JSON.parse(docJson) : null, ops: ops.slice(), votesChanged };
    }
  };
}
