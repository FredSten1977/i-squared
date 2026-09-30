// GENERERT FIL – rediger kildene i src/ og kjør «npm run build».
/* eslint-disable */
// ===== src/shared/config.js =====
// @ts-check
/**
 * Seed-data og faste definisjoner for I-Squared Statsbygg.
 * Kjører i Apps Script (global), i nettleseren (global) og i Node (module.exports).
 */
var ISQ_Config = (function () {
  'use strict';

  var CHOICES = ['against', 'neutral', 'for'];
  var CHOICE_LABELS = { against: 'MOT', neutral: 'NØYTRAL', for: 'FOR' };
  /** Skala for netto flyttede stemmesteg. */
  var CHOICE_VALUE = { against: 0, neutral: 1, for: 2 };

  var TEAMS = ['north', 'south'];

  var CARDS = [
    { key: 'yellow', icon: '🟨', title: 'PASS', name: 'Gult kort', text: 'Laget slipper å svare.' },
    { key: 'red', icon: '🟥', title: 'INNSIGELSE', name: 'Rødt kort', text: 'Laget avbryter med en kort innsigelse.' },
    { key: 'green', icon: '🟩', title: 'EKSTRATID', name: 'Grønt kort', text: 'Laget får ett ekstra minutt.' },
    { key: 'english', icon: '🇬🇧', title: 'ENGLISH, PLEASE', name: 'Britisk flagg', text: 'Svaret må gis på engelsk.' },
    { key: 'yesno', icon: '❗', title: 'JA ELLER NEI', name: 'Utropstegn', text: 'Motstanderlaget må først svare ja eller nei.' }
  ];

  var VIEWS = [
    'hero',
    'mainQuestion',
    'statement',
    'qr',
    'team',
    'opening',
    'cross',
    'closing',
    'result',
    'leaderboard',
    'mainResult',
    'winner',
    'rules',
    'video',
    'black'
  ];

  var VIEW_LABELS = {
    hero: 'Hero',
    mainQuestion: 'Hovedspørsmål',
    statement: 'Påstand',
    qr: 'QR-kode / avstemning',
    team: 'Lagpresentasjon',
    opening: 'Åpningsinnlegg',
    cross: 'Kryssforhør',
    closing: 'Sluttappell',
    result: 'Avstemningsresultat',
    leaderboard: 'Leaderboard',
    mainResult: 'Resultat hovedspørsmål',
    winner: 'Vinner av debatten',
    rules: 'Debattregler',
    video: 'Video',
    black: 'Svart skjerm'
  };

  /**
   * Videoer spilles fra den lokale publikumsskjerm-mappen på Mac-en.
   * returnTo: hvor skjermen går når videoen er ferdig (null = visningen før videoen).
   */
  var VIDEOS = [
    { key: 'introNorth', label: 'Introvideo Lag Nord', file: 'media/video/Introvideonord.mp4', team: 'north', returnTo: null },
    { key: 'introSouth', label: 'Introvideo Lag Sør', file: 'media/video/Introvideosør.mp4', team: 'south', returnTo: { view: 'statement', statementNo: 1 } },
    {
      key: 'extra1',
      label: 'Ekstravideo påstand 1',
      file: 'media/video/ekstravideopåstand1.mp4',
      statement: 1,
      returnTo: { view: 'statement', statementNo: 1 }
    },
    {
      key: 'extra2',
      label: 'Ekstravideo påstand 2',
      file: 'media/video/ekstravideopåstand2.mp4',
      statement: 2,
      returnTo: { view: 'statement', statementNo: 2 }
    },
    {
      key: 'extra3',
      label: 'Ekstravideo påstand 3',
      file: 'media/video/ekstravideopåstand3.mp4',
      statement: 3,
      returnTo: { view: 'statement', statementNo: 3 }
    }
  ];

  /** Debattdeler: varighet styres i innstillingene; overtime = timeren fortsetter i minus. */
  var SEGMENTS = {
    opening: { label: 'Åpningsinnlegg', overtime: true, autoReturn: false },
    cross: { label: 'Kryssforhør', overtime: true, autoReturn: false },
    closing: { label: 'Sluttappell', overtime: false, autoReturn: true }
  };
  /** Sekunder «TID» vises før sluttappellen går automatisk tilbake til påstanden. */
  var AUTO_RETURN_GRACE_MS = 2000;

  var MUSIC = [
    { key: 'walkon', label: 'Innmarsj', file: 'media/music/innmarsj.mp3' },
    { key: 'break', label: 'Pausemusikk', file: 'media/music/pause.mp3' }
  ];

  var POLL_IDS = ['main-before', 'main-after', 's1-before', 's1-after', 's2-before', 's2-after', 's3-before', 's3-after'];

  var STATUSES = [
    'setup',
    'intro',
    'main_poll_before',
    'team_introduction',
    'statement_1_before_poll',
    'statement_1_debate',
    'statement_1_after_poll',
    'statement_1_result',
    'statement_2_before_poll',
    'statement_2_debate',
    'statement_2_after_poll',
    'statement_2_result',
    'statement_3_before_poll',
    'statement_3_debate',
    'statement_3_after_poll',
    'statement_3_result',
    'main_poll_after',
    'final_result',
    'completed'
  ];

  var DEFAULT_SLUG = 'i-squared-statsbygg';

  /** @returns {any} et nytt arrangementsdokument med seed-data */
  function seedDocument() {
    var polls = {};
    POLL_IDS.forEach(function (id) {
      var parts = id.split('-');
      var isMain = parts[0] === 'main';
      polls[id] = {
        id: id,
        type: isMain ? 'main' : 'statement',
        statementNo: isMain ? null : Number(parts[0].slice(1)),
        phase: parts[1],
        status: 'draft',
        openedAt: null,
        closedAt: null
      };
    });
    return {
      schemaVersion: 4,
      version: 1,
      event: {
        slug: DEFAULT_SLUG,
        title: 'I-Squared Statsbygg',
        heroTitle: 'I-Squared',
        kicker: 'Statsbygg presenterer',
        mainQuestion:
          'Vil den nye styrings- og leveransemodellen modernisere vår digitale utvikling, eller blir den en PowerPoint-presentasjon uten reell praktisk effekt?',
        mainLabels: { against: 'POWERPOINT', neutral: 'USIKKER', for: 'MODERNISERING' },
        status: 'setup',
        demoMode: false,
        settings: {
          soundEnabled: true,
          autoStartTimer: true,
          requireEqualTurnout: false,
          durations: { opening: 180, cross: 240, closing: 60, team: 60 }
        },
        createdAt: null,
        updatedAt: null
      },
      teams: {
        north: { key: 'north', name: 'Lag Nord', color: '#55c8ff', image: 'media/images/lagnord.jpg' },
        south: { key: 'south', name: 'Lag Sør', color: '#ff654f', image: 'media/images/lagsør.jpg' }
      },
      statements: [
        {
          no: 1,
          short: 'Tjenester',
          text: 'Statsbygg bør organisere digital utvikling rundt tjenester, ikke rundt organisasjonsstrukturen.',
          northPosition: 'against',
          southPosition: 'for'
        },
        {
          no: 2,
          short: 'Kontroll',
          text: 'Den største hindringen for digital utvikling i Statsbygg er ikke teknologi, men ledere som ikke tør å gi fra seg kontroll.',
          northPosition: 'against',
          southPosition: 'for'
        },
        {
          no: 3,
          short: 'Kulturendring',
          text: 'Kulturendringen den nye styrings- og leveransemodellen krever er vi klare for i Statsbygg.',
          northPosition: 'against',
          southPosition: 'for'
        }
      ],
      polls: polls,
      state: {
        view: 'hero',
        previousView: 'hero',
        activeStatement: 1,
        activePollId: null,
        cueIndex: -1,
        qrPollId: null,
        activeTeam: 'north',
        segment: null,
        revealDistribution: false,
        resultStatement: null,
        video: null,
        music: null,
        flash: null
      },
      timer: { status: 'idle', startedAt: null, durationSeconds: 180, pausedRemaining: null },
      cards: [],
      results: {}
    };
  }

  return {
    CHOICES: CHOICES,
    CHOICE_LABELS: CHOICE_LABELS,
    CHOICE_VALUE: CHOICE_VALUE,
    TEAMS: TEAMS,
    CARDS: CARDS,
    VIEWS: VIEWS,
    VIEW_LABELS: VIEW_LABELS,
    VIDEOS: VIDEOS,
    SEGMENTS: SEGMENTS,
    AUTO_RETURN_GRACE_MS: AUTO_RETURN_GRACE_MS,
    MUSIC: MUSIC,
    POLL_IDS: POLL_IDS,
    STATUSES: STATUSES,
    DEFAULT_SLUG: DEFAULT_SLUG,
    seedDocument: seedDocument
  };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = ISQ_Config;

// ===== src/shared/scoring.js =====
// @ts-check
/**
 * Beregning av netto flyttede stemmesteg.
 * Skala: MOT = 0, NØYTRAL = 1, FOR = 2.
 */
var ISQ_Scoring = (function () {
  'use strict';

  /** @typedef {{against:number, neutral:number, for:number}} Tally */

  /** @param {any} t @returns {Tally} */
  function normalizeTally(t) {
    t = t || {};
    return {
      against: toCount(t.against),
      neutral: toCount(t.neutral),
      for: toCount(t['for'])
    };
  }

  /** @param {any} n */
  function toCount(n) {
    var x = Number(n);
    if (!isFinite(x) || x < 0) return 0;
    return Math.floor(x);
  }

  /** @param {Tally} t */
  function total(t) {
    return t.against + t.neutral + t['for'];
  }

  /** Stemmesteg-score: antall nøytral + 2 × antall for. @param {Tally} t */
  function stepScore(t) {
    return t.neutral + 2 * t['for'];
  }

  /**
   * Fordeler en netto bevegelse til lagene ut fra posisjonene.
   * @param {number} net
   * @param {string} northPosition
   * @param {string} southPosition
   */
  function awardTeams(net, northPosition, southPosition) {
    var north = 0;
    var south = 0;
    var direction = net > 0 ? 'for' : net < 0 ? 'against' : null;
    if (direction) {
      if (northPosition === direction) north = Math.abs(net);
      if (southPosition === direction) south = Math.abs(net);
    }
    var winner = north > south ? 'north' : south > north ? 'south' : null;
    return { north: north, south: south, winner: winner, direction: direction };
  }

  /**
   * @param {{before:any, after:any, northPosition:string, southPosition:string, mode?:string}} input
   */
  function computeRound(input) {
    var before = normalizeTally(input.before);
    var after = normalizeTally(input.after);
    var mode = input.mode === 'normalized' ? 'normalized' : 'strict';
    var beforeTotal = total(before);
    var afterTotal = total(after);
    var beforeScore = stepScore(before);
    var afterScore = stepScore(after);
    var equalTurnout = beforeTotal === afterTotal;

    var rawNet;
    if (mode === 'strict') {
      rawNet = afterScore - beforeScore;
    } else if (beforeTotal === 0 || afterTotal === 0) {
      rawNet = 0;
    } else {
      var avgBefore = beforeScore / beforeTotal;
      var avgAfter = afterScore / afterTotal;
      var base = (beforeTotal + afterTotal) / 2;
      rawNet = (avgAfter - avgBefore) * base;
    }
    var netMovement = mode === 'strict' ? rawNet : roundHalfAwayFromZero(rawNet);
    var award = awardTeams(netMovement, input.northPosition, input.southPosition);

    return {
      mode: mode,
      before: before,
      after: after,
      beforeTotal: beforeTotal,
      afterTotal: afterTotal,
      beforeScore: beforeScore,
      afterScore: afterScore,
      equalTurnout: equalTurnout,
      needsDecision: mode === 'strict' && !equalTurnout,
      rawNetMovement: Math.round(rawNet * 100) / 100,
      netMovement: netMovement,
      change: {
        against: after.against - before.against,
        neutral: after.neutral - before.neutral,
        for: after['for'] - before['for']
      },
      north: award.north,
      south: award.south,
      winner: award.winner,
      direction: award.direction
    };
  }

  /** @param {number} x */
  function roundHalfAwayFromZero(x) {
    var r = Math.round(Math.abs(x));
    return x < 0 ? -r : r;
  }

  /**
   * Summerer godkjente rundeskårer. Hovedspørsmålet er aldri med.
   * @param {Record<string, any>} results  nøkkel = påstandsnummer
   * @param {number} [statementCount]
   */
  function leaderboard(results, statementCount) {
    var n = statementCount || 3;
    var rounds = [];
    var north = 0;
    var south = 0;
    for (var i = 1; i <= n; i++) {
      var r = results ? results[String(i)] : null;
      var approved = !!(r && r.status === 'approved');
      var ns = approved ? toCount(r.north) : 0;
      var ss = approved ? toCount(r.south) : 0;
      north += ns;
      south += ss;
      rounds.push({
        statementNo: i,
        approved: approved,
        north: ns,
        south: ss,
        winner: approved ? (ns > ss ? 'north' : ss > ns ? 'south' : null) : null,
        mode: approved ? r.mode : null,
        overridden: approved ? !!r.overridden : false
      });
    }
    return {
      rounds: rounds,
      north: north,
      south: south,
      leader: north > south ? 'north' : south > north ? 'south' : null
    };
  }

  /**
   * Før/etter-sammenligning for hovedspørsmålet (teller ikke i leaderboard).
   * @param {any} beforeIn @param {any} afterIn
   */
  function mainComparison(beforeIn, afterIn) {
    var before = normalizeTally(beforeIn);
    var after = normalizeTally(afterIn);
    var bt = total(before);
    var at = total(after);
    return {
      before: before,
      after: after,
      beforeTotal: bt,
      afterTotal: at,
      beforePct: percentages(before),
      afterPct: percentages(after),
      change: {
        against: after.against - before.against,
        neutral: after.neutral - before.neutral,
        for: after['for'] - before['for']
      },
      netMovement: stepScore(after) - stepScore(before)
    };
  }

  /** Prosentfordeling (kun til visning av fordeling, aldri i score). @param {any} t */
  function percentages(t) {
    var x = normalizeTally(t);
    var n = total(x);
    if (!n) return { against: 0, neutral: 0, for: 0 };
    return {
      against: Math.round((x.against / n) * 100),
      neutral: Math.round((x.neutral / n) * 100),
      for: Math.round((x['for'] / n) * 100)
    };
  }

  return {
    normalizeTally: normalizeTally,
    total: total,
    stepScore: stepScore,
    awardTeams: awardTeams,
    computeRound: computeRound,
    leaderboard: leaderboard,
    mainComparison: mainComparison,
    percentages: percentages
  };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = ISQ_Scoring;

// ===== src/shared/timer.js =====
// @ts-check
/**
 * Serverstyrt timer. Serveren lagrer kun startedAt, durationSeconds, status og
 * pausedRemaining. Klientene regner ut gjenværende tid lokalt.
 */
var ISQ_Timer = (function () {
  'use strict';

  /** @typedef {{status:string, startedAt:number|null, durationSeconds:number, pausedRemaining:number|null}} TimerState */

  /** @param {number} s */
  function clampSeconds(s) {
    var x = Number(s);
    if (!isFinite(x) || x < 0) return 0;
    return Math.min(x, 24 * 3600);
  }

  /** @param {TimerState} t @param {number} now @returns {number} millisekunder igjen */
  function remainingMs(t, now) {
    if (!t) return 0;
    if (t.status === 'running' && t.startedAt != null) {
      return Math.max(0, t.startedAt + t.durationSeconds * 1000 - now);
    }
    if (t.status === 'paused' && t.pausedRemaining != null) {
      return Math.max(0, t.pausedRemaining * 1000);
    }
    return Math.max(0, (t.durationSeconds || 0) * 1000);
  }

  /**
   * Som remainingMs, men kan bli negativ når tiden er ute (for debattdeler som går i minus).
   * @param {TimerState} t @param {number} now
   */
  function signedRemainingMs(t, now) {
    if (t && t.status === 'running' && t.startedAt != null) return t.startedAt + t.durationSeconds * 1000 - now;
    return remainingMs(t, now);
  }

  /** Formaterer med minus foran når tiden er passert, f.eks. «−00:12». @param {number} seconds */
  function formatSigned(seconds) {
    if (seconds > -1) return format(Math.max(0, seconds));
    return '−' + format(Math.floor(-seconds));
  }

  /** @param {number} seconds @returns {TimerState} */
  function load(seconds) {
    return { status: 'idle', startedAt: null, durationSeconds: clampSeconds(seconds), pausedRemaining: null };
  }

  /** @param {TimerState} t @param {number} now @param {number} [seconds] @returns {TimerState} */
  function start(t, now, seconds) {
    var d = seconds != null ? clampSeconds(seconds) : t.durationSeconds;
    return { status: 'running', startedAt: now, durationSeconds: d, pausedRemaining: null };
  }

  /** @param {TimerState} t @param {number} now @returns {TimerState} */
  function pause(t, now) {
    if (t.status !== 'running') return t;
    return {
      status: 'paused',
      startedAt: null,
      durationSeconds: t.durationSeconds,
      pausedRemaining: Math.round(remainingMs(t, now)) / 1000
    };
  }

  /** @param {TimerState} t @param {number} now @returns {TimerState} */
  function resume(t, now) {
    if (t.status === 'paused') {
      var rem = t.pausedRemaining || 0;
      return {
        status: 'running',
        startedAt: now - (t.durationSeconds - rem) * 1000,
        durationSeconds: t.durationSeconds,
        pausedRemaining: null
      };
    }
    if (t.status === 'idle') return start(t, now);
    return t;
  }

  /** @param {TimerState} t @returns {TimerState} */
  function reset(t) {
    return load(t.durationSeconds);
  }

  /** @param {TimerState} t @param {number} deltaSeconds @param {number} now @returns {TimerState} */
  function adjust(t, deltaSeconds, now) {
    var d = Number(deltaSeconds) || 0;
    if (t.status === 'running') {
      var rem = remainingMs(t, now) / 1000;
      var nextRem = Math.max(0, rem + d);
      return {
        status: 'running',
        startedAt: t.startedAt,
        durationSeconds: Math.max(0, t.durationSeconds + (nextRem - rem)),
        pausedRemaining: null
      };
    }
    if (t.status === 'paused') {
      return {
        status: 'paused',
        startedAt: null,
        durationSeconds: Math.max(0, t.durationSeconds + d),
        pausedRemaining: Math.max(0, (t.pausedRemaining || 0) + d)
      };
    }
    return load(Math.max(0, t.durationSeconds + d));
  }

  /** @param {number} seconds @returns {string} */
  function format(seconds) {
    var s = Math.max(0, Math.ceil(seconds - 1e-6));
    var m = Math.floor(s / 60);
    var r = s % 60;
    return (m < 10 ? '0' : '') + m + ':' + (r < 10 ? '0' : '') + r;
  }

  /** Fargefase for publikumsskjermen. @param {number} seconds */
  function phase(seconds) {
    if (seconds <= 0) return 'done';
    if (seconds <= 10) return 'danger';
    if (seconds <= 30) return 'warn';
    return 'normal';
  }

  return {
    remainingMs: remainingMs,
    signedRemainingMs: signedRemainingMs,
    formatSigned: formatSigned,
    load: load,
    start: start,
    pause: pause,
    resume: resume,
    reset: reset,
    adjust: adjust,
    format: format,
    phase: phase
  };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = ISQ_Timer;

// ===== src/shared/validate.js =====
// @ts-check
/**
 * Minimal valideringsbibliotek (Zod-lignende) som kjører i Apps Script uten bundler.
 * Alle skjemaer returnerer en renset verdi eller kaster ValidationError.
 */
var ISQ_Validate = (function () {
  'use strict';

  /** @param {string} message @param {string} [path] */
  function ValidationError(message, path) {
    this.name = 'ValidationError';
    this.message = (path ? path + ': ' : '') + message;
    this.code = 'VALIDATION';
  }
  ValidationError.prototype = Object.create(Error.prototype);

  /** @typedef {(value:any, path:string) => any} Schema */

  /** @param {{min?:number, max?:number, pattern?:RegExp, trim?:boolean}} [o] @returns {Schema} */
  function string(o) {
    var opt = o || {};
    return function (v, p) {
      if (typeof v !== 'string') throw new ValidationError('må være tekst', p);
      var s = opt.trim === false ? v : v.trim();
      if (opt.min != null && s.length < opt.min) throw new ValidationError('er for kort', p);
      if (opt.max != null && s.length > opt.max) throw new ValidationError('er for lang', p);
      if (opt.pattern && !opt.pattern.test(s)) throw new ValidationError('har ugyldig format', p);
      return s;
    };
  }

  /** @param {{min?:number, max?:number, int?:boolean}} [o] @returns {Schema} */
  function number(o) {
    var opt = o || {};
    return function (v, p) {
      var n = typeof v === 'string' && v.trim() !== '' ? Number(v) : v;
      if (typeof n !== 'number' || !isFinite(n)) throw new ValidationError('må være et tall', p);
      if (opt.int && Math.floor(n) !== n) throw new ValidationError('må være et heltall', p);
      if (opt.min != null && n < opt.min) throw new ValidationError('er for lavt (min ' + opt.min + ')', p);
      if (opt.max != null && n > opt.max) throw new ValidationError('er for høyt (maks ' + opt.max + ')', p);
      return n;
    };
  }

  /** @returns {Schema} */
  function boolean() {
    return function (v, p) {
      if (typeof v !== 'boolean') throw new ValidationError('må være sann/usann', p);
      return v;
    };
  }

  /** @param {any[]} values @returns {Schema} */
  function oneOf(values) {
    return function (v, p) {
      if (values.indexOf(v) === -1) throw new ValidationError('har ugyldig verdi', p);
      return v;
    };
  }

  /** @param {Schema} schema @returns {Schema} */
  function optional(schema) {
    return function (v, p) {
      if (v === undefined || v === null || v === '') return undefined;
      return schema(v, p);
    };
  }

  /** @param {Record<string, Schema>} shape @returns {Schema} */
  function object(shape) {
    return function (v, p) {
      if (v === undefined || v === null) v = {};
      if (typeof v !== 'object' || Array.isArray(v)) throw new ValidationError('må være et objekt', p);
      /** @type {Record<string, any>} */
      var out = {};
      Object.keys(shape).forEach(function (k) {
        var r = shape[k](v[k], p ? p + '.' + k : k);
        if (r !== undefined) out[k] = r;
      });
      return out;
    };
  }

  /** @param {Schema} schema @param {any} value */
  function parse(schema, value) {
    return schema(value, '');
  }

  return {
    ValidationError: ValidationError,
    string: string,
    number: number,
    boolean: boolean,
    oneOf: oneOf,
    optional: optional,
    object: object,
    parse: parse
  };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = ISQ_Validate;

// ===== src/shared/statemachine.js =====
// @ts-check
/**
 * Kjøreplan (cue-liste) for I-Squared Statsbygg.
 *
 * Kjøreplanen er en fast, lineær liste med steg. «Neste» på kontrollflaten utfører
 * neste steg. Operatøren kan også hoppe til et hvilket som helst steg eller bruke
 * enkeltknappene, men rekkefølgen under er standardgangen i innslaget:
 *
 *   1  Forside (hero)                         2  Hovedspørsmål
 *   3  Åpne avstemning hovedspørsmål          4–5 Lukk → debattregler
 *   6  Introvideo Nord → tilbake til regler
 *   7  Introvideo Sør → påstand 1
 *   For hver påstand n (1–3):
 *     Ekstravideo n → påstand n · Åpne før-avstemning · Lukk → påstand n
 *     Åpningsinnlegg Nord 3:00 (går i minus) · Tilbake til påstand
 *     Åpningsinnlegg Sør 3:00 (går i minus)  · Tilbake til påstand
 *     Kryssforhør Nord 4:00 (går i minus)    · Tilbake til påstand
 *     Kryssforhør Sør 4:00 (går i minus)     · Tilbake til påstand
 *     Sluttappell Nord 1:00 (automatisk tilbake til påstand)
 *     Sluttappell Sør 1:00 (automatisk tilbake til påstand)
 *     Åpne etter-avstemning · Lukk → resultat for runden
 *   20 Kår vinner av debatten
 *   21 Åpne avstemning hovedspørsmål (etter) 22 Lukk → resultat hovedspørsmål
 */
var ISQ_StateMachine = (function () {
  'use strict';

  var ORDER = [
    'setup',
    'intro',
    'main_poll_before',
    'team_introduction',
    'statement_1_before_poll',
    'statement_1_debate',
    'statement_1_after_poll',
    'statement_1_result',
    'statement_2_before_poll',
    'statement_2_debate',
    'statement_2_after_poll',
    'statement_2_result',
    'statement_3_before_poll',
    'statement_3_debate',
    'statement_3_after_poll',
    'statement_3_result',
    'main_poll_after',
    'final_result',
    'completed'
  ];

  /**
   * @typedef {{id:string, step:string, label:string, status:string, actions:Array<[string, any]>}} Cue
   * @returns {Cue[]}
   */
  function buildCues() {
    /** @type {Cue[]} */
    var cues = [];
    /** @param {string} id @param {string} step @param {string} label @param {string} status @param {Array<[string, any]>} actions */
    function add(id, step, label, status, actions) {
      cues.push({ id: id, step: step, label: label, status: status, actions: actions });
    }
    add('hero', '1', 'Forside', 'intro', [['setView', { view: 'hero' }]]);
    add('mainq', '2', 'Vis hovedspørsmål', 'intro', [['setView', { view: 'mainQuestion' }]]);
    add('main-open', '3', 'Åpne avstemning: hovedspørsmål', 'main_poll_before', [['openPoll', { pollId: 'main-before', showQr: true }]]);
    add('main-close', '4–5', 'Lukk avstemning → debattregler', 'team_introduction', [
      ['closePoll', { pollId: 'main-before' }],
      ['setView', { view: 'rules' }]
    ]);
    add('intro-n', '6', 'Introvideo Lag Nord (→ regler)', 'team_introduction', [['playVideo', { key: 'introNorth' }]]);
    add('intro-s', '7', 'Introvideo Lag Sør (→ påstand 1)', 'team_introduction', [['playVideo', { key: 'introSouth' }]]);
    for (var n = 1; n <= 3; n++) {
      var s = 'statement_' + n;
      var back = /** @type {[string, any]} */ (['showStatement', { statementNo: n }]);
      var sn = '';
      // Påstand 2 og 3 vises på skjermen før ekstravideoen (påstand 1 vises allerede etter introvideo Sør)
      if (n > 1) add('s' + n + '-show', '19', 'Vis påstand ' + n, s + '_before_poll', [['showStatement', { statementNo: n }]]);
      add('s' + n + '-video', n === 1 ? '8' : '19', 'Ekstravideo påstand ' + n + ' (→ påstand ' + n + ')', s + '_before_poll', [
        ['selectStatement', { statementNo: n }],
        ['playVideo', { key: 'extra' + n }]
      ]);
      add('s' + n + '-open', n === 1 ? '9' : '19', 'Åpne før-avstemning påstand ' + n, s + '_before_poll', [
        ['openPoll', { pollId: 's' + n + '-before', showQr: true }]
      ]);
      add('s' + n + '-close', n === 1 ? '10' : '19', 'Lukk før-avstemning → påstand ' + n, s + '_before_poll', [
        ['closePoll', { pollId: 's' + n + '-before' }]
      ]);
      add('s' + n + '-open-n', n === 1 ? '11' : '19', 'Åpningsinnlegg Lag Nord' + sn, s + '_debate', [['startSegment', { kind: 'opening', team: 'north' }]]);
      add('s' + n + '-back1', n === 1 ? '11' : '19', 'Tilbake til påstand ' + n, s + '_debate', [back]);
      add('s' + n + '-open-s', n === 1 ? '12' : '19', 'Åpningsinnlegg Lag Sør' + sn, s + '_debate', [['startSegment', { kind: 'opening', team: 'south' }]]);
      add('s' + n + '-back2', n === 1 ? '12' : '19', 'Tilbake til påstand ' + n, s + '_debate', [back]);
      add('s' + n + '-cross-n', n === 1 ? '13' : '19', 'Kryssforhør Lag Nord' + sn, s + '_debate', [['startSegment', { kind: 'cross', team: 'north' }]]);
      add('s' + n + '-back3', n === 1 ? '13' : '19', 'Tilbake til påstand ' + n, s + '_debate', [back]);
      add('s' + n + '-cross-s', n === 1 ? '14' : '19', 'Kryssforhør Lag Sør' + sn, s + '_debate', [['startSegment', { kind: 'cross', team: 'south' }]]);
      add('s' + n + '-back4', n === 1 ? '14' : '19', 'Tilbake til påstand ' + n, s + '_debate', [back]);
      add('s' + n + '-close-n', n === 1 ? '15' : '19', 'Sluttappell Lag Nord (→ påstand ' + n + ' automatisk)', s + '_debate', [
        ['startSegment', { kind: 'closing', team: 'north' }]
      ]);
      add('s' + n + '-close-s', n === 1 ? '16' : '19', 'Sluttappell Lag Sør (→ påstand ' + n + ' automatisk)', s + '_debate', [
        ['startSegment', { kind: 'closing', team: 'south' }]
      ]);
      add('s' + n + '-after-open', n === 1 ? '17' : '19', 'Åpne etter-avstemning påstand ' + n, s + '_after_poll', [
        ['openPoll', { pollId: 's' + n + '-after', showQr: true }]
      ]);
      add('s' + n + '-after-close', n === 1 ? '18' : '19', 'Lukk etter-avstemning → resultat runde ' + n, s + '_result', [
        ['closePoll', { pollId: 's' + n + '-after' }]
      ]);
    }
    add('winner', '20', 'Kår vinner av debatten', 'final_result', [['setView', { view: 'winner' }]]);
    add('main2-open', '21', 'Åpne avstemning: hovedspørsmål (etter)', 'main_poll_after', [['openPoll', { pollId: 'main-after', showQr: true }]]);
    add('main2-close', '22', 'Lukk avstemning → resultat hovedspørsmål', 'completed', [['closePoll', { pollId: 'main-after' }]]);
    return cues;
  }

  var CUES = buildCues();

  /** @param {string} status */
  function label(status) {
    var m = /^statement_(\d)_(before_poll|debate|after_poll|result)$/.exec(status);
    if (m) {
      var part = { before_poll: 'før-avstemning', debate: 'debatt', after_poll: 'etter-avstemning', result: 'resultat' }[m[2]];
      return 'Påstand ' + m[1] + ': ' + part;
    }
    return (
      {
        setup: 'Oppsett',
        intro: 'Intro',
        main_poll_before: 'Hovedspørsmål før debatten',
        team_introduction: 'Regler og lagpresentasjon',
        main_poll_after: 'Hovedspørsmål etter debatten',
        final_result: 'Vinner kåret',
        completed: 'Avsluttet'
      }[status] || status
    );
  }

  /** Status som hører til en avstemning når den åpnes. @param {string} pollId */
  function statusForPollOpen(pollId) {
    if (pollId === 'main-before') return 'main_poll_before';
    if (pollId === 'main-after') return 'main_poll_after';
    var m = /^s(\d)-(before|after)$/.exec(pollId);
    return m ? 'statement_' + m[1] + '_' + m[2] + '_poll' : null;
  }

  /** @param {string} status */
  function isValid(status) {
    return ORDER.indexOf(status) !== -1;
  }

  /** @param {string} id */
  function cueIndex(id) {
    for (var i = 0; i < CUES.length; i++) if (CUES[i].id === id) return i;
    return -1;
  }

  return { ORDER: ORDER, CUES: CUES, label: label, statusForPollOpen: statusForPollOpen, isValid: isValid, cueIndex: cueIndex };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = ISQ_StateMachine;

// ===== src/shared/engine.js =====
// @ts-check
/**
 * Arrangementsmotor: all forretningslogikk for I-Squared Statsbygg.
 * Kjører identisk i Apps Script (GasStore) og i Node (MemStore for tester og dev-server).
 *
 * Lagringsgrensesnitt (store):
 *   now(), withLock(fn), loadDoc(), saveDoc(doc), getCounts(),
 *   upsertVote(pollId, voterHash, choice, demo), clearVotes(pollId|null, demoOnly),
 *   hmac(text), randomId(), cacheGet(k), cachePut(k, v, ttlSec), cacheRemove(k),
 *   getProp(k), setProp(k, v), deleteProp(k), log(entry), readLog(limit)
 */
var ISQ_Engine = (function () {
  'use strict';

  /* global ISQ_Config, ISQ_Scoring, ISQ_Timer, ISQ_Validate, ISQ_StateMachine */
  /** @param {string} name @param {string} file @returns {any} */
  function dep(name, file) {
    var g = /** @type {any} */ (typeof globalThis !== 'undefined' ? globalThis : this);
    if (g && g[name]) return g[name];
    switch (name) {
      case 'ISQ_Config':
        if (typeof ISQ_Config !== 'undefined') return ISQ_Config;
        break;
      case 'ISQ_Scoring':
        if (typeof ISQ_Scoring !== 'undefined') return ISQ_Scoring;
        break;
      case 'ISQ_Timer':
        if (typeof ISQ_Timer !== 'undefined') return ISQ_Timer;
        break;
      case 'ISQ_Validate':
        if (typeof ISQ_Validate !== 'undefined') return ISQ_Validate;
        break;
      case 'ISQ_StateMachine':
        if (typeof ISQ_StateMachine !== 'undefined') return ISQ_StateMachine;
        break;
    }
    return typeof require === 'function' ? require(file) : null;
  }

  /** @type {any} */ var C;
  /** @type {any} */ var S;
  /** @type {any} */ var T;
  /** @type {any} */ var V;
  /** @type {any} */ var SM;
  /** @type {Record<string, any>} */ var ACTION_SCHEMAS;

  /** Avhengigheter løses først ved bruk, så filrekkefølgen i Apps Script ikke spiller noen rolle. */
  function init() {
    if (C) return;
    C = dep('ISQ_Config', './config.js');
    S = dep('ISQ_Scoring', './scoring.js');
    T = dep('ISQ_Timer', './timer.js');
    V = dep('ISQ_Validate', './validate.js');
    SM = dep('ISQ_StateMachine', './statemachine.js');
    ACTION_SCHEMAS = buildSchemas();
  }

  var SESSION_TTL = 21600; // 6 timer uten aktivitet (maks for CacheService)
  var SESSION_MAX_AGE = 24 * 3600; // absolutt levetid
  var VOTER_TOKEN = /^[A-Za-z0-9_-]{16,128}$/;

  /** @param {string} message @param {string} [code] */
  function EngineError(message, code) {
    this.name = 'EngineError';
    this.message = message;
    this.code = code || 'ERROR';
  }
  EngineError.prototype = Object.create(Error.prototype);

  /** @param {string} m @param {string} [code] */
  function fail(m, code) {
    throw new EngineError(m, code);
  }

  /** @param {any} x */
  function clone(x) {
    return JSON.parse(JSON.stringify(x));
  }

  /** Fyller inn manglende felt fra seed (enkel migrering). @param {any} doc */
  function ensureDoc(doc) {
    init();
    var seed = C.seedDocument();
    if (!doc || typeof doc !== 'object') return seed;
    /** @param {any} target @param {any} src */
    function fill(target, src) {
      Object.keys(src).forEach(function (k) {
        if (target[k] === undefined) target[k] = clone(src[k]);
        else if (src[k] && typeof src[k] === 'object' && !Array.isArray(src[k]) && target[k] && typeof target[k] === 'object') {
          if (k !== 'results' && k !== 'polls') fill(target[k], src[k]);
        }
      });
    }
    fill(doc, seed);
    if (!doc.schemaVersion || doc.schemaVersion < 2) {
      // v2: kryssforhør per lag på 4 minutter, kjøreplan med cue-indeks
      if (doc.event.settings.durations.cross === 60) doc.event.settings.durations.cross = 240;
      if (doc.state.cueIndex === undefined) doc.state.cueIndex = -1;
      doc.schemaVersion = 2;
    }
    if (doc.schemaVersion < 3) {
      // v3: rettede lagposisjoner (P1 og P2: Nord MOT / Sør FOR, P3: Nord FOR / Sør MOT).
      // Endres bare hvis posisjonene fortsatt er de gamle standardverdiene.
      var old = [
        ['for', 'against'],
        ['for', 'against'],
        ['against', 'for']
      ];
      var same =
        doc.statements.length === 3 &&
        doc.statements.every(function (/** @type {any} */ st, /** @type {number} */ i) {
          return st.northPosition === old[i][0] && st.southPosition === old[i][1];
        });
      if (same) {
        var v3 = [
          ['against', 'for'],
          ['against', 'for'],
          ['for', 'against']
        ];
        doc.statements.forEach(function (/** @type {any} */ st, /** @type {number} */ i) {
          st.northPosition = v3[i][0];
          st.southPosition = v3[i][1];
        });
      }
      doc.schemaVersion = 3;
    }
    if (doc.schemaVersion < 4) {
      // v4: ulikt antall stemmer før/etter normaliseres automatisk i stedet for å stoppe opp
      doc.event.settings.requireEqualTurnout = false;
      doc.schemaVersion = 4;
    }
    C.POLL_IDS.forEach(function (id) {
      if (!doc.polls[id]) doc.polls[id] = clone(seed.polls[id]);
    });
    return doc;
  }

  // ---------- Valideringsskjemaer ----------
  function buildSchemas() {
    var team = V.oneOf(['north', 'south']);
    var pollId = V.oneOf(C.POLL_IDS);
    var statementNo = V.number({ int: true, min: 1, max: 3 });
    var position = V.oneOf(['for', 'against']);
    var confirm = V.oneOf([true]);

    /** @type {Record<string, any>} */
    var schemas = {
      setView: V.object({ view: V.oneOf(C.VIEWS), team: V.optional(team), statementNo: V.optional(statementNo) }),
      selectStatement: V.object({ statementNo: statementNo }),
      showStatement: V.object({ statementNo: V.optional(statementNo) }),
      showTeam: V.object({ team: team }),
      startSegment: V.object({ kind: V.oneOf(['opening', 'cross', 'closing']), team: V.optional(team) }),
      setActiveTeam: V.object({ team: team }),
      openPoll: V.object({ pollId: pollId, showQr: V.optional(V.boolean()) }),
      closePoll: V.object({ pollId: V.optional(pollId) }),
      reopenPoll: V.object({ pollId: pollId }),
      resetPoll: V.object({ pollId: pollId, confirm: confirm }),
      showQr: V.object({ pollId: V.optional(pollId) }),
      setReveal: V.object({ reveal: V.boolean() }),
      computeResult: V.object({ statementNo: statementNo }),
      approveResult: V.object({ statementNo: statementNo, mode: V.oneOf(['strict', 'normalized']) }),
      overrideResult: V.object({
        statementNo: statementNo,
        north: V.number({ int: true, min: 0, max: 10000 }),
        south: V.number({ int: true, min: 0, max: 10000 }),
        reason: V.string({ min: 3, max: 300 }),
        confirm: confirm
      }),
      clearResult: V.object({ statementNo: statementNo, confirm: confirm }),
      showResult: V.object({ statementNo: V.optional(statementNo) }),
      timerStart: V.object({ seconds: V.optional(V.number({ min: 0, max: 7200 })) }),
      timerPause: V.object({}),
      timerResume: V.object({}),
      timerReset: V.object({}),
      timerAdjust: V.object({ delta: V.number({ min: -3600, max: 3600 }) }),
      timerSet: V.object({ seconds: V.number({ min: 0, max: 7200 }) }),
      useCard: V.object({
        team: team,
        key: V.oneOf(
          C.CARDS.map(function (c) {
            return c.key;
          })
        )
      }),
      revertCard: V.object({ id: V.string({ min: 1, max: 64 }) }),
      playVideo: V.object({
        key: V.oneOf(
          C.VIDEOS.map(function (v) {
            return v.key;
          })
        )
      }),
      pauseVideo: V.object({}),
      resumeVideo: V.object({}),
      stopVideo: V.object({}),
      playMusic: V.object({
        key: V.oneOf(
          C.MUSIC.map(function (m) {
            return m.key;
          })
        )
      }),
      stopMusic: V.object({}),
      updateEvent: V.object({
        title: V.string({ min: 2, max: 120 }),
        heroTitle: V.optional(V.string({ min: 1, max: 60 })),
        kicker: V.string({ min: 0, max: 120 }),
        mainQuestion: V.string({ min: 5, max: 600 }),
        labelAgainst: V.string({ min: 1, max: 40 }),
        labelNeutral: V.string({ min: 1, max: 40 }),
        labelFor: V.string({ min: 1, max: 40 }),
        slug: V.optional(V.string({ min: 3, max: 60, pattern: /^[a-z0-9-]+$/ })),
        confirm: V.optional(confirm)
      }),
      updateStatement: V.object({
        statementNo: statementNo,
        text: V.string({ min: 5, max: 400 }),
        short: V.string({ min: 1, max: 40 }),
        northPosition: position,
        southPosition: position
      }),
      updateSettings: V.object({
        soundEnabled: V.optional(V.boolean()),
        autoStartTimer: V.optional(V.boolean()),
        requireEqualTurnout: V.optional(V.boolean()),
        opening: V.optional(V.number({ int: true, min: 10, max: 1800 })),
        cross: V.optional(V.number({ int: true, min: 10, max: 1800 })),
        closing: V.optional(V.number({ int: true, min: 10, max: 1800 })),
        team: V.optional(V.number({ int: true, min: 10, max: 1800 }))
      }),
      setStatus: V.object({ status: V.oneOf(C.STATUSES) }),
      advance: V.object({}),
      nextCue: V.object({}),
      runCue: V.object({ index: V.number({ int: true, min: 0, max: 500 }) }),
      generateDemoVotes: V.object({ pollId: V.optional(pollId), count: V.optional(V.number({ int: true, min: 1, max: 200 })) }),
      clearDemo: V.object({ confirm: confirm }),
      resetEvent: V.object({ confirm: confirm }),
      dismissFlash: V.object({})
    };
    return schemas;
  }

  /**
   * @param {any} store
   */
  function create(store) {
    init();
    // ---------- Dokument ----------
    function loadDoc() {
      var doc = store.loadDoc();
      if (!doc) {
        doc = C.seedDocument();
        doc.event.createdAt = new Date(store.now()).toISOString();
        doc.event.updatedAt = doc.event.createdAt;
        store.saveDoc(doc);
        return doc;
      }
      return ensureDoc(doc);
    }

    /**
     * Kjører en endring under lås, øker versjonen og lagrer.
     * @param {string} actor @param {string} action @param {any} params @param {(doc:any)=>any} fn
     */
    function mutate(actor, action, params, fn) {
      return store.withLock(function () {
        var doc = loadDoc();
        var result = fn(doc);
        doc.version = (doc.version || 0) + 1;
        doc.event.updatedAt = new Date(store.now()).toISOString();
        // Loggen registreres før lagring, slik at Apps Script kan skrive begge i én operasjon
        store.log({ at: new Date(store.now()).toISOString(), actor: actor, action: action, payload: sanitizeForLog(params) }, true);
        store.saveDoc(doc);
        return result;
      });
    }

    /** Fjerner felt som ikke skal i loggen. @param {any} params */
    function sanitizeForLog(params) {
      if (!params || typeof params !== 'object') return params || {};
      var out = clone(params);
      delete out.pin;
      delete out.token;
      delete out.session;
      return out;
    }

    // ---------- Oppslag ----------
    /** @param {any} doc @param {number} n */
    function statementOf(doc, n) {
      var s = doc.statements.filter(function (x) {
        return x.no === n;
      })[0];
      if (!s) fail('Ukjent påstand ' + n, 'NOT_FOUND');
      return s;
    }

    /** @param {any} doc */
    function openPolls(doc) {
      return C.POLL_IDS.filter(function (id) {
        return doc.polls[id].status === 'open';
      });
    }

    /** @param {any} doc @param {string} id @param {any} counts */
    function pollInfo(doc, id, counts, withDistribution) {
      if (!id || !doc.polls[id]) return null;
      var p = doc.polls[id];
      var c = S.normalizeTally(counts[id]);
      var info = {
        id: p.id,
        type: p.type,
        phase: p.phase,
        status: p.status,
        statementNo: p.statementNo,
        text: p.type === 'main' ? doc.event.mainQuestion : statementOf(doc, p.statementNo).text,
        labels: p.type === 'main' ? doc.event.mainLabels : C.CHOICE_LABELS,
        count: S.total(c),
        openedAt: p.openedAt,
        closedAt: p.closedAt
      };
      if (withDistribution) {
        /** @type {any} */ (info).distribution = c;
        /** @type {any} */ (info).percentages = S.percentages(c);
      }
      return info;
    }

    /** @param {any} doc */
    function cardsMap(doc) {
      /** @type {any} */
      var map = { north: {}, south: {} };
      C.CARDS.forEach(function (card) {
        map.north[card.key] = null;
        map.south[card.key] = null;
      });
      doc.cards.forEach(function (/** @type {any} */ u) {
        if (!u.revertedAt) map[u.team][u.key] = { id: u.id, usedAt: u.usedAt };
      });
      return map;
    }

    /** @param {any} doc @param {any} counts */
    function mainResult(doc, counts) {
      var cmp = S.mainComparison(counts['main-before'], counts['main-after']);
      return Object.assign(cmp, {
        labels: doc.event.mainLabels,
        beforeStatus: doc.polls['main-before'].status,
        afterStatus: doc.polls['main-after'].status
      });
    }

    /** Offentlig tilstand for publikumsskjerm. @param {any} doc @param {any} counts */
    function buildPublic(doc, counts) {
      var st = doc.state;
      var lb = S.leaderboard(doc.results, doc.statements.length);
      var reveal = !!st.revealDistribution;
      var resultNo = st.resultStatement || st.activeStatement;
      var r = doc.results[String(resultNo)];
      var result = null;
      if (r) {
        result = r.status === 'approved' ? clone(r) : { statementNo: r.statementNo, status: r.status, pending: true };
      }
      var anyDemo = Object.keys(counts).some(function (k) {
        return counts[k] && counts[k].demo > 0;
      });
      return {
        serverNow: store.now(),
        version: doc.version,
        event: {
          slug: doc.event.slug,
          title: doc.event.title,
          heroTitle: doc.event.heroTitle || doc.event.title,
          kicker: doc.event.kicker,
          mainQuestion: doc.event.mainQuestion,
          mainLabels: doc.event.mainLabels,
          status: doc.event.status,
          statusLabel: SM.label(doc.event.status),
          demo: !!doc.event.demoMode || anyDemo,
          durations: doc.event.settings.durations,
          soundEnabled: !!doc.event.settings.soundEnabled
        },
        teams: doc.teams,
        statements: doc.statements,
        view: st.view,
        previousView: st.previousView,
        activeStatement: st.activeStatement,
        activeTeam: st.activeTeam,
        segment: st.segment,
        revealDistribution: reveal,
        poll: pollInfo(doc, st.activePollId, counts, reveal),
        qrPoll: pollInfo(doc, st.qrPollId || st.activePollId, counts, reveal),
        timer: doc.timer,
        cards: cardsMap(doc),
        flash: st.flash,
        video: st.video,
        music: st.music,
        leaderboard: lb,
        resultStatement: resultNo,
        result: result,
        mainResult: st.view === 'mainResult' ? mainResult(doc, counts) : null
      };
    }

    // ---------- Offentlige metoder ----------
    /**
     * Long-polling: venter (maks 20 s) til noe endrer seg i forhold til klientens stempel,
     * eller til en tidsstyrt overgang (sluttappell) skal skje. Returnerer ventetiden i ms.
     * Uten store.sleep (lokal dev-server) ventes det ikke her.
     * @param {any} payload
     */
    function waitForChange(payload) {
      var since = payload && typeof payload.stamp === 'string' ? payload.stamp : null;
      var wait = payload && typeof payload.wait === 'number' ? Math.min(Math.max(payload.wait, 0), 20000) : 0;
      if (!since || !wait || typeof store.sleep !== 'function' || typeof store.stamp !== 'function') return 0;
      var start = store.now();
      var lastCheck = 0;
      while (store.now() - start < wait) {
        if (store.stamp() !== since) break;
        if (store.now() - lastCheck > 400) {
          lastCheck = store.now();
          if (needsAutoReturn(loadDoc())) break;
        }
        store.sleep(100);
      }
      return store.now() - start;
    }

    /** @param {any} [payload] */
    function publicState(payload) {
      var waited = waitForChange(payload);
      var doc = loadCurrent();
      var out = buildPublic(doc, store.getCounts());
      out.stamp = typeof store.stamp === 'function' ? store.stamp() : String(doc.version);
      out.waited = waited;
      out.serverNow = store.now();
      return out;
    }

    /** Sluttappell: når tiden er ute (+ kort «TID»), går skjermen automatisk tilbake til påstanden. @param {any} doc */
    function needsAutoReturn(doc) {
      var seg = doc.state.segment;
      if (!seg || doc.state.view !== seg.kind) return false;
      var cfg = C.SEGMENTS[seg.kind];
      if (!cfg || !cfg.autoReturn || doc.timer.status !== 'running') return false;
      return T.signedRemainingMs(doc.timer, store.now()) <= -C.AUTO_RETURN_GRACE_MS;
    }

    /** Leser dokumentet og utfører tidsstyrte overganger ved behov. */
    function loadCurrent() {
      var doc = loadDoc();
      if (!needsAutoReturn(doc)) return doc;
      mutate('system', 'autoReturn', {}, function (d) {
        if (!needsAutoReturn(d)) return;
        endSegment(d);
        setViewRaw(d, 'statement');
      });
      return loadDoc();
    }

    /**
     * Finner avstemningen en stemmeside skal vise.
     * @param {any} doc @param {string} [key]  'main' | 's1' | 's2' | 's3' | full poll-id
     */
    function resolveVotePoll(doc, key) {
      if (key) {
        if (doc.polls[key]) return key;
        var pair = [key + '-before', key + '-after'].filter(function (id) {
          return !!doc.polls[id];
        });
        if (!pair.length) return null;
        var open = pair.filter(function (id) {
          return doc.polls[id].status === 'open';
        })[0];
        if (open) return open;
        return doc.polls[pair[1]].status !== 'draft' ? pair[1] : pair[0];
      }
      var active = doc.state.activePollId;
      if (active && doc.polls[active] && doc.polls[active].status === 'open') return active;
      return openPolls(doc)[0] || active || null;
    }

    /** @param {any} payload */
    function voteState(payload) {
      var p = V.parse(V.object({ poll: V.optional(V.string({ max: 20, pattern: /^[a-z0-9-]+$/ })) }), payload);
      var doc = loadCurrent();
      var id = resolveVotePoll(doc, p.poll);
      var counts = store.getCounts();
      var info = pollInfo(doc, id, counts, false);
      return {
        serverNow: store.now(),
        version: doc.version,
        event: { title: doc.event.title, slug: doc.event.slug },
        poll: info
          ? {
              id: info.id,
              session: (doc.polls[info.id] && doc.polls[info.id].session) || '',
              type: info.type,
              phase: info.phase,
              status: info.status,
              statementNo: info.statementNo,
              text: info.text,
              labels: info.labels
            }
          : null
      };
    }

    /**
     * Offentlig stemmekatalog for publikumsmobilene (lagres i isq_live i Supabase).
     * Inneholder bare det stemmesiden trenger – ingen opptellinger.
     */
    function directory() {
      var doc = loadDoc();
      /** @type {Record<string, any>} */
      var polls = {};
      C.POLL_IDS.forEach(function (/** @type {string} */ id) {
        var p = doc.polls[id];
        if (!p) return;
        polls[id] = {
          id: p.id,
          session: p.session || '',
          type: p.type,
          phase: p.phase,
          status: p.status,
          statementNo: p.statementNo,
          text: p.type === 'main' ? doc.event.mainQuestion : statementOf(doc, p.statementNo).text,
          labels: p.type === 'main' ? doc.event.mainLabels : C.CHOICE_LABELS
        };
      });
      return {
        version: doc.version,
        event: { title: doc.event.title, slug: doc.event.slug },
        active: doc.state.activePollId || null,
        order: C.POLL_IDS.slice(),
        polls: polls
      };
    }

    /** @param {any} payload */
    function vote(payload) {
      var p = V.parse(
        V.object({
          token: V.string({ pattern: VOTER_TOKEN }),
          choice: V.oneOf(C.CHOICES),
          pollId: V.oneOf(C.POLL_IDS),
          poll: V.optional(V.string({ max: 20 }))
        }),
        payload
      );
      var voterHash = store.hmac('voter:' + p.token);
      if (!rateHit('rl:v:' + voterHash, 10, 30)) fail('For mange forsøk på kort tid. Vent litt og prøv igjen.', 'RATE_LIMIT');
      return store.withLock(function () {
        var doc = loadDoc();
        var poll = doc.polls[p.pollId];
        if (!poll || poll.status !== 'open') fail('Avstemningen er ikke åpen.', 'POLL_CLOSED');
        var r = store.upsertVote(p.pollId, voterHash, p.choice, false);
        return { result: r.result, pollId: p.pollId, choice: p.choice };
      });
    }

    /** @param {any} payload */
    function videoEnded(payload) {
      var p = V.parse(V.object({ nonce: V.string({ max: 64 }) }), payload);
      var doc = loadDoc();
      if (!doc.state.video || doc.state.video.nonce !== p.nonce) return { ignored: true };
      return mutate('display', 'videoEnded', p, function (d) {
        if (!d.state.video || d.state.video.nonce !== p.nonce) return { ignored: true };
        finishVideoRaw(d);
        return { ok: true };
      });
    }

    /** @param {any} payload */
    function displayPing(payload) {
      var p = V.parse(
        V.object({
          clientId: V.string({ max: 64, pattern: /^[A-Za-z0-9_-]+$/ }),
          missing: V.optional(V.string({ max: 2000 })),
          version: V.optional(V.number({ min: 0 })),
          mode: V.optional(V.string({ max: 20 }))
        }),
        payload
      );
      store.cachePut(
        'presence:display',
        JSON.stringify({ at: store.now(), clientId: p.clientId, missing: p.missing || '', version: p.version || 0, mode: p.mode || '' }),
        300
      );
      return { ok: true, serverNow: store.now() };
    }

    // ---------- Innlogging ----------
    /** @param {string} key @param {number} limit @param {number} windowSec */
    function rateHit(key, limit, windowSec) {
      var raw = store.cacheGet(key);
      var now = store.now();
      var entry = raw ? JSON.parse(raw) : null;
      if (!entry || now - entry.start > windowSec * 1000) entry = { start: now, n: 0 };
      entry.n++;
      store.cachePut(key, JSON.stringify(entry), windowSec);
      return entry.n <= limit;
    }

    /** @param {any} payload */
    function login(payload) {
      var p = V.parse(V.object({ pin: V.string({ min: 1, max: 128 }) }), payload);
      if (!rateHit('rl:login', 10, 600)) fail('For mange innloggingsforsøk. Vent 10 minutter.', 'RATE_LIMIT');
      var stored = store.getProp('ADMIN_PIN_HASH');
      if (!stored) {
        var plain = store.getProp('ADMIN_PIN');
        if (!plain) fail('Administrator-PIN er ikke satt opp. Se README (isq_set_admin_pin).', 'NO_PIN');
        if (String(plain).length < 6) fail('ADMIN_PIN må være minst 6 tegn.', 'WEAK_PIN');
        stored = store.hmac('pin:' + plain);
        store.setProp('ADMIN_PIN_HASH', stored);
        store.deleteProp('ADMIN_PIN');
      }
      if (!safeEqual(store.hmac('pin:' + p.pin), stored)) {
        store.log({ at: new Date(store.now()).toISOString(), actor: 'anonym', action: 'loginFailed', payload: {} });
        fail('Feil PIN.', 'AUTH');
      }
      var token = store.randomId() + store.randomId();
      saveSession(token, { c: store.now(), r: store.now() });
      store.log({ at: new Date(store.now()).toISOString(), actor: 'admin:' + token.slice(0, 6), action: 'login', payload: {} });
      return { session: token, ttlSeconds: SESSION_TTL };
    }

    /** @param {string} a @param {string} b */
    function safeEqual(a, b) {
      if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
      var diff = 0;
      for (var i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
      return diff === 0;
    }

    /** Nøkkel for varig lagring av sesjonen (kun hash av token lagres). @param {string} token */
    function sessionPropKey(token) {
      return 'SESS_' + store.hmac('sess:' + token).slice(0, 24);
    }

    /**
     * Sesjoner ligger i cache for fart og i Script Properties for varighet, slik at
     * operatøren ikke logges ut om cachen tømmes midt i arrangementet.
     * @param {string} token @param {{c:number, r:number}} s
     */
    function saveSession(token, s) {
      var json = JSON.stringify(s);
      store.cachePut('sess:' + token, json, SESSION_TTL);
      store.setProp(sessionPropKey(token), json);
    }

    /** @param {any} session @returns {string} actor */
    function requireSession(session) {
      if (typeof session !== 'string' || !/^[a-f0-9]{16,128}$/.test(session)) fail('Ikke innlogget.', 'AUTH');
      var raw = store.cacheGet('sess:' + session) || store.getProp(sessionPropKey(session));
      if (!raw) fail('Innloggingen er utløpt. Logg inn på nytt.', 'AUTH');
      var s = JSON.parse(raw);
      var now = store.now();
      if (now - s.r > SESSION_TTL * 1000 || now - s.c > SESSION_MAX_AGE * 1000) {
        store.cacheRemove('sess:' + session);
        store.deleteProp(sessionPropKey(session));
        fail('Innloggingen er utløpt. Logg inn på nytt.', 'AUTH');
      }
      if (now - s.r > 5 * 60 * 1000) {
        s.r = now;
        saveSession(session, s);
      } else if (!store.cacheGet('sess:' + session)) {
        store.cachePut('sess:' + session, JSON.stringify(s), SESSION_TTL);
      }
      return 'admin:' + session.slice(0, 6);
    }

    /** @param {any} payload */
    function logout(payload) {
      if (payload && typeof payload.session === 'string' && /^[a-f0-9]{16,128}$/.test(payload.session)) {
        store.cacheRemove('sess:' + payload.session);
        store.deleteProp(sessionPropKey(payload.session));
      }
      return { ok: true };
    }

    // ---------- Kontrolltilstand ----------
    /** @param {any} payload */
    function controlState(payload) {
      requireSession(payload && payload.session);
      var waited = waitForChange(payload);
      var doc = loadCurrent();
      var counts = store.getCounts();
      var pub = buildPublic(doc, counts);
      /** @type {Record<string, any>} */
      var polls = {};
      C.POLL_IDS.forEach(function (id) {
        var closed = doc.polls[id].status === 'closed';
        var info = pollInfo(doc, id, counts, closed);
        /** @type {any} */ (info).demo = (counts[id] && counts[id].demo) || 0;
        polls[id] = info;
      });
      var presenceRaw = store.cacheGet('presence:display');
      var ci = typeof doc.state.cueIndex === 'number' ? doc.state.cueIndex : -1;
      var nxCue = SM.CUES[ci + 1];
      pub.stamp = typeof store.stamp === 'function' ? store.stamp() : String(doc.version);
      pub.waited = waited;
      pub.serverNow = store.now();
      return Object.assign(pub, {
        control: true,
        mainResult: mainResult(doc, counts),
        polls: polls,
        results: doc.results,
        cardUsage: doc.cards,
        settings: doc.event.settings,
        eventConfig: {
          title: doc.event.title,
          heroTitle: doc.event.heroTitle || '',
          kicker: doc.event.kicker,
          mainQuestion: doc.event.mainQuestion,
          mainLabels: doc.event.mainLabels,
          slug: doc.event.slug,
          demoMode: !!doc.event.demoMode
        },
        cueIndex: ci,
        cues: SM.CUES.map(function (/** @type {any} */ c, /** @type {number} */ i) {
          return { index: i, step: c.step, label: c.label };
        }),
        nextStep: nxCue ? { index: ci + 1, step: nxCue.step, label: nxCue.label } : null,
        statuses: C.STATUSES.map(function (/** @type {string} */ s) {
          return { id: s, label: SM.label(s) };
        }),
        display: presenceRaw ? JSON.parse(presenceRaw) : null,
        reportPending: store.cacheGet('reportPending') === '1',
        log: store.readLog(25)
      });
    }

    // ---------- Handlinger ----------
    /** @param {any} doc @param {string} view */
    function setViewRaw(doc, view) {
      // Går skjermen bort fra en debattdel, avsluttes den (timeren pauses eller nullstilles)
      if (['opening', 'cross', 'closing'].indexOf(view) === -1) endSegment(doc);
      if (doc.state.view !== view && doc.state.view !== 'video') doc.state.previousView = doc.state.view;
      doc.state.view = view;
    }

    /** @param {any} doc */
    function loadSegmentTimer(doc, seconds) {
      var auto = !!doc.event.settings.autoStartTimer;
      doc.timer = auto ? T.start(T.load(seconds), store.now()) : T.load(seconds);
    }

    /** @param {any} doc @param {number} n @param {string} mode */
    function computeResultInto(doc, n, mode) {
      var counts = store.getCounts();
      var st = statementOf(doc, n);
      var bId = 's' + n + '-before';
      var aId = 's' + n + '-after';
      if (doc.polls[bId].status !== 'closed') fail('Før-avstemningen for påstand ' + n + ' må være lukket.', 'STATE');
      if (doc.polls[aId].status !== 'closed') fail('Etter-avstemningen for påstand ' + n + ' må være lukket.', 'STATE');
      var calc = S.computeRound({
        before: counts[bId],
        after: counts[aId],
        northPosition: st.northPosition,
        southPosition: st.southPosition,
        mode: mode
      });
      var requireEqual = doc.event.settings.requireEqualTurnout === true;
      var autoNormalized = false;
      if (mode === 'strict' && !calc.equalTurnout && !requireEqual) {
        // Ulikt antall stemmer: bruk normalisert beregning automatisk (merkes tydelig)
        calc = S.computeRound({
          before: counts[bId],
          after: counts[aId],
          northPosition: st.northPosition,
          southPosition: st.southPosition,
          mode: 'normalized'
        });
        autoNormalized = true;
      }
      var status = calc.mode === 'normalized' || calc.equalTurnout || !requireEqual ? 'approved' : 'pending';
      var demo = ((counts[bId] && counts[bId].demo) || 0) + ((counts[aId] && counts[aId].demo) || 0) > 0;
      var nowIso = new Date(store.now()).toISOString();
      doc.results[String(n)] = Object.assign(calc, {
        statementNo: n,
        status: status,
        overridden: false,
        overrideReason: null,
        northPosition: st.northPosition,
        southPosition: st.southPosition,
        calculatedAt: nowIso,
        approvedAt: status === 'approved' ? nowIso : null,
        demo: demo,
        autoNormalized: autoNormalized
      });
      doc.state.resultStatement = n;
      doc.event.status = 'statement_' + n + '_result';
      return doc.results[String(n)];
    }

    /** @param {any} doc @param {string} id */
    function closePollRaw(doc, id) {
      var p = doc.polls[id];
      if (p.status === 'open') {
        p.status = 'closed';
        p.closedAt = new Date(store.now()).toISOString();
      }
    }

    /** Avslutter en pågående debattdel (timer til hvile, eller pause hvis tid gjenstår). @param {any} doc */
    function endSegment(doc) {
      if (!doc.state.segment) return;
      var rem = T.signedRemainingMs(doc.timer, store.now());
      if (doc.timer.status === 'running' && rem > 0) doc.timer = T.pause(doc.timer, store.now());
      else if (doc.timer.status === 'running') doc.timer = T.reset(doc.timer);
      doc.state.segment = null;
    }

    /** Går fra video til returvisningen. @param {any} doc */
    function finishVideoRaw(doc) {
      var v = doc.state.video;
      if (v) {
        if (v.returnStatement) doc.state.activeStatement = v.returnStatement;
        doc.state.view = v.returnView || 'hero';
      }
      doc.state.video = null;
    }

    var CUE_ACTIONS = ['nextCue', 'runCue', 'advance'];

    /** @param {any} a @param {any} b */
    function sameParams(a, b) {
      var ka = Object.keys(a || {}).filter(function (k) {
        return a[k] !== undefined;
      });
      var kb = Object.keys(b || {}).filter(function (k) {
        return b[k] !== undefined;
      });
      if (ka.length !== kb.length) return false;
      return ka.every(function (k) {
        return a[k] === b[k];
      });
    }

    /**
     * Manuell overstyring: hvis en manuell handling tilsvarer et steg i kjøreplanen,
     * flyttes «Neste» dit, slik at kjøreplanen fortsetter fra der operatøren er.
     * Steg under en påstand matches bare når påstanden er den aktive.
     * @param {any} doc @param {string} name @param {any} params
     */
    function syncCue(doc, name, params) {
      var cur = typeof doc.state.cueIndex === 'number' ? doc.state.cueIndex : -1;
      var best = -1;
      var bestDist = Infinity;
      SM.CUES.forEach(function (/** @type {any} */ cue, /** @type {number} */ i) {
        var m = /^s(\d)-/.exec(cue.id);
        if (m && Number(m[1]) !== doc.state.activeStatement) return;
        var hit = cue.actions.some(function (/** @type {[string, any]} */ a) {
          if (a[0] !== name) return false;
          if (name === 'selectStatement') return false;
          return sameParams(a[1], params);
        });
        if (!hit) return;
        // Foretrekk nærmeste steg fremover, deretter bakover
        var dist = i > cur ? i - cur : cur - i + 1000;
        if (dist < bestDist) {
          bestDist = dist;
          best = i;
        }
      });
      if (best !== -1) {
        doc.state.cueIndex = best;
        doc.event.status = SM.CUES[best].status;
      }
    }

    /** @param {any} doc @param {number} i @param {any} ctx */
    function runCueRaw(doc, i, ctx) {
      var cue = SM.CUES[i];
      var out = null;
      cue.actions.forEach(function (/** @type {[string, any]} */ a) {
        out = runAction(doc, a[0], a[1], ctx) || out;
      });
      doc.state.cueIndex = i;
      doc.event.status = cue.status;
      return out;
    }

    /** @type {Record<string, (doc:any, p:any, ctx:any)=>any>} */
    var ACTIONS = {
      setView: function (doc, p) {
        if (p.view === 'video') fail('Bruk «Spill video» for å vise video.', 'STATE');
        if (p.team) doc.state.activeTeam = p.team;
        if (p.statementNo) {
          if (p.view === 'result') doc.state.resultStatement = p.statementNo;
          else doc.state.activeStatement = p.statementNo;
        }
        if (['opening', 'cross', 'closing'].indexOf(p.view) === -1) endSegment(doc);
        setViewRaw(doc, p.view);
        if (p.view === 'hero' && doc.event.status === 'setup') doc.event.status = 'intro';
        if (p.view === 'winner') doc.event.status = 'final_result';
        if (p.view === 'mainResult') doc.event.status = 'completed';
        if (p.view === 'result' && !p.statementNo) doc.state.resultStatement = doc.state.activeStatement;
      },
      selectStatement: function (doc, p) {
        statementOf(doc, p.statementNo);
        doc.state.activeStatement = p.statementNo;
      },
      showStatement: function (doc, p) {
        if (p.statementNo) doc.state.activeStatement = p.statementNo;
        endSegment(doc);
        setViewRaw(doc, 'statement');
      },
      showTeam: function (doc, p) {
        doc.state.activeTeam = p.team;
        doc.state.segment = null;
        setViewRaw(doc, 'team');
        // Lagpresentasjon: timeren lastes (ikke startet) og skjules til den startes fra TIMER
        if (doc.timer.status !== 'running') doc.timer = T.load(doc.event.settings.durations.team);
        if (['setup', 'intro', 'main_poll_before'].indexOf(doc.event.status) !== -1) doc.event.status = 'team_introduction';
      },
      startSegment: function (doc, p) {
        var kind = p.kind;
        var tm = p.team || doc.state.activeTeam || 'north';
        doc.state.activeTeam = tm;
        doc.state.segment = { kind: kind, team: tm };
        setViewRaw(doc, kind);
        loadSegmentTimer(doc, doc.event.settings.durations[kind]);
        doc.event.status = 'statement_' + doc.state.activeStatement + '_debate';
      },
      setActiveTeam: function (doc, p) {
        doc.state.activeTeam = p.team;
        if (doc.state.segment) doc.state.segment.team = p.team;
      },
      openPoll: function (doc, p) {
        openPolls(doc).forEach(function (id) {
          if (id !== p.pollId) closePollRaw(doc, id);
        });
        var poll = doc.polls[p.pollId];
        if (poll.status !== 'open') {
          poll.status = 'open';
          poll.openedAt = new Date(store.now()).toISOString();
          poll.closedAt = null;
        }
        if (poll.statementNo) doc.state.activeStatement = poll.statementNo;
        doc.state.activePollId = p.pollId;
        doc.state.qrPollId = p.pollId;
        doc.state.revealDistribution = false;
        if (p.showQr !== false) setViewRaw(doc, 'qr');
        var s = SM.statusForPollOpen(p.pollId);
        if (s) doc.event.status = s;
      },
      closePoll: function (doc, p) {
        var id = p.pollId || doc.state.activePollId;
        if (!id) fail('Ingen aktiv avstemning.', 'STATE');
        closePollRaw(doc, id);
        // Skjermen går videre av seg selv når avstemningen lukkes
        var poll = doc.polls[id];
        if (poll.type === 'main') {
          setViewRaw(doc, poll.phase === 'before' ? 'rules' : 'mainResult');
          if (poll.phase === 'after') doc.event.status = 'completed';
          return null;
        }
        var n = poll.statementNo;
        doc.state.activeStatement = n;
        if (poll.phase === 'before') {
          setViewRaw(doc, 'statement');
          return null;
        }
        if (doc.polls['s' + n + '-before'].status !== 'closed') {
          setViewRaw(doc, 'statement');
          return { warning: 'Før-avstemningen for påstand ' + n + ' er ikke gjennomført, så resultatet kan ikke beregnes.' };
        }
        var r = computeResultInto(doc, n, 'strict');
        setViewRaw(doc, 'result');
        return { result: r, warning: r.status === 'pending' ? 'Ulikt antall stemmer før og etter – velg løsning under RESULTAT.' : undefined };
      },
      reopenPoll: function (doc, p) {
        ACTIONS.openPoll(doc, { pollId: p.pollId, showQr: true });
      },
      resetPoll: function (doc, p) {
        store.clearVotes(p.pollId, false);
        var poll = doc.polls[p.pollId];
        // Ny «økt»-ID gjør at mobilene glemmer stemmen de husket fra før nullstillingen
        poll.session = store.randomId().slice(0, 10);
        poll.status = 'draft';
        poll.openedAt = null;
        poll.closedAt = null;
        if (poll.statementNo) delete doc.results[String(poll.statementNo)];
        if (doc.state.activePollId === p.pollId) doc.state.revealDistribution = false;
      },
      showQr: function (doc, p) {
        var id = p.pollId || doc.state.activePollId;
        if (id) {
          doc.state.qrPollId = id;
          if (doc.polls[id].statementNo) doc.state.activeStatement = doc.polls[id].statementNo;
        }
        setViewRaw(doc, 'qr');
      },
      setReveal: function (doc, p) {
        doc.state.revealDistribution = p.reveal;
      },
      computeResult: function (doc, p) {
        var r = computeResultInto(doc, p.statementNo, 'strict');
        setViewRaw(doc, 'result');
        return r;
      },
      approveResult: function (doc, p) {
        var existing = doc.results[String(p.statementNo)];
        if (p.mode === 'strict' && existing && !existing.equalTurnout && doc.event.settings.requireEqualTurnout === true) {
          fail('Ulikt antall stemmer før og etter. Velg normalisert beregning eller manuell overstyring.', 'STATE');
        }
        var r = computeResultInto(doc, p.statementNo, p.mode);
        r.status = 'approved';
        r.approvedAt = new Date(store.now()).toISOString();
        return r;
      },
      overrideResult: function (doc, p) {
        var n = p.statementNo;
        var st = statementOf(doc, n);
        var prev = doc.results[String(n)] || {};
        var nowIso = new Date(store.now()).toISOString();
        doc.results[String(n)] = Object.assign({}, prev, {
          statementNo: n,
          status: 'approved',
          mode: 'manual',
          overridden: true,
          overrideReason: p.reason,
          north: p.north,
          south: p.south,
          winner: p.north > p.south ? 'north' : p.south > p.north ? 'south' : null,
          northPosition: st.northPosition,
          southPosition: st.southPosition,
          calculatedAt: prev.calculatedAt || nowIso,
          approvedAt: nowIso
        });
        doc.state.resultStatement = n;
      },
      clearResult: function (doc, p) {
        delete doc.results[String(p.statementNo)];
      },
      showResult: function (doc, p) {
        doc.state.resultStatement = p.statementNo || doc.state.resultStatement || doc.state.activeStatement;
        setViewRaw(doc, 'result');
      },
      timerStart: function (doc, p) {
        doc.timer = T.start(doc.timer, store.now(), p.seconds);
      },
      timerPause: function (doc) {
        doc.timer = T.pause(doc.timer, store.now());
      },
      timerResume: function (doc) {
        doc.timer = T.resume(doc.timer, store.now());
      },
      timerReset: function (doc) {
        doc.timer = T.reset(doc.timer);
      },
      timerAdjust: function (doc, p) {
        doc.timer = T.adjust(doc.timer, p.delta, store.now());
      },
      timerSet: function (doc, p) {
        doc.timer = T.load(p.seconds);
      },
      useCard: function (doc, p) {
        var used = cardsMap(doc)[p.team][p.key];
        if (used) fail('Kortet er allerede brukt av ' + doc.teams[p.team].name + '.', 'CARD_USED');
        var usage = { id: store.randomId().slice(0, 12), team: p.team, key: p.key, usedAt: new Date(store.now()).toISOString(), revertedAt: null };
        doc.cards.push(usage);
        doc.state.flash = { id: usage.id, team: p.team, key: p.key, at: store.now() };
        if (p.key === 'green') doc.timer = T.adjust(doc.timer, 60, store.now());
        return { usage: usage };
      },
      revertCard: function (doc, p) {
        var u = doc.cards.filter(function (/** @type {any} */ x) {
          return x.id === p.id && !x.revertedAt;
        })[0];
        if (!u) fail('Fant ikke kortbruken.', 'NOT_FOUND');
        u.revertedAt = new Date(store.now()).toISOString();
        if (doc.state.flash && doc.state.flash.id === u.id) doc.state.flash = null;
        if (u.key === 'green' && doc.timer.status !== 'idle') doc.timer = T.adjust(doc.timer, -60, store.now());
      },
      playVideo: function (doc, p) {
        var ret = doc.state.view === 'video' && doc.state.video ? doc.state.video.returnView : doc.state.view;
        var retStatement = null;
        var cfg = C.VIDEOS.filter(function (/** @type {any} */ v) {
          return v.key === p.key;
        })[0];
        if (cfg && cfg.returnTo) {
          ret = cfg.returnTo.view;
          retStatement = cfg.returnTo.statementNo || null;
        }
        if (['opening', 'cross', 'closing'].indexOf(ret) !== -1) ret = 'statement';
        endSegment(doc);
        doc.state.video = {
          key: p.key,
          nonce: store.randomId().slice(0, 16),
          status: 'playing',
          returnView: ret || 'hero',
          returnStatement: retStatement,
          at: store.now()
        };
        doc.state.view = 'video';
      },
      pauseVideo: function (doc) {
        if (!doc.state.video) fail('Ingen video spilles.', 'STATE');
        doc.state.video.status = 'paused';
      },
      resumeVideo: function (doc) {
        if (!doc.state.video) fail('Ingen video spilles.', 'STATE');
        doc.state.video.status = 'playing';
      },
      stopVideo: function (doc) {
        finishVideoRaw(doc);
      },
      playMusic: function (doc, p) {
        doc.state.music = { key: p.key, nonce: store.randomId().slice(0, 16), status: 'playing' };
      },
      stopMusic: function (doc) {
        doc.state.music = null;
      },
      updateEvent: function (doc, p) {
        if (p.slug && p.slug !== doc.event.slug) {
          if (p.confirm !== true) fail('Bytte av arrangement-ID må bekreftes.', 'CONFIRM');
          doc.event.slug = p.slug;
        }
        doc.event.title = p.title;
        if (p.heroTitle) doc.event.heroTitle = p.heroTitle;
        doc.event.kicker = p.kicker;
        doc.event.mainQuestion = p.mainQuestion;
        doc.event.mainLabels = { against: p.labelAgainst, neutral: p.labelNeutral, for: p.labelFor };
      },
      updateStatement: function (doc, p) {
        var st = statementOf(doc, p.statementNo);
        st.text = p.text;
        st.short = p.short;
        st.northPosition = p.northPosition;
        st.southPosition = p.southPosition;
        if (p.northPosition === p.southPosition) return { warning: 'Begge lag har samme posisjon på påstand ' + p.statementNo + '.' };
      },
      updateSettings: function (doc, p) {
        var s = doc.event.settings;
        ['soundEnabled', 'autoStartTimer', 'requireEqualTurnout'].forEach(function (k) {
          if (p[k] !== undefined) s[k] = p[k];
        });
        ['opening', 'cross', 'closing', 'team'].forEach(function (k) {
          if (p[k] !== undefined) s.durations[k] = p[k];
        });
      },
      setStatus: function (doc, p) {
        doc.event.status = p.status;
      },
      nextCue: function (doc, p, ctx) {
        var i = (typeof doc.state.cueIndex === 'number' ? doc.state.cueIndex : -1) + 1;
        if (i >= SM.CUES.length) fail('Kjøreplanen er fullført.', 'STATE');
        return runCueRaw(doc, i, ctx);
      },
      runCue: function (doc, p, ctx) {
        if (p.index >= SM.CUES.length) fail('Ukjent steg i kjøreplanen.', 'NOT_FOUND');
        return runCueRaw(doc, p.index, ctx);
      },
      advance: function (doc, p, ctx) {
        return ACTIONS.nextCue(doc, p, ctx);
      },
      generateDemoVotes: function (doc, p) {
        var id = p.pollId || doc.state.activePollId;
        if (!id) fail('Velg en avstemning for demostemmer.', 'STATE');
        var poll = doc.polls[id];
        var counts = store.getCounts();
        var count = p.count;
        var pairBefore = poll.phase === 'after' ? id.replace('-after', '-before') : null;
        if (!count) count = pairBefore && counts[pairBefore] ? S.total(S.normalizeTally(counts[pairBefore])) || 40 : 40;
        var seed = store.now() % 997;
        var list = [];
        for (var i = 0; i < count; i++) {
          var r = pseudoRandom(seed + i * 31 + (poll.phase === 'after' ? 7 : 0));
          var choice;
          if (poll.phase === 'before') choice = r < 0.35 ? 'against' : r < 0.65 ? 'neutral' : 'for';
          else choice = r < 0.25 ? 'against' : r < 0.45 ? 'neutral' : 'for';
          list.push({ hash: 'demo-' + i, choice: choice, demo: true });
        }
        if (typeof store.bulkVotes === 'function') store.bulkVotes(id, list);
        else
          list.forEach(function (v) {
            store.upsertVote(id, v.hash, v.choice, true);
          });
        doc.event.demoMode = true;
        return { pollId: id, count: count };
      },
      clearDemo: function (doc) {
        var removed = store.clearVotes(null, true);
        Object.keys(doc.results).forEach(function (k) {
          if (doc.results[k].demo) delete doc.results[k];
        });
        doc.event.demoMode = false;
        return { removed: removed };
      },
      resetEvent: function (doc) {
        var seed = C.seedDocument();
        store.clearVotes(null, false);
        doc.polls = seed.polls;
        Object.keys(doc.polls).forEach(function (id) {
          doc.polls[id].session = store.randomId().slice(0, 10);
        });
        doc.state = seed.state;
        doc.timer = T.load(doc.event.settings.durations.opening);
        doc.cards = [];
        doc.results = {};
        doc.event.status = 'setup';
        doc.event.demoMode = false;
      },
      dismissFlash: function (doc) {
        doc.state.flash = null;
      }
    };

    /** @param {number} n */
    function pseudoRandom(n) {
      var x = Math.sin(n * 12.9898) * 43758.5453;
      return x - Math.floor(x);
    }

    /** @param {any} doc @param {string} name @param {any} params @param {any} ctx */
    function runAction(doc, name, params, ctx) {
      var schema = ACTION_SCHEMAS[name];
      var fn = ACTIONS[name];
      if (!schema || !fn) fail('Ukjent handling: ' + name, 'UNKNOWN_ACTION');
      var p = V.parse(schema, params || {});
      return fn(doc, p, ctx);
    }

    /** @param {any} payload */
    function action(payload) {
      var actor = requireSession(payload && payload.session);
      var name = payload && payload.action;
      if (typeof name !== 'string' || !ACTION_SCHEMAS[name]) fail('Ukjent handling.', 'UNKNOWN_ACTION');
      // Valider før lås, for raske feilmeldinger
      V.parse(ACTION_SCHEMAS[name], payload.params || {});
      var result = mutate(actor, name, payload.params, function (doc) {
        var r = runAction(doc, name, payload.params, { actor: actor });
        if (CUE_ACTIONS.indexOf(name) === -1) syncCue(doc, name, V.parse(ACTION_SCHEMAS[name], payload.params || {}));
        return r;
      });
      return { result: result || null, state: controlState({ session: payload.session }) };
    }

    /**
     * Skriver rapport og stemmekopi til regnearket i bakgrunnen (eget kall fra kontrollflaten),
     * slik at selve trykket ikke må vente på regnearket.
     * @param {any} payload
     */
    function flushReport(payload) {
      requireSession(payload && payload.session);
      if (typeof store.flushReport === 'function') return { written: !!store.flushReport() };
      return { written: false };
    }

    // ---------- RPC ----------
    /** @type {Record<string, (payload:any)=>any>} */
    var PUBLIC = {
      'public.state': function (payload) {
        return publicState(payload);
      },
      'public.voteState': voteState,
      'public.vote': vote,
      'public.videoEnded': videoEnded,
      'public.displayPing': displayPing,
      'auth.login': login,
      'auth.logout': logout,
      'control.state': controlState,
      'control.action': action,
      'control.flushReport': flushReport
    };

    /**
     * Felles inngang. Returnerer alltid {ok:true,data} eller {ok:false,error,code}.
     * @param {string} method @param {any} payload
     */
    function rpc(method, payload) {
      try {
        var fn = PUBLIC[method];
        if (!fn) fail('Ukjent metode.', 'UNKNOWN_METHOD');
        return { ok: true, data: fn(payload || {}) };
      } catch (e) {
        var err = /** @type {any} */ (e);
        var known = err && (err.name === 'EngineError' || err.name === 'ValidationError');
        return {
          ok: false,
          code: known ? err.code : 'INTERNAL',
          error: known ? (err.code === 'VALIDATION' ? 'Ugyldige data: ' + err.message : err.message) : 'Uventet feil på serveren. Prøv igjen.',
          detail: known ? undefined : String(err && err.message ? err.message : err)
        };
      }
    }

    return {
      rpc: rpc,
      publicState: publicState,
      voteState: voteState,
      vote: vote,
      login: login,
      controlState: controlState,
      action: action,
      directory: directory,
      PUBLIC_GET_METHODS: ['public.state', 'public.voteState', 'public.videoEnded', 'public.displayPing']
    };
  }

  function actionNames() {
    init();
    return Object.keys(ACTION_SCHEMAS);
  }

  return { create: create, ensureDoc: ensureDoc, EngineError: EngineError, actionNames: actionNames };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = ISQ_Engine;

export default ISQ_Engine;
