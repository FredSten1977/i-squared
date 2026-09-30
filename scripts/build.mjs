// Bygger leveransene:
//   docs/                      – nettstedet for GitHub Pages (stem/, kontroll/, admin/, skjerm/)
//   supabase/functions/isq/    – Edge Function med motoren (deployes til Supabase)
//   dist/display/              – mappen som legges på Mac-en (publikumsskjerm med lokale medier)
//
// Adresser og publiserbar nøkkel hentes fra site.config.json (ingen hemmeligheter).
import { readFileSync, writeFileSync, mkdirSync, rmSync, copyFileSync, chmodSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const web = join(root, 'src/web');
const shared = join(root, 'src/shared');
const dist = join(root, 'dist');

const SERVER_FILES = ['config.js', 'scoring.js', 'timer.js', 'validate.js', 'statemachine.js', 'engine.js'];

/** @param {string} p */
const read = (p) => readFileSync(p, 'utf8');

const site = JSON.parse(read(join(root, 'site.config.json')));
const SUPABASE_JS = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js';

/**
 * Setter inn CSS/JS og boot-blokk i en HTML-mal.
 * @param {string} file @param {{page:string, configPath:string}} v
 */
function assemble(file, v) {
  let html = read(join(web, file));
  html = html.replace(/<!--@css:([^>]+)-->/g, (_, f) => read(join(web, f.trim())));
  html = html.replace(/<!--@js:([^>]+)-->/g, (_, f) => {
    const src = read(resolve(web, f.trim()));
    if (/<\/script/i.test(src)) throw new Error(`${f} inneholder </script>`);
    return src;
  });
  const boot =
    `<script src="${v.configPath}"></script>\n` +
    `<script async src="${SUPABASE_JS}"></script>\n` +
    `<script>window.ISQ_BOOT = Object.assign({}, window.ISQ_CONFIG || {}, { page: ${JSON.stringify(v.page)}, poll: (function () { try { var p = new URLSearchParams(location.search).get('poll'); return p && /^[a-z0-9-]{1,20}$/.test(p) ? p : null; } catch (e) { return null; } })() });</script>`;
  if (!html.includes('<!--@boot-->')) throw new Error(`${file} mangler <!--@boot-->`);
  return html.replace('<!--@boot-->', boot);
}

rmSync(dist, { recursive: true, force: true });
mkdirSync(join(dist, 'display/media/images'), { recursive: true });
mkdirSync(join(dist, 'display/media/video'), { recursive: true });
mkdirSync(join(dist, 'display/media/music'), { recursive: true });

// ---- Nettsted (GitHub Pages) ----
const docs = join(root, 'docs');
rmSync(docs, { recursive: true, force: true });
const pages = [
  ['index.html', 'landing.html', 'home', 'config.js'],
  ['stem/index.html', 'vote.html', 'vote', '../config.js'],
  ['kontroll/index.html', 'control.html', 'control', '../config.js'],
  ['admin/index.html', 'control.html', 'admin', '../config.js'],
  ['skjerm/index.html', 'display.html', 'display', '../config.js']
];
for (const [out, src, page, configPath] of pages) {
  mkdirSync(dirname(join(docs, out)), { recursive: true });
  writeFileSync(join(docs, out), assemble(src, { page, configPath }));
}
writeFileSync(
  join(docs, 'config.js'),
  `// Offentlig konfigurasjon (publiserbar nøkkel – trygg i nettleseren). Generert fra site.config.json.
window.ISQ_CONFIG = ${JSON.stringify({ supabaseUrl: site.supabaseUrl, supabaseKey: site.supabaseKey, siteUrl: site.siteUrl || '' }, null, 2)};
`
);
writeFileSync(join(docs, '.nojekyll'), '');
copyFileSync(join(web, 'loadtest.html'), join(docs, 'belastningstest.html'));

// ---- Edge Function ----
const fnDir = join(root, 'supabase/functions/isq');
rmSync(fnDir, { recursive: true, force: true });
mkdirSync(fnDir, { recursive: true });
const banner = '// GENERERT FIL – rediger kildene i src/ og kjør «npm run build».\n';
const engineBundle =
  banner +
  '/* eslint-disable */\n' +
  SERVER_FILES.map((f) => `// ===== src/shared/${f} =====\n${read(join(shared, f))}`).join('\n') +
  '\nexport default ISQ_Engine;\n';
writeFileSync(join(fnDir, 'engine.mjs'), engineBundle);
for (const f of ['store.mjs', 'handler.mjs', 'rest-backend.mjs', 'index.ts']) writeFileSync(join(fnDir, f), banner + read(join(root, 'src/supabase', f)));

// ---- Lokal skjermmappe ----
writeFileSync(join(dist, 'display/index.html'), assemble('display.html', { page: 'display', configPath: 'config.js' }));
copyFileSync(join(web, 'loadtest.html'), join(dist, 'display/Belastningstest.html'));
writeFileSync(
  join(dist, 'display/config.js'),
  `// Konfigurasjon for publikumsskjermen på Mac-en.
// Adressene under peker til Supabase og nettstedet (GitHub Pages). Nøkkelen er publiserbar (trygg).
// Legg bilder, videoer og musikk i media-mappen med navnene under (eller endre stiene).
window.ISQ_CONFIG = {
  supabaseUrl: ${JSON.stringify(site.supabaseUrl)},
  supabaseKey: ${JSON.stringify(site.supabaseKey)},
  // Adressen publikum skal til (QR-koden peker til <siteUrl>stem/)
  siteUrl: ${JSON.stringify(site.siteUrl || '')},
  media: {
    hero: 'media/images/hero.jpg',
    north: 'media/images/lagnord.jpg',
    south: 'media/images/lagsør.jpg',
    videos: {
      introNorth: 'media/video/Introvideonord.mp4',
      introSouth: 'media/video/Introvideosør.mp4',
      extra1: 'media/video/ekstravideopåstand1.mp4',
      extra2: 'media/video/ekstravideopåstand2.mp4',
      extra3: 'media/video/ekstravideopåstand3.mp4'
    },
    music: {
      walkon: 'media/music/innmarsj.mp3',
      break: 'media/music/pause.mp3'
    },
    // Sang som spilles samtidig med en video. Sangen fades ned når videoen er ferdig.
    soundtracks: {
      introNorth: 'media/music/introlagnord.mp3',
      introSouth: 'media/music/introlagsør.mp3'
    },
    soundtrackFadeSeconds: 3,
    // false = videoens egen lyd dempes mens sangen spilles
    videoSoundWithSoundtrack: false
  }
};
`
);
writeFileSync(
  join(dist, 'display/media/LES_MEG.txt'),
  `Legg mediefilene her (kopier fra den gamle prosjektmappen – ingenting slettes):

  hero.jpg                    -> media/images/hero.jpg
  Bilder/lagnord.jpg          -> media/images/lagnord.jpg
  Bilder/lagsør.jpg           -> media/images/lagsør.jpg
  Video/Introvideonord.mp4    -> media/video/Introvideonord.mp4
  Video/Introvideosør.mp4     -> media/video/Introvideosør.mp4
  Video/ekstravideopåstand1-3 -> media/video/ekstravideopåstand1.mp4 (osv.)
  Music/*                     -> media/music/ (innmarsj.mp3, pause.mp3 – eller endre navn i config.js)

Mangler en fil, viser skjermen en reserve og kontrollflaten får beskjed under MEDIA.
`
);
const startScript = `#!/bin/bash
# Dobbeltklikk for å starte publikumsskjermen via en lokal webserver (reserve hvis Chrome/Safari blokkerer filen).
cd "$(dirname "$0")"
PORT=8765
( sleep 1; open -a "Google Chrome" "http://localhost:$PORT/index.html" || open "http://localhost:$PORT/index.html" ) &
echo "Publikumsskjerm: http://localhost:$PORT/index.html  (lukk dette vinduet for å stoppe)"
python3 -m http.server $PORT --bind 127.0.0.1
`;
writeFileSync(join(dist, 'display/Start publikumsskjerm.command'), startScript);
chmodSync(join(dist, 'display/Start publikumsskjerm.command'), 0o755);

console.log('Bygget docs/ (GitHub Pages), supabase/functions/isq/ (Edge Function) og dist/display/ (Mac-mappe).');
