// Etterligning av Apps Script-tjenestene som Kode.js bruker, slik at den genererte
// Apps Script-koden kan kjøres og testes i Node.
'use strict';
const crypto = require('crypto');

function createGasEnvironment(opts = {}) {
  let now = opts.now || Date.now();
  const clock = () => now;

  // ---------- Regneark ----------
  class Range {
    constructor(sheet, row, col, nr, nc) {
      Object.assign(this, { sheet, row, col, nr: nr || 1, nc: nc || 1 });
    }
    getValues() {
      const out = [];
      for (let r = 0; r < this.nr; r++) {
        const line = [];
        for (let c = 0; c < this.nc; c++) {
          const v = (this.sheet.data[this.row - 1 + r] || [])[this.col - 1 + c];
          line.push(v === undefined ? '' : v);
        }
        out.push(line);
      }
      return out;
    }
    getValue() {
      return this.getValues()[0][0];
    }
    setValues(values) {
      if (values.length !== this.nr || values[0].length !== this.nc) throw new Error('Feil dimensjon i setValues');
      this.sheet.calls++;
      values.forEach((line, r) => {
        const idx = this.row - 1 + r;
        while (this.sheet.data.length <= idx) this.sheet.data.push([]);
        line.forEach((v, c) => (this.sheet.data[idx][this.col - 1 + c] = v));
      });
      return this;
    }
    setValue(v) {
      return this.setValues([[v]]);
    }
    clearContent() {
      for (let r = 0; r < this.nr; r++) {
        const row = this.sheet.data[this.row - 1 + r];
        if (row) for (let c = 0; c < this.nc; c++) row[this.col - 1 + c] = '';
      }
      this.sheet.trim();
      return this;
    }
    setFontWeight() {
      return this;
    }
  }
  class Sheet {
    constructor(name) {
      this.name = name;
      this.data = [];
      this.calls = 0;
    }
    trim() {
      while (this.data.length && this.data[this.data.length - 1].every((v) => v === '' || v === undefined)) this.data.pop();
    }
    getLastRow() {
      this.trim();
      return this.data.length;
    }
    getRange(row, col, nr, nc) {
      return new Range(this, row, col, nr, nc);
    }
    appendRow(values) {
      this.data.push(values.slice());
      this.calls++;
    }
    clearContents() {
      this.data = [];
    }
    setFrozenRows() {}
  }
  class Spreadsheet {
    constructor(name) {
      this.id = 'ss_' + crypto.randomBytes(4).toString('hex');
      this.name = name;
      this.sheets = [new Sheet('Ark1')];
    }
    getId() {
      return this.id;
    }
    getUrl() {
      return 'https://docs.google.com/spreadsheets/d/' + this.id;
    }
    getSheetByName(n) {
      return this.sheets.find((s) => s.name === n) || null;
    }
    insertSheet(n) {
      const s = new Sheet(n);
      this.sheets.push(s);
      return s;
    }
    getSheets() {
      return this.sheets;
    }
    deleteSheet(s) {
      this.sheets = this.sheets.filter((x) => x !== s);
    }
  }
  const spreadsheets = new Map();
  const SpreadsheetApp = {
    create(name) {
      const ss = new Spreadsheet(name);
      spreadsheets.set(ss.id, ss);
      return ss;
    },
    openById(id) {
      sheetOpens++;
      const ss = spreadsheets.get(id);
      if (!ss) throw new Error('Fant ikke regneark ' + id);
      return ss;
    },
    flush() {}
  };

  // ---------- Cache ----------
  const cacheMap = new Map();
  const cache = {
    get(k) {
      const e = cacheMap.get(k);
      if (!e || e.exp < now) return null;
      return e.v;
    },
    put(k, v, ttl = 600) {
      if (typeof v !== 'string') throw new Error('Cache-verdi må være tekst');
      if (v.length > 100 * 1024) throw new Error('Cache-verdi over 100 KB');
      if (ttl > 21600) throw new Error('TTL over 6 timer');
      cacheMap.set(k, { v, exp: now + ttl * 1000 });
    },
    putAll(obj, ttl) {
      Object.keys(obj).forEach((k) => cache.put(k, obj[k], ttl));
    },
    getAll(keys) {
      const out = {};
      keys.forEach((k) => {
        const v = cache.get(k);
        if (v !== null) out[k] = v;
      });
      return out;
    },
    remove(k) {
      cacheMap.delete(k);
    },
    removeAll(keys) {
      keys.forEach((k) => cacheMap.delete(k));
    }
  };

  // ---------- Egenskaper, lås, verktøy ----------
  const props = new Map(Object.entries(opts.props || {}));
  let propCalls = 0;
  let sheetOpens = 0;
  const PropertiesService = {
    getScriptProperties: () => ({
      getProperty: (k) => {
        propCalls++;
        return props.has(k) ? props.get(k) : null;
      },
      setProperty: (k, v) => {
        propCalls++;
        const val = String(v);
        if (Buffer.byteLength(val, 'utf8') > 9 * 1024) throw new Error('Egenskapsverdi over 9 KB: ' + k);
        props.set(k, val);
      },
      deleteProperty: (k) => {
        propCalls++;
        props.delete(k);
      },
      getProperties: () => {
        propCalls++;
        return Object.fromEntries(props);
      },
      setProperties: (obj, deleteAllOthers) => {
        propCalls++;
        if (deleteAllOthers) props.clear();
        Object.keys(obj).forEach((k) => {
          const val = String(obj[k]);
          if (Buffer.byteLength(val, 'utf8') > 9 * 1024) throw new Error('Egenskapsverdi over 9 KB: ' + k);
          props.set(k, val);
        });
      }
    })
  };
  let lockHeld = false;
  const LockService = {
    getScriptLock: () => ({
      tryLock: () => {
        if (lockHeld) return false;
        lockHeld = true;
        return true;
      },
      releaseLock: () => {
        lockHeld = false;
      }
    })
  };
  const toSigned = (buf) => Array.from(buf).map((b) => (b > 127 ? b - 256 : b));
  const Utilities = {
    getUuid: () => crypto.randomUUID(),
    sleep: (ms) => {
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
    },
    computeHmacSha256Signature: (text, key) => toSigned(crypto.createHmac('sha256', key).update(text).digest()),
    base64EncodeWebSafe: (bytes) =>
      Buffer.from(bytes.map((b) => (b < 0 ? b + 256 : b)))
        .toString('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_'),
    base64Encode: (bytes) => Buffer.from(bytes.map((b) => (b < 0 ? b + 256 : b))).toString('base64'),
    computeDigest: (_alg, text) => toSigned(crypto.createHash('md5').update(text).digest()),
    DigestAlgorithm: { MD5: 'MD5' }
  };

  // ---------- Html / Content ----------
  const htmlFiles = opts.htmlFiles || {};
  const output = (content) => {
    const o = {
      content,
      title: '',
      meta: {},
      setTitle(t) {
        o.title = t;
        return o;
      },
      addMetaTag(k, v) {
        o.meta[k] = v;
        return o;
      },
      setXFrameOptionsMode() {
        return o;
      },
      getContent: () => o.content
    };
    return o;
  };
  const HtmlService = {
    XFrameOptionsMode: { DEFAULT: 'DEFAULT', ALLOWALL: 'ALLOWALL' },
    createHtmlOutput: (c) => output(c),
    createHtmlOutputFromFile: (n) => output(htmlFiles[n] || ''),
    createTemplateFromFile: (n) => {
      const t = {
        evaluate() {
          const src = htmlFiles[n];
          if (src === undefined) throw new Error('Mangler HTML-fil ' + n);
          return output(src.replace('<?!= boot ?>', t.boot));
        }
      };
      return t;
    }
  };
  const ContentService = {
    MimeType: { JSON: 'application/json', JAVASCRIPT: 'application/javascript' },
    createTextOutput: (text) => {
      const o = {
        text,
        mime: null,
        setMimeType(m) {
          o.mime = m;
          return o;
        },
        getContent: () => o.text
      };
      return o;
    }
  };
  const ScriptApp = { getService: () => ({ getUrl: () => 'https://script.google.com/macros/s/TESTID/exec' }) };
  let activeUser = opts.activeUser === undefined ? 'eier@example.com' : opts.activeUser;
  const Session = {
    getActiveUser: () => ({ getEmail: () => activeUser }),
    getEffectiveUser: () => ({ getEmail: () => 'eier@example.com' })
  };
  const logs = [];
  const Logger = { log: (m) => logs.push(String(m)) };

  return {
    globals: {
      SpreadsheetApp,
      CacheService: { getScriptCache: () => cache },
      PropertiesService,
      LockService,
      Utilities,
      HtmlService,
      ContentService,
      ScriptApp,
      Session,
      Logger
    },
    spreadsheets,
    props,
    cacheMap,
    logs,
    setActiveUser: (u) => (activeUser = u),
    tick: (ms) => (now += ms),
    stats: () => ({ propCalls, sheetOpens }),
    clock
  };
}

module.exports = { createGasEnvironment };
