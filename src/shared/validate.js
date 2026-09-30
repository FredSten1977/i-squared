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
