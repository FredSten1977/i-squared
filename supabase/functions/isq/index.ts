// GENERERT FIL – rediger kildene i src/ og kjør «npm run build».
// I-Squared Statsbygg – Supabase Edge Function «isq».
// GENERERT MAPPE: rediger kildene i src/ og kjør «npm run build».
//
// POST {method, payload}  → {ok, data} | {ok:false, error, code}
// GET  ?health            → helsesjekk
//
// Funksjonen har egen innlogging (administrator-PIN → sesjon), så JWT-sjekk er slått av.
// Service role-nøkkelen finnes bare her på serveren, aldri i nettleseren.
import Engine from './engine.mjs';
import { createHandler } from './handler.mjs';
import { createRestBackend } from './rest-backend.mjs';

const url = Deno.env.get('SUPABASE_URL') ?? '';
const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const handler = createHandler({ Engine, backend: createRestBackend(url, key) });

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
  'Access-Control-Max-Age': '86400'
};

const json = (body: unknown) => new Response(JSON.stringify(body), { headers: { ...CORS, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method === 'GET') return json(await handler.handle('health', {}));
  let msg: { method?: unknown; payload?: unknown } = {};
  try {
    const text = await req.text();
    if (text.length > 100000) return json({ ok: false, code: 'VALIDATION', error: 'For stor forespørsel.' });
    msg = JSON.parse(text || '{}');
  } catch {
    return json({ ok: false, code: 'VALIDATION', error: 'Ugyldig forespørsel.' });
  }
  return json(await handler.handle(String(msg.method ?? ''), msg.payload ?? {}));
});
