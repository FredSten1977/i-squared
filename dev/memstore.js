// @ts-check
/**
 * Minnebasert lagring med samme grensesnitt som GasStore.
 * Brukes av tester og den lokale dev-serveren.
 */
'use strict';
const crypto = require('crypto');

/**
 * @param {{now?: () => number, salt?: string, adminPin?: string}} [opts]
 */
function createMemStore(opts) {
  const o = opts || {};
  const salt = o.salt || crypto.randomBytes(16).toString('hex');
  /** @type {any} */
  let doc = null;
  /** @type {Map<string, Map<string, {choice:string, demo:boolean, createdAt:number, updatedAt:number}>>} */
  const votes = new Map();
  /** @type {Map<string, {v:string, exp:number}>} */
  const cache = new Map();
  /** @type {Map<string, string>} */
  const props = new Map();
  /** @type {any[]} */
  const logEntries = [];
  let locked = false;
  let voteSeq = 0;
  if (o.adminPin) props.set('ADMIN_PIN', o.adminPin);

  const now = o.now || (() => Date.now());

  return {
    now,
    /** @template R @param {() => R} fn @returns {R} */
    withLock(fn) {
      if (locked) throw new Error('Nøstet lås');
      locked = true;
      try {
        return fn();
      } finally {
        locked = false;
      }
    },
    loadDoc() {
      return doc ? JSON.parse(JSON.stringify(doc)) : null;
    },
    /** @param {any} d */
    saveDoc(d) {
      doc = JSON.parse(JSON.stringify(d));
    },
    /** Endringsstempel (dokumentversjon + stemmeteller) for long-polling */
    stamp() {
      return (doc ? doc.version : 0) + '|' + voteSeq;
    },
    getCounts() {
      /** @type {Record<string, any>} */
      const out = {};
      for (const [pollId, m] of votes) {
        const t = { against: 0, neutral: 0, for: 0, total: 0, demo: 0 };
        for (const v of m.values()) {
          /** @type {any} */ (t)[v.choice]++;
          t.total++;
          if (v.demo) t.demo++;
        }
        out[pollId] = t;
      }
      return out;
    },
    /** @param {string} pollId @param {string} voterHash @param {string} choice @param {boolean} demo */
    upsertVote(pollId, voterHash, choice, demo) {
      if (!votes.has(pollId)) votes.set(pollId, new Map());
      const m = /** @type {Map<string, any>} */ (votes.get(pollId));
      const existing = m.get(voterHash);
      if (existing) {
        if (existing.choice === choice) return { result: 'unchanged', previous: choice };
        voteSeq++;
        const previous = existing.choice;
        existing.choice = choice;
        existing.updatedAt = now();
        return { result: 'updated', previous };
      }
      m.set(voterHash, { choice, demo: !!demo, createdAt: now(), updatedAt: now() });
      voteSeq++;
      return { result: 'created', previous: null };
    },
    /** @param {string|null} pollId @param {boolean} demoOnly */
    clearVotes(pollId, demoOnly) {
      let removed = 0;
      for (const [id, m] of votes) {
        if (pollId && id !== pollId) continue;
        for (const [h, v] of m) {
          if (!demoOnly || v.demo) {
            m.delete(h);
            removed++;
            voteSeq++;
          }
        }
      }
      return removed;
    },
    /** @param {string} text */
    hmac(text) {
      return crypto.createHmac('sha256', salt).update(text).digest('base64url');
    },
    randomId() {
      return crypto.randomBytes(16).toString('hex');
    },
    /** @param {string} k */
    cacheGet(k) {
      const e = cache.get(k);
      if (!e) return null;
      if (e.exp < now()) {
        cache.delete(k);
        return null;
      }
      return e.v;
    },
    /** @param {string} k @param {string} v @param {number} ttl */
    cachePut(k, v, ttl) {
      cache.set(k, { v, exp: now() + ttl * 1000 });
    },
    /** @param {string} k */
    cacheRemove(k) {
      cache.delete(k);
    },
    /** @param {string} k */
    getProp(k) {
      return props.has(k) ? props.get(k) : null;
    },
    /** @param {string} k @param {string} v */
    setProp(k, v) {
      props.set(k, v);
    },
    /** @param {string} k */
    deleteProp(k) {
      props.delete(k);
    },
    /** @param {any} entry @param {boolean} [_withDocSave] */
    log(entry, _withDocSave) {
      logEntries.push(entry);
    },
    /** @param {number} limit */
    readLog(limit) {
      return logEntries.slice(-limit).reverse();
    },
    // Kun for tester
    _debug: { votes, logEntries, cache }
  };
}

module.exports = { createMemStore };
