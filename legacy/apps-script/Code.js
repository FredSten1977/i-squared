// @ts-check
/* global ISQ_Engine, ISQ_Config, ISQ_Scoring, SpreadsheetApp, CacheService, PropertiesService, LockService,
   Utilities, HtmlService, ContentService, ScriptApp, Session, Logger */
/**
 * I-Squared Statsbygg – Apps Script-backend.
 *
 * Offentlige inngangspunkter (kan kalles av nettleseren):
 *   doGet(e)          – sider (?page=control|admin|vote|display) og JSON/JSONP-API (?api=...)
 *   rpc(method, data) – brukes av google.script.run fra kontrollflate og stemmeside
 *
 * Funksjoner for redigeringsverktøyet (krever at du er eier):
 *   oppsett(), nullstillAdminPin(), skrivRapport()
 *
 * Alle andre funksjoner slutter på understrek og er derfor private i Apps Script.
 */

var SHEET_NAMES_ = { state: 'Tilstand', votes: 'Stemmer', log: 'Logg', report: 'Rapport' };
var VOTE_HEADERS_ = ['poll_id', 'voter_hash', 'choice', 'demo', 'created_at', 'updated_at'];
var LOG_HEADERS_ = ['tidspunkt', 'aktør', 'handling', 'data'];
var CACHE_TTL_ = 21600;

// ---------------------------------------------------------------------------
// Inngangspunkter
// ---------------------------------------------------------------------------

/** @param {any} e */
function doGet(e) {
  var p = Object.assign({}, (e && e.parameter) || {});
  // Ruter i stil med /display/<slug>, /control/<slug>, /vote/<slug>, /admin/<slug>, /health
  var pathInfo = e && e.pathInfo ? String(e.pathInfo) : '';
  if (pathInfo) {
    var parts = pathInfo.split('/').filter(function (x) {
      return !!x;
    });
    if (parts[0] === 'health') p.api = 'health';
    else {
      p.page = parts[0];
      if (parts[1]) p.event = parts[1];
    }
  }
  if (p.api) return api_(p);

  var engine = engine_();
  var pub = engine.rpc('public.state', {});
  var slug = pub.ok ? pub.data.event.slug : ISQ_Config.DEFAULT_SLUG;
  if (p.event && p.event !== slug) {
    return HtmlService.createHtmlOutput(
      '<meta name="viewport" content="width=device-width,initial-scale=1"><body style="font-family:sans-serif;background:#07111c;color:#fff;padding:24px"><h1>Ukjent arrangement</h1><p>Lenken peker til et arrangement som ikke finnes.</p></body>'
    ).setTitle('Ukjent arrangement');
  }

  var page = String(p.page || 'home');
  var files = { home: 'landing', control: 'control', admin: 'control', vote: 'vote', display: 'display' };
  var file = /** @type {any} */ (files)[page] || 'landing';
  var boot = {
    page: page,
    mode: 'gas',
    execUrl: ScriptApp.getService().getUrl(),
    slug: slug,
    poll: typeof p.poll === 'string' ? p.poll.slice(0, 20) : null,
    title: pub.ok ? pub.data.event.title : 'I-Squared Statsbygg'
  };
  var t = HtmlService.createTemplateFromFile(file);
  t.boot = JSON.stringify(boot).replace(/</g, '\\u003c');
  var titles = { control: 'Kontroll', admin: 'Admin', vote: 'Stem', display: 'Publikumsskjerm', home: '' };
  var sub = /** @type {any} */ (titles)[page] || '';
  return t
    .evaluate()
    .setTitle((sub ? sub + ' • ' : '') + boot.title)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1, viewport-fit=cover')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.DEFAULT);
}

/**
 * HTTP POST fra kontrollflaten og stemmesiden: {method, payload} som tekst.
 * Svarer med JSON. Brukes i stedet for google.script.run fordi det ikke påvirkes av
 * hvilke Google-kontoer som er innlogget i nettleseren.
 * @param {any} e
 */
function doPost(e) {
  var result;
  try {
    var msg = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    result = engine_().rpc(String(msg.method || ''), msg.payload || {});
  } catch (err) {
    result = { ok: false, code: 'VALIDATION', error: 'Ugyldig forespørsel.' };
  }
  return ContentService.createTextOutput(JSON.stringify(result)).setMimeType(ContentService.MimeType.JSON);
}

/**
 * Brukes av google.script.run. Returnerer alltid {ok, data} eller {ok:false, error}.
 * @param {string} method @param {any} payload
 */
function rpc(method, payload) {
  return engine_().rpc(String(method), payload || {});
}

// ---------------------------------------------------------------------------
// JSON/JSONP-API for den lokale publikumsskjermen
// ---------------------------------------------------------------------------

/** @param {any} p */
function api_(p) {
  var engine = engine_();
  var method = String(p.api);
  var allowed = { state: 'public.state', voteState: 'public.voteState', videoEnded: 'public.videoEnded', ping: 'public.displayPing' };
  var full = /** @type {any} */ (allowed)[method];
  var result;
  if (method === 'health') {
    result = health_();
  } else if (!full) {
    result = { ok: false, code: 'UNKNOWN_METHOD', error: 'Ukjent API-metode.' };
  } else {
    var payload = {};
    try {
      payload = p.p ? JSON.parse(String(p.p)) : {};
    } catch (err) {
      payload = {};
    }
    result = engine.rpc(full, payload);
  }
  var body = JSON.stringify(result);
  var cb = typeof p.callback === 'string' && /^[A-Za-z_$][A-Za-z0-9_$.]{0,60}$/.test(p.callback) ? p.callback : null;
  if (cb) {
    return ContentService.createTextOutput(cb + '(' + body + ');').setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return ContentService.createTextOutput(body).setMimeType(ContentService.MimeType.JSON);
}

/** Enkel helsesjekk: lagring, cache og motor. */
function health_() {
  var started = Date.now();
  try {
    var st = engine_().rpc('public.state', {});
    return {
      ok: !!st.ok,
      service: 'i-squared-statsbygg',
      time: new Date().toISOString(),
      version: st.ok ? st.data.version : null,
      status: st.ok ? st.data.event.status : null,
      ms: Date.now() - started,
      error: st.ok ? undefined : st.error
    };
  } catch (err) {
    return { ok: false, service: 'i-squared-statsbygg', time: new Date().toISOString(), error: String(err) };
  }
}

// ---------------------------------------------------------------------------
// Motor og lagring
// ---------------------------------------------------------------------------

/** @type {any} */
var ENGINE_ = null;

function engine_() {
  if (!ENGINE_) ENGINE_ = ISQ_Engine.create(gasStore_());
  return ENGINE_;
}

function props_() {
  return PropertiesService.getScriptProperties();
}

function cache_() {
  return CacheService.getScriptCache();
}

/** @type {any} */
var SS_ = null;

function spreadsheet_() {
  if (SS_) return SS_;
  var id = props_().getProperty('SHEET_ID');
  if (!id) throw new Error('Regnearket er ikke satt opp. Kjør funksjonen oppsett() i Apps Script-redigeringsverktøyet.');
  SS_ = SpreadsheetApp.openById(id);
  return SS_;
}

/** @param {string} name */
function sheet_(name) {
  var sh = spreadsheet_().getSheetByName(name);
  if (!sh) throw new Error('Mangler fanen «' + name + '». Kjør oppsett() på nytt.');
  return sh;
}

function salt_() {
  var p = props_();
  var s = p.getProperty('VOTER_SALT');
  if (!s) {
    s = Utilities.getUuid() + Utilities.getUuid();
    p.setProperty('VOTER_SALT', s);
  }
  return s;
}

/*
 * Lagring (optimalisert for fart):
 *  - Arrangementsdokumentet ligger i CacheService (rask lesing) og i Script Properties
 *    (varig, delt i biter à 4000 tegn). Regnearket åpnes ikke ved vanlige handlinger.
 *  - Stemmer ligger i Script Properties med nøkkel «V|<avstemning>|<voter-hash>».
 *    Opptellingen holdes i cache og bygges fra Script Properties ved behov.
 *  - Audit-loggen bufres i Script Properties og skrives til regnearket i klumper.
 *  - Regnearket (Rapport, Stemmer, Logg) oppdateres når resultater endres, og er en
 *    lesbar kopi – ikke primærlagring.
 */
var DOC_CHUNK_ = 4000;
var VOTE_PREFIX_ = 'V|';
var LOGBUF_ = 'LOGBUF';
var LOGBUF_MAX_ = 6000;

/** Leser dokumentet fra Script Properties. @returns {string|null} */
function readDocProps_() {
  var p = props_();
  var n = Number(p.getProperty('DOC_N') || 0);
  if (!n) return null;
  var parts = [];
  for (var i = 0; i < n; i++) {
    var part = p.getProperty('DOC_' + i);
    if (part === null) return null;
    parts.push(part);
  }
  return parts.join('');
}

/**
 * Script Properties tillater maks 9 KB per verdi. Hvis regnearket ikke kan skrives,
 * beholdes de nyeste oppføringene slik at lagringen aldri feiler.
 * @param {any[]} buf
 */
function logBufString_(buf) {
  var raw = JSON.stringify(buf);
  while (raw.length > 8000 && buf.length > 1) {
    buf.shift();
    raw = JSON.stringify(buf);
  }
  return raw;
}

/** Loggoppføringer som venter på å bli lagret sammen med neste dokumentlagring. @type {any[]} */
var PENDING_LOG_ = [];

/** @param {string} json */
function writeDocProps_(json) {
  var p = props_();
  var prevN = Number(cache_().get('docN') || p.getProperty('DOC_N') || 0);
  /** @type {Record<string,string>} */
  var obj = {};
  if (PENDING_LOG_.length) {
    var buf = JSON.parse(p.getProperty(LOGBUF_) || '[]').concat(PENDING_LOG_);
    PENDING_LOG_ = [];
    obj[LOGBUF_] = logBufString_(buf);
  }
  var n = Math.max(1, Math.ceil(json.length / DOC_CHUNK_));
  for (var i = 0; i < n; i++) obj['DOC_' + i] = json.slice(i * DOC_CHUNK_, (i + 1) * DOC_CHUNK_);
  obj.DOC_N = String(n);
  p.setProperties(obj);
  for (var j = n; j < prevN; j++) p.deleteProperty('DOC_' + j);
  cache_().put('docN', String(n), CACHE_TTL_);
  if (obj[LOGBUF_] && obj[LOGBUF_].length > LOGBUF_MAX_) {
    try {
      flushLog_();
    } catch (e) {
      /* prøves igjen senere */
    }
  }
}

/** @param {string} v */
function parseVote_(v) {
  var demo = v.charAt(v.length - 1) === '*';
  return { choice: demo ? v.slice(0, -1) : v, demo: demo };
}

/** Bygger opptellingen fra Script Properties. */
function rebuildCounts_() {
  /** @type {Record<string, any>} */
  var counts = {};
  ISQ_Config.POLL_IDS.forEach(function (/** @type {string} */ id) {
    counts[id] = { against: 0, neutral: 0, for: 0, total: 0, demo: 0 };
  });
  var all = props_().getProperties();
  Object.keys(all).forEach(function (k) {
    if (k.indexOf(VOTE_PREFIX_) !== 0) return;
    var pollId = k.split('|')[1];
    var v = parseVote_(all[k]);
    var c = counts[pollId];
    if (!c || c[v.choice] === undefined) return;
    c[v.choice]++;
    c.total++;
    if (v.demo) c.demo++;
  });
  cache_().put('counts', JSON.stringify(counts), CACHE_TTL_);
  return counts;
}

function bumpCountStamp_() {
  cache_().put('cver', String(Date.now()) + Math.floor(Math.random() * 1000), CACHE_TTL_);
}

/** Skriver bufret audit-logg til regnearket. */
function flushLog_() {
  var p = props_();
  var raw = p.getProperty(LOGBUF_);
  if (!raw) return;
  var entries = JSON.parse(raw);
  if (!entries.length) return;
  var sh = sheet_(SHEET_NAMES_.log);
  var rows = entries.map(function (/** @type {any} */ e) {
    return [e.at, e.actor, e.action, JSON.stringify(e.payload || {}).slice(0, 2000)];
  });
  sh.getRange(sh.getLastRow() + 1, 1, rows.length, 4).setValues(rows);
  p.deleteProperty(LOGBUF_);
}

function gasStore_() {
  return {
    now: function () {
      return Date.now();
    },
    /** @param {number} ms */
    sleep: function (ms) {
      Utilities.sleep(ms);
    },
    /** Endringsstempel: dokumentversjon + stemmeteller. Brukes til long-polling. */
    stamp: function () {
      var got = cache_().getAll(['ver', 'cver']);
      var ver = got.ver;
      if (!ver) {
        var doc = this.loadDoc();
        ver = String(doc ? doc.version : 0);
        cache_().put('ver', ver, CACHE_TTL_);
      }
      return ver + '|' + (got.cver || '0');
    },
    /** @param {() => any} fn */
    withLock: function (fn) {
      var lock = LockService.getScriptLock();
      if (!lock.tryLock(25000)) {
        throw new ISQ_Engine.EngineError('Serveren er opptatt. Prøv igjen om et øyeblikk.', 'BUSY');
      }
      try {
        return fn();
      } finally {
        lock.releaseLock();
      }
    },
    loadDoc: function () {
      var cached = cache_().get('doc');
      if (cached) return JSON.parse(cached);
      var json = readDocProps_();
      if (!json) {
        // Eldre versjon lagret dokumentet i regnearket
        try {
          var raw = sheet_(SHEET_NAMES_.state).getRange(1, 1).getValue();
          json = raw ? String(raw) : null;
        } catch (e) {
          json = null;
        }
      }
      if (!json) return null;
      var doc = JSON.parse(json);
      cache_().putAll({ doc: json, ver: String(doc.version || 0) }, CACHE_TTL_);
      return doc;
    },
    /** @param {any} doc */
    saveDoc: function (doc) {
      var json = JSON.stringify(doc);
      cache_().putAll({ doc: json, ver: String(doc.version || 0) }, CACHE_TTL_);
      writeDocProps_(json);
      // Rapporten i regnearket oppdateres når resultater eller påstander endres – men ikke her:
      // den skrives i bakgrunnen (flushReport), så trykket på mobilen ikke venter på regnearket.
      var digest = Utilities.base64Encode(Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, JSON.stringify([doc.statements, doc.results])));
      if (cache_().get('reportDigest') !== digest) cache_().put('reportPending', '1', CACHE_TTL_);
    },
    /** Skriver rapporten hvis den venter. Kalles i et eget kall fra kontrollflaten. */
    flushReport: function () {
      var c = cache_();
      if (c.get('reportPending') !== '1' || c.get('reportBusy')) return false;
      c.put('reportBusy', '1', 120);
      try {
        c.remove('reportPending');
        var doc = this.loadDoc();
        if (!doc) return false;
        writeReport_(doc);
        c.put(
          'reportDigest',
          Utilities.base64Encode(Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, JSON.stringify([doc.statements, doc.results]))),
          CACHE_TTL_
        );
        return true;
      } catch (e) {
        c.put('reportPending', '1', CACHE_TTL_);
        return false;
      } finally {
        c.remove('reportBusy');
      }
    },
    getCounts: function () {
      var cached = cache_().get('counts');
      if (cached) return JSON.parse(cached);
      return rebuildCounts_();
    },
    /** @param {string} pollId @param {string} voterHash @param {string} choice @param {boolean} demo */
    upsertVote: function (pollId, voterHash, choice, demo) {
      var counts = this.getCounts();
      if (!counts[pollId]) counts[pollId] = { against: 0, neutral: 0, for: 0, total: 0, demo: 0 };
      var key = VOTE_PREFIX_ + pollId + '|' + voterHash;
      var p = props_();
      var prevRaw = p.getProperty(key);
      var prev = prevRaw ? parseVote_(prevRaw) : null;
      if (prev && prev.choice === choice) return { result: 'unchanged', previous: choice };
      p.setProperty(key, choice + (demo ? '*' : ''));
      var c = counts[pollId];
      if (prev) {
        c[prev.choice]--;
        c[choice]++;
      } else {
        c[choice]++;
        c.total++;
        if (demo) c.demo++;
      }
      cache_().put('counts', JSON.stringify(counts), CACHE_TTL_);
      bumpCountStamp_();
      return { result: prev ? 'updated' : 'created', previous: prev ? prev.choice : null };
    },
    /**
     * Mange stemmer i én skriving (demo-modus).
     * @param {string} pollId @param {Array<{hash:string, choice:string, demo:boolean}>} list
     */
    bulkVotes: function (pollId, list) {
      /** @type {Record<string,string>} */
      var obj = {};
      list.forEach(function (v) {
        obj[VOTE_PREFIX_ + pollId + '|' + v.hash] = v.choice + (v.demo ? '*' : '');
      });
      props_().setProperties(obj);
      rebuildCounts_();
      bumpCountStamp_();
      return list.length;
    },
    /** @param {string|null} pollId @param {boolean} demoOnly */
    clearVotes: function (pollId, demoOnly) {
      var p = props_();
      var all = p.getProperties();
      var removed = 0;
      /** @type {Record<string,string>} */
      var keep = {};
      Object.keys(all).forEach(function (k) {
        if (k.indexOf(VOTE_PREFIX_) === 0) {
          var id = k.split('|')[1];
          var matchPoll = !pollId || id === pollId;
          if (matchPoll && (!demoOnly || parseVote_(all[k]).demo)) {
            removed++;
            return;
          }
        }
        keep[k] = all[k];
      });
      if (removed) p.setProperties(keep, true);
      rebuildCounts_();
      bumpCountStamp_();
      return removed;
    },
    /** @param {string} text */
    hmac: function (text) {
      return Utilities.base64EncodeWebSafe(Utilities.computeHmacSha256Signature(text, salt_())).replace(/=+$/, '');
    },
    randomId: function () {
      return Utilities.getUuid().replace(/-/g, '');
    },
    /** @param {string} k */
    cacheGet: function (k) {
      return cache_().get(k);
    },
    /** @param {string} k @param {string} v @param {number} ttl */
    cachePut: function (k, v, ttl) {
      cache_().put(k, v, Math.min(CACHE_TTL_, Math.max(1, Math.round(ttl))));
    },
    /** @param {string} k */
    cacheRemove: function (k) {
      cache_().remove(k);
    },
    /** @param {string} k */
    getProp: function (k) {
      return props_().getProperty(k);
    },
    /** @param {string} k @param {string} v */
    setProp: function (k, v) {
      props_().setProperty(k, v);
    },
    /** @param {string} k */
    deleteProp: function (k) {
      props_().deleteProperty(k);
    },
    /**
     * Audit-logg: bufres i Script Properties og skrives til regnearket i klumper.
     * withDocSave = true: lagres sammen med dokumentet (én skriveoperasjon).
     * @param {any} entry @param {boolean} [withDocSave]
     */
    log: function (entry, withDocSave) {
      var c = cache_();
      var tail = JSON.parse(c.get('logTail') || '[]');
      tail.unshift({ at: entry.at, actor: entry.actor, action: entry.action, payload: JSON.stringify(entry.payload || {}).slice(0, 300) });
      c.put('logTail', JSON.stringify(tail.slice(0, 25)), CACHE_TTL_);
      if (withDocSave) {
        PENDING_LOG_.push({ at: entry.at, actor: entry.actor, action: entry.action, payload: entry.payload || {} });
        return;
      }
      var p = props_();
      var buf = JSON.parse(p.getProperty(LOGBUF_) || '[]');
      buf.push({ at: entry.at, actor: entry.actor, action: entry.action, payload: entry.payload || {} });
      var raw = logBufString_(buf);
      p.setProperty(LOGBUF_, raw);
      if (raw.length > LOGBUF_MAX_) {
        try {
          flushLog_();
        } catch (e) {
          /* prøves igjen ved neste klump */
        }
      }
    },
    /** @param {number} limit */
    readLog: function (limit) {
      var tail = cache_().get('logTail');
      if (tail) return JSON.parse(tail).slice(0, limit);
      var buf = JSON.parse(props_().getProperty(LOGBUF_) || '[]');
      return buf
        .slice(-limit)
        .reverse()
        .map(function (/** @type {any} */ e) {
          return { at: e.at, actor: e.actor, action: e.action, payload: JSON.stringify(e.payload || {}) };
        });
    }
  };
}

/** Skriver alle stemmer (hash, ikke token) til fanen «Stemmer» som lesbar kopi. */
function exportVotes_() {
  var all = props_().getProperties();
  var rows = [];
  Object.keys(all).forEach(function (k) {
    if (k.indexOf(VOTE_PREFIX_) !== 0) return;
    var parts = k.split('|');
    var v = parseVote_(all[k]);
    rows.push([parts[1], parts.slice(2).join('|'), v.choice, v.demo, '', '']);
  });
  var sh = sheet_(SHEET_NAMES_.votes);
  var last = sh.getLastRow();
  if (last >= 2) sh.getRange(2, 1, last - 1, 6).clearContent();
  if (rows.length) sh.getRange(2, 1, rows.length, 6).setValues(rows);
}

/** Skriver en lesbar oversikt i fanen «Rapport». @param {any} doc */
function writeReport_(doc) {
  var sh = sheet_(SHEET_NAMES_.report);
  sh.clearContents();
  /** @type {any[][]} */
  var rows = [['I-Squared Statsbygg – rapport', '', '', '', '', '', '', '']];
  rows.push(['Oppdatert', new Date(), '', '', '', '', '', '']);
  rows.push(['', '', '', '', '', '', '', '']);
  rows.push(['Påstand', 'Tekst', 'Lag Nord', 'Lag Sør', 'Netto stemmesteg', 'Poeng Nord', 'Poeng Sør', 'Modus/status']);
  doc.statements.forEach(function (/** @type {any} */ s) {
    var r = doc.results[String(s.no)];
    rows.push([
      s.no,
      s.text,
      s.northPosition === 'for' ? 'FOR' : 'MOT',
      s.southPosition === 'for' ? 'FOR' : 'MOT',
      r ? r.netMovement : '',
      r ? r.north : '',
      r ? r.south : '',
      r ? r.mode + ' / ' + r.status + (r.overridden ? ' (overstyrt: ' + r.overrideReason + ')' : '') : ''
    ]);
  });
  var lb = ISQ_Scoring.leaderboard(doc.results, doc.statements.length);
  rows.push(['', 'Totalt (godkjente)', '', '', '', lb.north, lb.south, '']);
  rows.push(['', '', '', '', '', '', '', '']);
  rows.push(['Kortbruk', 'Lag', 'Kort', 'Brukt', 'Angret', '', '', '']);
  doc.cards.forEach(function (/** @type {any} */ c) {
    rows.push(['', c.team === 'north' ? 'Lag Nord' : 'Lag Sør', c.key, c.usedAt, c.revertedAt || '', '', '', '']);
  });
  sh.getRange(1, 1, rows.length, 8).setValues(rows);
  exportVotes_();
  flushLog_();
}

// ---------------------------------------------------------------------------
// Oppsett (kjøres fra redigeringsverktøyet)
// ---------------------------------------------------------------------------

function assertEditor_() {
  var active = '';
  var effective = '';
  try {
    active = Session.getActiveUser().getEmail();
    effective = Session.getEffectiveUser().getEmail();
  } catch (e) {
    active = '';
  }
  if (!active || active !== effective) throw new Error('Denne funksjonen kan bare kjøres av eieren i Apps Script-redigeringsverktøyet.');
}

/**
 * Oppretter regnearket, fanene, hemmelig salt og seed-data. Trygg å kjøre flere ganger:
 * eksisterende data slettes ikke.
 */
function oppsett() {
  assertEditor_();
  var p = props_();
  var id = p.getProperty('SHEET_ID');
  var ss;
  if (id) {
    ss = SpreadsheetApp.openById(id);
  } else {
    ss = SpreadsheetApp.create('I-Squared Statsbygg – data');
    p.setProperty('SHEET_ID', ss.getId());
  }
  SS_ = ss;
  /** @param {string} name @param {string[]|null} headers */
  function ensure(name, headers) {
    var sh = ss.getSheetByName(name) || ss.insertSheet(name);
    if (headers && sh.getLastRow() === 0) {
      sh.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold');
      sh.setFrozenRows(1);
    }
    return sh;
  }
  ensure(SHEET_NAMES_.state, null);
  ensure(SHEET_NAMES_.votes, VOTE_HEADERS_);
  ensure(SHEET_NAMES_.log, LOG_HEADERS_);
  ensure(SHEET_NAMES_.report, null);
  var def = ss.getSheetByName('Ark1') || ss.getSheetByName('Sheet1');
  if (def && ss.getSheets().length > 1) ss.deleteSheet(def);
  salt_();
  cache_().removeAll(['doc', 'counts', 'ver', 'cver', 'docN']);
  engine_().rpc('public.state', {}); // oppretter seed-dokumentet ved første kjøring
  var hasPin = !!(p.getProperty('ADMIN_PIN') || p.getProperty('ADMIN_PIN_HASH'));
  Logger.log('Regneark: ' + ss.getUrl());
  Logger.log(hasPin ? 'Admin-PIN er satt.' : 'HUSK: legg inn ADMIN_PIN (minst 6 tegn) under Prosjektinnstillinger → Script Properties.');
  return ss.getUrl();
}

/** Sletter lagret PIN-hash slik at en ny ADMIN_PIN kan settes i Script Properties. */
function nullstillAdminPin() {
  assertEditor_();
  props_().deleteProperty('ADMIN_PIN_HASH');
  Logger.log('PIN-hash slettet. Legg inn ny ADMIN_PIN i Script Properties.');
}

/** Oppdaterer rapportfanen manuelt. */
function skrivRapport() {
  assertEditor_();
  cache_().removeAll(['doc', 'counts']);
  var doc = gasStore_().loadDoc();
  if (doc) writeReport_(doc);
}
