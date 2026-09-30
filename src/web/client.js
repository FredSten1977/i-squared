// @ts-check
/**
 * Felles klientkode: transport til Supabase, sanntidsvarsler, klokkesynkronisering,
 * polling, trygg lokal lagring og små DOM-hjelpere.
 *
 * Transport (BOOT.supabaseUrl + BOOT.supabaseKey fra config.js):
 *  - public.voteState  → leser stemmekatalogen (tabellen isq_live) direkte
 *  - public.vote       → databasefunksjonen isq_cast_vote (rask, tåler mange samtidige)
 *  - alt annet         → Edge Function «isq» (motoren)
 *  - sanntid           → Supabase Realtime på isq_live / isq_tick, med polling som reserve
 */
var ISQ_Client = (function () {
  'use strict';

  var w = /** @type {any} */ (window);
  var BOOT = w.ISQ_BOOT || {};
  var SB_URL = String(BOOT.supabaseUrl || '').replace(/\/+$/, '');
  var SB_KEY = String(BOOT.supabaseKey || '');

  /** @param {any} res */
  function unwrap(res) {
    if (res && res.ok) return res.data;
    var err = /** @type {any} */ (new Error((res && res.error) || 'Ukjent feil'));
    err.code = (res && res.code) || 'ERROR';
    throw err;
  }

  function netError(msg) {
    var err = /** @type {any} */ (new Error(msg || 'Nettverksfeil'));
    err.code = 'NETWORK';
    return err;
  }

  /** @param {string} url @param {any} init @param {number} [timeoutMs] @returns {Promise<any>} */
  function fetchJson(url, init, timeoutMs) {
    var ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var t = ctrl
      ? setTimeout(function () {
          ctrl.abort();
        }, timeoutMs || 15000)
      : null;
    var opts = Object.assign({ cache: 'no-store', credentials: 'omit', signal: ctrl ? ctrl.signal : undefined }, init || {});
    return fetch(url, opts).then(
      function (r) {
        if (t) clearTimeout(t);
        return r.text().then(function (txt) {
          var data = null;
          try {
            data = txt ? JSON.parse(txt) : null;
          } catch (e) {
            throw netError('Uventet svar fra serveren');
          }
          if (!r.ok && !(data && data.ok === false)) throw netError('HTTP ' + r.status);
          return data;
        });
      },
      function () {
        if (t) clearTimeout(t);
        throw netError();
      }
    );
  }

  /** Hodere for Supabase REST (publiserbar nøkkel – trygg i nettleseren). */
  function restHeaders(json) {
    /** @type {Record<string,string>} */
    var h = { apikey: SB_KEY };
    if (/^eyJ/.test(SB_KEY)) h.Authorization = 'Bearer ' + SB_KEY;
    if (json) h['Content-Type'] = 'application/json';
    return h;
  }

  /** Finner avstemningen stemmesiden skal vise (samme regler som motoren). @param {any} dir @param {string|null} key */
  function resolveVotePoll(dir, key) {
    var polls = (dir && dir.polls) || {};
    var order = (dir && dir.order) || Object.keys(polls);
    if (key) {
      if (polls[key]) return key;
      var pair = [key + '-before', key + '-after'].filter(function (id) {
        return !!polls[id];
      });
      if (!pair.length) return null;
      var open = pair.filter(function (id) {
        return polls[id].status === 'open';
      })[0];
      if (open) return open;
      return polls[pair[1]].status !== 'draft' ? pair[1] : pair[0];
    }
    var active = dir && dir.active;
    if (active && polls[active] && polls[active].status === 'open') return active;
    var firstOpen = order.filter(function (/** @type {string} */ id) {
      return polls[id] && polls[id].status === 'open';
    })[0];
    return firstOpen || active || null;
  }

  /** @param {any} payload */
  function voteState(payload) {
    return fetchJson(SB_URL + '/rest/v1/isq_live?id=eq.1&select=data', { method: 'GET', headers: restHeaders(false) }, 12000).then(function (rows) {
      var dir = (rows && rows[0] && rows[0].data) || {};
      var id = resolveVotePoll(dir, payload && payload.poll ? String(payload.poll) : null);
      return {
        version: dir.version || 0,
        event: dir.event || {},
        poll: id && dir.polls && dir.polls[id] ? dir.polls[id] : null
      };
    });
  }

  /** @param {any} p */
  function castVote(p) {
    return fetchJson(
      SB_URL + '/rest/v1/rpc/isq_cast_vote',
      { method: 'POST', headers: restHeaders(true), body: JSON.stringify({ p_token: p.token, p_poll_id: p.pollId, p_choice: p.choice }) },
      15000
    ).then(unwrap);
  }

  /**
   * Kall til Edge Function som «enkel» forespørsel (text/plain, ingen egne hodere),
   * slik at nettleseren ikke trenger en ekstra CORS-runde før hvert trykk.
   * @param {string} method @param {any} payload
   */
  function viaFunction(method, payload) {
    return fetchJson(
      SB_URL + '/functions/v1/isq',
      { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ method: method, payload: payload || {} }) },
      20000
    ).then(unwrap);
  }

  /** @param {string} method @param {any} [payload] @returns {Promise<any>} */
  function call(method, payload) {
    if (!SB_URL) return Promise.reject(Object.assign(new Error('Mangler adressen til Supabase (config.js).'), { code: 'CONFIG' }));
    if (method === 'public.voteState') return voteState(payload || {});
    if (method === 'public.vote') return castVote(payload || {});
    return viaFunction(method, payload || {});
  }

  // ---------- Sanntid ----------
  /** @type {any} */
  var sb = null;
  /** @type {Record<string, Array<() => void>>} */
  var listeners = {};
  /** @type {Record<string, boolean>} */
  var rtOk = {};
  var rtStarted = false;

  function startRealtime() {
    if (rtStarted || !SB_URL || !SB_KEY) return;
    if (!w.supabase || !w.supabase.createClient) {
      // Biblioteket lastes asynkront fra CDN; prøv igjen litt senere
      setTimeout(startRealtime, 1000);
      return;
    }
    rtStarted = true;
    try {
      sb = w.supabase.createClient(SB_URL, SB_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
    } catch (e) {
      return;
    }
    Object.keys(listeners).forEach(subscribeTable);
  }

  /** @param {string} table */
  function subscribeTable(table) {
    if (!sb) return;
    sb.channel('isq-' + table + '-' + Math.random().toString(36).slice(2, 8))
      .on('postgres_changes', { event: '*', schema: 'public', table: table }, function () {
        (listeners[table] || []).forEach(function (fn) {
          fn();
        });
      })
      .subscribe(function (/** @type {string} */ status) {
        var was = !!rtOk[table];
        rtOk[table] = status === 'SUBSCRIBED';
        // Etter ny tilkobling: hent tilstand i tilfelle vi gikk glipp av noe
        if (rtOk[table] && !was)
          (listeners[table] || []).forEach(function (fn) {
            fn();
          });
      });
  }

  /** @param {string} table @param {() => void} fn */
  function onChange(table, fn) {
    var first = !listeners[table];
    (listeners[table] = listeners[table] || []).push(fn);
    if (sb && first) subscribeTable(table);
    startRealtime();
  }

  // ---------- Klokke ----------
  /** @type {{offset:number, rtt:number}[]} */
  var samples = [];
  var offset = 0;

  /** @param {number} serverNow @param {number} sentAt @param {number} receivedAt */
  function syncClock(serverNow, sentAt, receivedAt, waited) {
    if (typeof serverNow !== 'number') return;
    // Ved long-polling har serveren ventet en stund; trekk fra ventetiden
    var rtt = Math.max(0, receivedAt - sentAt - (Number(waited) || 0));
    samples.push({ offset: serverNow - (receivedAt - rtt / 2), rtt: rtt });
    if (samples.length > 8) samples.shift();
    var best = samples.reduce(function (a, b) {
      return b.rtt < a.rtt ? b : a;
    });
    offset = best.offset;
  }

  function serverNow() {
    return Date.now() + offset;
  }

  // ---------- Polling med gjenoppkobling ----------
  /**
   * interval: vanlig pollingintervall; rtInterval: intervall når sanntid (realtime: tabellnavn) er tilkoblet.
   * minGap: minste tid mellom to henting utløst av sanntidsvarsler.
   * @param {{method:string, payload?:()=>any, interval:number, rtInterval?:number, realtime?:string, minGap?:number,
   *          hiddenInterval?:number, jitter?:number,
   *          onData:(data:any)=>void, onStatus?:(online:boolean)=>void, onError?:(e:any)=>boolean|void}} o
   */
  function poller(o) {
    var failures = 0;
    var online = true;
    var stopped = false;
    /** @type {any} */
    var timer = null;
    var inFlight = false;
    var lastStart = 0;
    var dirty = false;

    function schedule(ms) {
      clearTimeout(timer);
      if (!stopped) timer = setTimeout(tick, ms);
    }
    function setOnline(v) {
      if (v !== online) {
        online = v;
        if (o.onStatus) o.onStatus(v);
      }
    }
    function nextDelay() {
      var rt = o.realtime && rtOk[o.realtime] && o.rtInterval;
      var base = document.hidden && o.hiddenInterval ? Math.max(o.hiddenInterval, rt || 0) : rt || o.interval;
      // Etter feil: prøv raskt igjen de første gangene, deretter gradvis sjeldnere
      if (failures) base = failures <= 2 ? 300 : Math.min(1000 * Math.pow(1.5, failures - 2), 6000);
      var j = o.jitter ? Math.random() * o.jitter : 0;
      return base + j;
    }
    function tick() {
      if (inFlight) {
        dirty = true;
        return;
      }
      inFlight = true;
      dirty = false;
      var sent = Date.now();
      lastStart = sent;
      var payload = o.payload ? o.payload() : {};
      call(o.method, payload)
        .then(function (data) {
          inFlight = false;
          failures = 0;
          setOnline(true);
          if (data && typeof data.serverNow === 'number') syncClock(data.serverNow, sent, Date.now(), 0);
          o.onData(data);
        })
        .catch(function (e) {
          inFlight = false;
          var handled = o.onError ? o.onError(e) : false;
          if (!handled) {
            failures++;
            // Vis «frakoblet» først når flere forsøk på rad har feilet
            if (failures >= 3) setOnline(false);
          }
        })
        .then(function () {
          // Kom det et sanntidsvarsel mens vi hentet, hent på nytt med en gang
          schedule(dirty && !failures ? Math.max(0, (o.minGap || 0) - (Date.now() - lastStart)) : nextDelay());
        });
    }
    /** Sanntidsvarsel: hent snart, men ikke oftere enn minGap. */
    function kick() {
      if (stopped) return;
      if (inFlight) {
        dirty = true;
        return;
      }
      schedule(Math.max(0, (o.minGap || 0) - (Date.now() - lastStart)));
    }
    if (o.realtime) onChange(o.realtime, kick);
    document.addEventListener('visibilitychange', function () {
      if (!document.hidden) schedule(50);
    });
    w.addEventListener('online', function () {
      schedule(50);
    });
    schedule(0);
    return {
      now: function () {
        schedule(0);
      },
      stop: function () {
        stopped = true;
        clearTimeout(timer);
      },
      isOnline: function () {
        return online;
      }
    };
  }

  // ---------- Lagring ----------
  /** @type {Record<string,string>} */
  var memory = {};
  var storage = {
    /** @param {string} k */
    get: function (k) {
      try {
        var v = w.localStorage.getItem(k);
        if (v != null) return v;
      } catch (e) {
        /* ignorert */
      }
      return Object.prototype.hasOwnProperty.call(memory, k) ? memory[k] : null;
    },
    /** @param {string} k @param {string} v */
    set: function (k, v) {
      memory[k] = v;
      try {
        w.localStorage.setItem(k, v);
      } catch (e) {
        /* ignorert */
      }
    },
    /** @param {string} k */
    remove: function (k) {
      delete memory[k];
      try {
        w.localStorage.removeItem(k);
      } catch (e) {
        /* ignorert */
      }
    }
  };

  /** @param {number} [bytes] */
  function randomToken(bytes) {
    var n = bytes || 24;
    var arr = new Uint8Array(n);
    if (w.crypto && w.crypto.getRandomValues) w.crypto.getRandomValues(arr);
    else for (var i = 0; i < n; i++) arr[i] = Math.floor(Math.random() * 256);
    var s = '';
    for (var j = 0; j < arr.length; j++) s += String.fromCharCode(arr[j]);
    return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  // ---------- DOM ----------
  /** @param {any} s */
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return /** @type {any} */ ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c];
    });
  }

  /** @param {string} id @returns {any} */
  function $(id) {
    return document.getElementById(id);
  }

  /** Nettstedets rot-adresse (GitHub Pages), med skråstrek til slutt. */
  function siteBase() {
    var b = String(BOOT.siteUrl || '');
    if (!b) {
      // Utled fra denne sidens adresse: …/stem/, …/kontroll/ osv. ligger én mappe under roten
      var here = location.href.split('?')[0].split('#')[0];
      b = here.replace(/[^/]*$/, '');
      if (/\/(stem|kontroll|admin|skjerm)\/$/.test(b)) b = b.replace(/[^/]+\/$/, '');
    }
    return b.replace(/\/*$/, '/');
  }

  /**
   * Stemmesidens adresse: <nettsted>/stem/[?poll=s1]
   * @param {string} [pollKey]
   */
  function voteUrl(pollKey) {
    var url = siteBase() + 'stem/';
    if (pollKey) url += '?poll=' + encodeURIComponent(pollKey);
    return url;
  }

  return {
    BOOT: BOOT,
    call: call,
    serverNow: serverNow,
    syncClock: syncClock,
    poller: poller,
    storage: storage,
    randomToken: randomToken,
    esc: esc,
    $: $,
    voteUrl: voteUrl,
    siteBase: siteBase,
    onChange: onChange,
    realtimeOk: function (/** @type {string} */ t) {
      return !!rtOk[t];
    }
  };
})();
