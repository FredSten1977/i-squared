// @ts-check
/**
 * Selvstendig QR-kodegenerator (byte-modus, feilretting M, versjon 1–20).
 * Genererer QR-koder direkte i nettleseren uten eksterne biblioteker.
 */
var ISQ_QR = (function () {
  'use strict';

  // [ecPerBlock, blocks1, data1, blocks2, data2] for feilrettingsnivå M
  var EC_M = [
    null,
    [10, 1, 16, 0, 0],
    [16, 1, 28, 0, 0],
    [26, 1, 44, 0, 0],
    [18, 2, 32, 0, 0],
    [24, 2, 43, 0, 0],
    [16, 4, 27, 0, 0],
    [18, 4, 31, 0, 0],
    [22, 2, 38, 2, 39],
    [22, 3, 36, 2, 37],
    [26, 4, 43, 1, 44],
    [30, 1, 50, 4, 51],
    [22, 6, 36, 2, 37],
    [22, 8, 37, 1, 38],
    [24, 4, 40, 5, 41],
    [24, 5, 41, 5, 42],
    [28, 7, 45, 3, 46],
    [28, 10, 46, 1, 47],
    [26, 9, 43, 4, 44],
    [26, 3, 44, 11, 45],
    [26, 3, 41, 13, 42]
  ];

  var ALIGN = [
    null,
    [],
    [6, 18],
    [6, 22],
    [6, 26],
    [6, 30],
    [6, 34],
    [6, 22, 38],
    [6, 24, 42],
    [6, 26, 46],
    [6, 28, 50],
    [6, 30, 54],
    [6, 32, 58],
    [6, 34, 62],
    [6, 26, 46, 66],
    [6, 26, 48, 70],
    [6, 26, 50, 74],
    [6, 30, 54, 78],
    [6, 30, 56, 82],
    [6, 30, 58, 86],
    [6, 34, 62, 90]
  ];

  var EC_FORMAT_BITS_M = 0; // M = 00

  // ---------- GF(256) ----------
  var EXP = new Array(512);
  var LOG = new Array(256);
  (function initGf() {
    var x = 1;
    for (var i = 0; i < 255; i++) {
      EXP[i] = x;
      LOG[x] = i;
      x <<= 1;
      if (x & 0x100) x ^= 0x11d;
    }
    for (var j = 255; j < 512; j++) EXP[j] = EXP[j - 255];
  })();

  /** @param {number} a @param {number} b */
  function gfMul(a, b) {
    if (a === 0 || b === 0) return 0;
    return EXP[LOG[a] + LOG[b]];
  }

  /** @param {number} degree @returns {number[]} */
  function generator(degree) {
    var g = [1];
    for (var i = 0; i < degree; i++) {
      var next = new Array(g.length + 1).fill(0);
      for (var j = 0; j < g.length; j++) {
        next[j] ^= g[j];
        next[j + 1] ^= gfMul(g[j], EXP[i]);
      }
      g = next;
    }
    return g;
  }

  /** @param {number[]} data @param {number} ecLen @returns {number[]} */
  function rsRemainder(data, ecLen) {
    var gen = generator(ecLen);
    var res = new Array(ecLen).fill(0);
    for (var i = 0; i < data.length; i++) {
      var factor = data[i] ^ res[0];
      res.shift();
      res.push(0);
      for (var j = 0; j < ecLen; j++) res[j] ^= gfMul(gen[j + 1], factor);
    }
    return res;
  }

  // ---------- Hjelpere ----------
  /** @param {string} str @returns {number[]} */
  function utf8Bytes(str) {
    var out = [];
    for (var i = 0; i < str.length; i++) {
      var c = str.charCodeAt(i);
      if (c >= 0xd800 && c <= 0xdbff && i + 1 < str.length) {
        var c2 = str.charCodeAt(i + 1);
        if (c2 >= 0xdc00 && c2 <= 0xdfff) {
          c = 0x10000 + ((c - 0xd800) << 10) + (c2 - 0xdc00);
          i++;
        }
      }
      if (c < 0x80) out.push(c);
      else if (c < 0x800) out.push(0xc0 | (c >> 6), 0x80 | (c & 63));
      else if (c < 0x10000) out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
      else out.push(0xf0 | (c >> 18), 0x80 | ((c >> 12) & 63), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
    }
    return out;
  }

  /** @param {number} v */
  function dataCapacity(v) {
    var e = EC_M[v];
    return e[1] * e[2] + e[3] * e[4];
  }

  /** @param {number} x @param {number} i */
  function bit(x, i) {
    return ((x >>> i) & 1) !== 0;
  }

  // ---------- Koding ----------
  /**
   * @param {string} text
   * @returns {{size:number, version:number, modules:boolean[][]}}
   */
  function encode(text) {
    var bytes = utf8Bytes(String(text));
    var version = 0;
    for (var v = 1; v <= 20; v++) {
      var ccBits = v < 10 ? 8 : 16;
      var needBits = 4 + ccBits + bytes.length * 8;
      if (needBits <= dataCapacity(v) * 8) {
        version = v;
        break;
      }
    }
    if (!version) throw new Error('Teksten er for lang for QR-kode');

    var capBits = dataCapacity(version) * 8;
    /** @type {number[]} */
    var bits = [];
    /** @param {number} val @param {number} len */
    function push(val, len) {
      for (var i = len - 1; i >= 0; i--) bits.push((val >>> i) & 1);
    }
    push(4, 4);
    push(bytes.length, version < 10 ? 8 : 16);
    bytes.forEach(function (b) {
      push(b, 8);
    });
    push(0, Math.min(4, capBits - bits.length));
    while (bits.length % 8) bits.push(0);
    var codewords = [];
    for (var k = 0; k < bits.length; k += 8) {
      var byte = 0;
      for (var m = 0; m < 8; m++) byte = (byte << 1) | bits[k + m];
      codewords.push(byte);
    }
    for (var pad = 0xec; codewords.length < capBits / 8; pad ^= 0xec ^ 0x11) codewords.push(pad);

    // Blokker + feilretting
    var e = EC_M[version];
    var blocks = [];
    var ecBlocks = [];
    var pos = 0;
    for (var g = 0; g < 2; g++) {
      var count = g === 0 ? e[1] : e[3];
      var len = g === 0 ? e[2] : e[4];
      for (var b2 = 0; b2 < count; b2++) {
        var blk = codewords.slice(pos, pos + len);
        pos += len;
        blocks.push(blk);
        ecBlocks.push(rsRemainder(blk, e[0]));
      }
    }
    var finalCw = [];
    var maxData = Math.max(e[2], e[4]);
    for (var i2 = 0; i2 < maxData; i2++) {
      for (var j2 = 0; j2 < blocks.length; j2++) if (i2 < blocks[j2].length) finalCw.push(blocks[j2][i2]);
    }
    for (var i3 = 0; i3 < e[0]; i3++) {
      for (var j3 = 0; j3 < ecBlocks.length; j3++) finalCw.push(ecBlocks[j3][i3]);
    }

    // Matrise
    var size = version * 4 + 17;
    /** @type {boolean[][]} */
    var mod = [];
    /** @type {boolean[][]} */
    var fn = [];
    for (var r = 0; r < size; r++) {
      mod.push(new Array(size).fill(false));
      fn.push(new Array(size).fill(false));
    }
    /** @param {number} x @param {number} y @param {boolean} dark */
    function setFn(x, y, dark) {
      mod[y][x] = dark;
      fn[y][x] = true;
    }
    for (var t = 0; t < size; t++) {
      setFn(6, t, t % 2 === 0);
      setFn(t, 6, t % 2 === 0);
    }
    /** @param {number} cx @param {number} cy */
    function finder(cx, cy) {
      for (var dy = -4; dy <= 4; dy++) {
        for (var dx = -4; dx <= 4; dx++) {
          var d = Math.max(Math.abs(dx), Math.abs(dy));
          var xx = cx + dx;
          var yy = cy + dy;
          if (xx >= 0 && xx < size && yy >= 0 && yy < size) setFn(xx, yy, d !== 2 && d !== 4);
        }
      }
    }
    finder(3, 3);
    finder(size - 4, 3);
    finder(3, size - 4);
    var al = ALIGN[version];
    var last = al.length - 1;
    for (var ai = 0; ai < al.length; ai++) {
      for (var aj = 0; aj < al.length; aj++) {
        if ((ai === 0 && aj === 0) || (ai === 0 && aj === last) || (ai === last && aj === 0)) continue;
        for (var ady = -2; ady <= 2; ady++) {
          for (var adx = -2; adx <= 2; adx++) {
            setFn(al[ai] + adx, al[aj] + ady, Math.max(Math.abs(adx), Math.abs(ady)) !== 1);
          }
        }
      }
    }
    /** @param {number} mask */
    function drawFormat(mask) {
      var data = (EC_FORMAT_BITS_M << 3) | mask;
      var rem = data;
      for (var q = 0; q < 10; q++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
      var fbits = ((data << 10) | rem) ^ 0x5412;
      for (var a = 0; a <= 5; a++) setFn(8, a, bit(fbits, a));
      setFn(8, 7, bit(fbits, 6));
      setFn(8, 8, bit(fbits, 7));
      setFn(7, 8, bit(fbits, 8));
      for (var b = 9; b < 15; b++) setFn(14 - b, 8, bit(fbits, b));
      for (var c = 0; c < 8; c++) setFn(size - 1 - c, 8, bit(fbits, c));
      for (var d2 = 8; d2 < 15; d2++) setFn(8, size - 15 + d2, bit(fbits, d2));
      setFn(8, size - 8, true);
    }
    drawFormat(0);
    if (version >= 7) {
      var vrem = version;
      for (var vq = 0; vq < 12; vq++) vrem = (vrem << 1) ^ ((vrem >>> 11) * 0x1f25);
      var vbits = (version << 12) | vrem;
      for (var vi = 0; vi < 18; vi++) {
        var vb = bit(vbits, vi);
        var va = size - 11 + (vi % 3);
        var vc = Math.floor(vi / 3);
        setFn(va, vc, vb);
        setFn(vc, va, vb);
      }
    }
    // Data
    var idx = 0;
    for (var right = size - 1; right >= 1; right -= 2) {
      if (right === 6) right = 5;
      for (var vert = 0; vert < size; vert++) {
        for (var jj = 0; jj < 2; jj++) {
          var x = right - jj;
          var upward = ((right + 1) & 2) === 0;
          var y = upward ? size - 1 - vert : vert;
          if (!fn[y][x] && idx < finalCw.length * 8) {
            mod[y][x] = bit(finalCw[idx >>> 3], 7 - (idx & 7));
            idx++;
          }
        }
      }
    }

    /** @param {number} mask @param {number} x @param {number} y */
    function maskBit(mask, x, y) {
      switch (mask) {
        case 0:
          return (x + y) % 2 === 0;
        case 1:
          return y % 2 === 0;
        case 2:
          return x % 3 === 0;
        case 3:
          return (x + y) % 3 === 0;
        case 4:
          return (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0;
        case 5:
          return ((x * y) % 2) + ((x * y) % 3) === 0;
        case 6:
          return (((x * y) % 2) + ((x * y) % 3)) % 2 === 0;
        default:
          return (((x + y) % 2) + ((x * y) % 3)) % 2 === 0;
      }
    }
    /** @param {number} mask */
    function applyMask(mask) {
      for (var yy = 0; yy < size; yy++) {
        for (var xx = 0; xx < size; xx++) {
          if (!fn[yy][xx] && maskBit(mask, xx, yy)) mod[yy][xx] = !mod[yy][xx];
        }
      }
    }
    function penalty() {
      var p = 0;
      var line, run, prev;
      for (var dir = 0; dir < 2; dir++) {
        for (var a = 0; a < size; a++) {
          run = 0;
          prev = null;
          line = [];
          for (var b = 0; b < size; b++) {
            var cell = dir === 0 ? mod[a][b] : mod[b][a];
            line.push(cell ? 1 : 0);
            if (cell === prev) {
              run++;
              if (run === 5) p += 3;
              else if (run > 5) p++;
            } else {
              run = 1;
              prev = cell;
            }
          }
          var s = line.join('');
          var re = /(?=(10111010000|00001011101))/g;
          var found = s.match(re);
          if (found) p += 40 * found.length;
        }
      }
      for (var yy = 0; yy < size - 1; yy++) {
        for (var xx = 0; xx < size - 1; xx++) {
          var c = mod[yy][xx];
          if (c === mod[yy][xx + 1] && c === mod[yy + 1][xx] && c === mod[yy + 1][xx + 1]) p += 3;
        }
      }
      var dark = 0;
      for (var y2 = 0; y2 < size; y2++) for (var x2 = 0; x2 < size; x2++) if (mod[y2][x2]) dark++;
      var k = Math.ceil(Math.abs(dark * 20 - size * size * 10) / (size * size)) - 1;
      p += Math.max(0, k) * 10;
      return p;
    }
    var bestMask = 0;
    var best = Infinity;
    for (var mk = 0; mk < 8; mk++) {
      applyMask(mk);
      drawFormat(mk);
      var pen = penalty();
      if (pen < best) {
        best = pen;
        bestMask = mk;
      }
      applyMask(mk);
    }
    applyMask(bestMask);
    drawFormat(bestMask);
    return { size: size, version: version, modules: mod };
  }

  /**
   * SVG-streng for teksten.
   * @param {string} text
   * @param {{margin?:number, dark?:string, light?:string, title?:string}} [opts]
   */
  function toSvg(text, opts) {
    var o = opts || {};
    var margin = o.margin == null ? 4 : o.margin;
    var qr = encode(text);
    var n = qr.size + margin * 2;
    var d = '';
    for (var y = 0; y < qr.size; y++) {
      for (var x = 0; x < qr.size; x++) {
        if (qr.modules[y][x]) d += 'M' + (x + margin) + ' ' + (y + margin) + 'h1v1h-1z';
      }
    }
    var title = o.title ? '<title>' + escapeXml(o.title) + '</title>' : '';
    return (
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' +
      n +
      ' ' +
      n +
      '" shape-rendering="crispEdges" role="img">' +
      title +
      '<rect width="100%" height="100%" fill="' +
      (o.light || '#fff') +
      '"/>' +
      '<path d="' +
      d +
      '" fill="' +
      (o.dark || '#000') +
      '"/></svg>'
    );
  }

  /** @param {string} s */
  function escapeXml(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] || c;
    });
  }

  return { encode: encode, toSvg: toSvg };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = ISQ_QR;
