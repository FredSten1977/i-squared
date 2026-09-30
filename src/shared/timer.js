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
