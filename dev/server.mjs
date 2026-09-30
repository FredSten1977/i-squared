// Lokal dev-server som etterligner Supabase + GitHub Pages.
//   /, /stem/, /kontroll/, /admin/, /skjerm/   – nettstedet (docs/), med config.js som peker hit
//   /screen/                                     – den lokale skjermmappen (dist/display)
//   POST /functions/v1/isq                       – Edge Function (motoren)
//   GET  /rest/v1/isq_live                       – stemmekatalogen
//   POST /rest/v1/rpc/isq_cast_vote              – stemmegivning
// Sanntid (Realtime) etterlignes ikke; sidene faller da tilbake på polling.
//
// Bruk: npm run dev   (PIN: ISQ_ADMIN_PIN, standard 123456 – kun lokalt)
import http from 'node:http';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { join, resolve, dirname, extname, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { createHandler } from '../src/supabase/handler.mjs';
import { createMemoryBackend } from '../src/supabase/memory-backend.mjs';

const require = createRequire(import.meta.url);
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const Engine = require(join(root, 'src/shared/engine.js'));

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.txt': 'text/plain; charset=utf-8'
};

/**
 * @param {{port?: number, adminPin?: string, quiet?: boolean}} [opts]
 */
export function startDevServer(opts = {}) {
  const pin = opts.adminPin || process.env.ISQ_ADMIN_PIN || '123456';
  const backend = createMemoryBackend();
  backend.setAdminPin(pin);
  const handler = createHandler({ Engine, backend });

  /** @param {http.ServerResponse} res @param {number} code @param {string} type @param {string|Buffer} body */
  function send(res, code, type, body) {
    res.writeHead(code, {
      'Content-Type': type,
      'Cache-Control': 'no-store',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
    });
    res.end(body);
  }

  /** @param {http.IncomingMessage} req @returns {Promise<any>} */
  function body(req) {
    return new Promise((resolveP) => {
      let s = '';
      req.on('data', (c) => (s += c));
      req.on('end', () => {
        try {
          resolveP(JSON.parse(s || '{}'));
        } catch {
          resolveP({});
        }
      });
    });
  }

  /** @param {string} base */
  const configJs = (base, extra = '') =>
    `window.ISQ_CONFIG = Object.assign(window.ISQ_CONFIG || {}, { supabaseUrl: '${base}', supabaseKey: 'dev-key', siteUrl: '${base}/' ${extra} });`;

  /** @param {http.ServerResponse} res @param {string} dir @param {string} rel */
  function serveFile(res, dir, rel) {
    let file = normalize(join(dir, rel));
    if (!file.startsWith(dir)) return send(res, 404, 'text/plain', 'Ikke funnet');
    if (existsSync(file) && statSync(file).isDirectory()) file = join(file, 'index.html');
    if (!existsSync(file)) return send(res, 404, 'text/plain; charset=utf-8', 'Ikke funnet');
    return send(res, 200, MIME[extname(file)] || 'application/octet-stream', readFileSync(file));
  }

  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url || '/', `http://${req.headers.host}`);
      const base = `http://${req.headers.host}`;
      const path = decodeURIComponent(url.pathname);
      if (req.method === 'OPTIONS') return send(res, 204, 'text/plain', '');

      if (path === '/functions/v1/isq') {
        if (req.method === 'GET') return send(res, 200, 'application/json', JSON.stringify(await handler.handle('health', {})));
        const msg = await body(req);
        const r = await handler.handle(String(msg.method || ''), msg.payload || {});
        return send(res, 200, 'application/json', JSON.stringify(r));
      }
      if (path === '/rest/v1/isq_live') return send(res, 200, 'application/json', JSON.stringify([{ data: backend.getLive() }]));
      if (path === '/rest/v1/rpc/isq_cast_vote' && req.method === 'POST') {
        const a = await body(req);
        const r = await backend.castVote({ token: a.p_token, pollId: a.p_poll_id, choice: a.p_choice });
        return send(res, 200, 'application/json', JSON.stringify(r));
      }

      // Lokal skjermmappe (som på Mac-en)
      if (path === '/screen' || path.startsWith('/screen/')) {
        const rel = path.replace(/^\/screen\/?/, '') || 'index.html';
        if (rel === 'config.js') {
          // Behold medieoppsettet fra den ekte config.js, men pek til dev-serveren
          const real = existsSync(join(root, 'dist/display/config.js')) ? readFileSync(join(root, 'dist/display/config.js'), 'utf8') : '';
          return send(res, 200, MIME['.js'], real + '\n' + configJs(base));
        }
        return serveFile(res, join(root, 'dist/display'), rel);
      }

      // Nettstedet (GitHub Pages)
      if (path === '/config.js') return send(res, 200, MIME['.js'], configJs(base));
      if (!existsSync(join(root, 'docs/index.html'))) return send(res, 500, 'text/plain; charset=utf-8', 'Kjør «npm run build» først.');
      return serveFile(res, join(root, 'docs'), path.replace(/^\/+/, ''));
    } catch (e) {
      send(res, 500, 'text/plain; charset=utf-8', String(e && /** @type {any} */ (e).message ? /** @type {any} */ (e).message : e));
    }
  });

  return new Promise((resolveP) => {
    server.listen(opts.port ?? Number(process.env.PORT || 8787), '127.0.0.1', () => {
      const addr = /** @type {import('node:net').AddressInfo} */ (server.address());
      const url = `http://127.0.0.1:${addr.port}`;
      if (!opts.quiet) {
        console.log(`I-Squared dev-server: ${url}`);
        console.log(`  Kontroll:  ${url}/kontroll/   (PIN ${pin})`);
        console.log(`  Stem:      ${url}/stem/`);
        console.log(`  Skjerm:    ${url}/screen/   (lokal skjermmappe)  eller ${url}/skjerm/`);
      }
      resolveP({
        server,
        base: url,
        backend,
        handler,
        /** @param {string} method @param {any} payload */
        rpc: (method, payload) => handler.handle(method, payload),
        close: () => new Promise((r) => server.close(() => r(undefined)))
      });
    });
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  startDevServer();
}
