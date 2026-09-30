// @ts-check
/**
 * Backend mot Supabase via PostgREST (brukes i Edge Function med service role-nøkkelen).
 * @param {string} url  f.eks. https://xyz.supabase.co
 * @param {string} key  service role / secret key (aldri i nettleseren)
 * @param {typeof fetch} [fetchFn]
 */
export function createRestBackend(url, key, fetchFn) {
  const f = fetchFn || fetch;
  const base = String(url || '').replace(/\/+$/, '');
  /** @type {Record<string,string>} */
  const headers = { apikey: key, 'Content-Type': 'application/json' };
  if (/^eyJ/.test(key)) headers.Authorization = 'Bearer ' + key;

  /** @param {string} name @param {any} args */
  async function rpc(name, args) {
    const r = await f(`${base}/rest/v1/rpc/${name}`, { method: 'POST', headers, body: JSON.stringify(args || {}) });
    const txt = await r.text();
    if (!r.ok) {
      const err = /** @type {any} */ (new Error(`${name}: HTTP ${r.status} ${txt.slice(0, 300)}`));
      if (/ISQ_CONFLICT/.test(txt)) err.code = 'CONFLICT';
      throw err;
    }
    return txt ? JSON.parse(txt) : null;
  }

  return {
    snapshot: () => rpc('isq_snapshot', {}),
    /** @param {{baseVer:number|null, doc:any, live:any, ops:any[]}} c */
    commit: (c) => rpc('isq_commit', { p_base_ver: c.baseVer, p_doc: c.doc, p_live: c.live, p_ops: c.ops || [] }),
    /** @param {string[]} polls */
    freeze: (polls) => rpc('isq_freeze', { p_polls: polls }),
    /** @param {{token:string, pollId:string, choice:string}} v */
    castVote: (v) => rpc('isq_cast_vote', { p_token: v.token, p_poll_id: v.pollId, p_choice: v.choice })
  };
}
