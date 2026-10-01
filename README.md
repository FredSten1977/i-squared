# I-Squared Statsbygg

Nettbasert løsning for en levende I-Squared-debatt i Statsbygg: **Lag Nord mot Lag Sør**, med publikumsavstemning før og etter hver påstand, poeng for **netto flyttede stemmesteg**, spillekort, timer, video og leaderboard.

Løsningen har fire flater som brukes samtidig og kommuniserer over internett:

| Flate | Hvor | Adresse |
|---|---|---|
| **Publikumsskjerm** | Mac-en koblet til storskjerm, i Chrome i fullskjerm | Lokal mappe `display/index.html` (med lokale videoer). Reserve uten videoer: `<nettsted>/skjerm/` |
| **Kontrollflate** | Operatørens mobil på scenen | `<nettsted>/kontroll/` |
| **Publikumspoll** | Publikums mobiler via QR-kode | `<nettsted>/stem/` (låst til én påstand: `/stem/?poll=s1`) |
| **Administrasjon** | Mobil eller PC | `<nettsted>/admin/` (samme app, ADMIN-fanen) |
| Inngangsside | – | `<nettsted>/` |
| Belastningstest | PC | `<nettsted>/belastningstest.html` |
| Helsesjekk | – | `https://tzbnjvwfopsfngoevpft.supabase.co/functions/v1/isq` (GET) |

`<nettsted>` er GitHub Pages-adressen: **<https://fredsten1977.github.io/i-squared/>**.

---

## Innhold

1. [Arkitektur](#1-arkitektur)
2. [Kom i gang (deploy)](#2-kom-i-gang-deploy)
3. [Publikumsskjermen på Mac-en](#3-publikumsskjermen-på-mac-en)
4. [Administrator-PIN](#4-administrator-pin)
5. [Datamodell](#5-datamodell)
6. [Lokal utvikling og tester](#6-lokal-utvikling-og-tester)
7. [Oppdatere løsningen](#7-oppdatere-løsningen)
8. [Seed-data og demo-modus](#8-seed-data-og-demo-modus)
9. [Produksjonssjekkliste](#9-produksjonssjekkliste)
10. [Kapasitet og kjente begrensninger](#10-kapasitet-og-kjente-begrensninger)

Se også [OPERATØRGUIDE.md](OPERATØRGUIDE.md), [SCORING.md](SCORING.md) og [SECURITY.md](SECURITY.md).

---

## 1. Arkitektur

```
 Publikum (mobil)                Operatør (mobil)              Mac + storskjerm
 <nettsted>/stem/                <nettsted>/kontroll/          display/index.html (lokal mappe)
   │ les stemmekatalog (REST)      │ handlinger + tilstand         │ tilstand + «video ferdig»
   │ stem: isq_cast_vote (RPC)     │                               │ lokale bilder, videoer, musikk
   │ sanntid: isq_live             │ sanntid: isq_tick             │ sanntid: isq_tick
   └───────────────┬───────────────┴──────────────┬────────────────┘
                   ▼                              ▼
   ┌───────────────────────────────┐   ┌──────────────────────────────────────┐
   │ Postgres (Supabase)           │◀──│ Edge Function «isq» (Deno)           │
   │  isq_votes  – stemmer (hash)  │   │  samme motor som før (src/shared)    │
   │  isq_live   – stemmekatalog   │   │  1 kall: isq_snapshot → motor →      │
   │  isq_tick   – endringsteller  │   │  1 kall: isq_commit (én transaksjon) │
   │  isq_doc    – arrangementet   │   │  egen PIN-innlogging og sesjoner     │
   │  isq_kv / isq_log / isq_secret│   └──────────────────────────────────────┘
   └───────────────────────────────┘
          Realtime sender endringer i isq_live og isq_tick til alle flater
```

**Kjerneprinsipper**

- **Én motor.** All forretningslogikk ligger i `src/shared/` (samme kode som i Apps Script-versjonen). Den kjører i Edge Function, i nettleseren (timer, QR, konfigurasjon) og i Node (tester og dev-server).
- **Stemmer går rett i databasen.** Publikum snakker aldri med Edge Function. `isq_cast_vote` validerer, hasher tokenet med HMAC og gjør en upsert på `(poll_id, voter_hash)`. Det tåler hundrevis av samtidige stemmer.
- **Ingen stemmer går tapt når en avstemning lukkes.** Før resultatet beregnes, stenges avstemningen i katalogen (`isq_freeze`). Den venter på stemmer som er på vei (radlås), og først da leses opptellingen.
- **Samtidige trykk** fra flere kontrollflater håndteres med optimistisk låsing: dokumentet lagres bare hvis versjonen er uendret, ellers kjøres handlingen på nytt (testet).
- **Sanntid.** Skjerm og kontrollflate lytter på `isq_tick` (endres ved hver handling og stemme) og henter ny tilstand straks. Mobilene lytter på `isq_live`, som bare endres når en avstemning åpnes eller lukkes. Alle flater poller i tillegg som reserve (skjerm 1–1,5 s, kontroll 1,5–3 s, mobil 3–15 s).
- **Timeren sendes ikke hvert sekund.** Serveren lagrer start og varighet; klientene regner ut resten lokalt, korrigert for klokkeforskjell.
- **Frakobling tåles.** Skjermen beholder siste visning, viser et diskret «Frakoblet»-merke og synkroniserer ved neste svar.

**Mappestruktur**

```
src/shared/        config.js · scoring.js · timer.js · validate.js · statemachine.js · qr.js · engine.js
src/supabase/      store.mjs (snapshot-lagring) · handler.mjs (kjøring, freeze, nye forsøk)
                   rest-backend.mjs (PostgREST) · memory-backend.mjs (etterligning for tester) · index.ts
src/web/           client.js (Supabase-transport, sanntid, klokke) · display.* · control.* · vote.* · landing.html · loadtest.html
supabase/          migrations/ (databasen) · functions/isq/ (GENERERT – Edge Function)
docs/              GENERERT – nettstedet for GitHub Pages
scripts/build.mjs  bygger docs/, supabase/functions/isq/ og dist/display/ (Mac-mappe)
site.config.json   Supabase-adresse, publiserbar nøkkel og nettstedsadresse (ingen hemmeligheter)
dev/server.mjs     lokal etterligning av Supabase + GitHub Pages
tests/             unit/ · integration/ (motor, kjøreplan, Supabase-backend) · e2e/ (Playwright)
legacy/            opprinnelige prototyper og Apps Script-versjonen
```

## 2. Kom i gang (deploy)

Supabase-prosjektet **i-squared-statsbygg** (region Stockholm, organisasjon «Fred Privat») er allerede opprettet, databasen er migrert og Edge Function `isq` er deployet. Det som gjenstår for deg:

### A. Sett administrator-PIN

Supabase → prosjektet → **SQL Editor** → kjør (bytt ut med din egen PIN, minst 6 tegn):

```sql
select public.isq_set_admin_pin('din-hemmelige-pin');
```

Dette lagrer bare en HMAC av PIN-en og logger ut alle eksisterende innlogginger.

### B. Slå på GitHub Pages

GitHub Pages på gratiskonto krever at repoet er **offentlig**. Repoet inneholder ingen hemmeligheter (bare publiserbar nøkkel og adresser).

1. GitHub → repoet **i-squared** → **Settings → General → Danger Zone → Change visibility → Public**.
2. **Settings → Pages** → *Source:* **Deploy from a branch** → *Branch:* **main** og mappe **/docs** → **Save**.
3. Etter 1–2 minutter ligger nettstedet på <https://fredsten1977.github.io/i-squared/>.

Vil du heller ha repoet privat, kan `docs/` legges på Netlify eller Vercel (dra mappen inn) – oppdater da `siteUrl` i `site.config.json` og kjør `npm run build`.

### C. Test

1. Åpne `<nettsted>/kontroll/` og logg inn med PIN-en.
2. Åpne `<nettsted>/stem/` på en mobil. ADMIN → åpne en avstemning → stem → tallet skal øke på kontrollflaten med en gang.
3. Kjør gjerne `<nettsted>/belastningstest.html` med 100 stemmer (se [kapittel 10](#10-kapasitet-og-kjente-begrensninger)). Nullstill arrangementet etterpå.

## 3. Publikumsskjermen på Mac-en

1. Mappen `dist/display/` er skjermmappen. `config.js` peker allerede til Supabase og nettstedet (`siteUrl`, som QR-koden bruker).
2. Mediefiler i `media/` (uendret fra før): `images/hero.jpg`, `images/lagnord.jpg`, `images/lagsør.jpg`, `video/introdebatt.mp4` (debattintro med innbakt sang), `video/Introvideonord.mp4`, `video/Introvideosør.mp4`, `video/ekstravideopåstand1-3.mp4`, `music/introlagnord.mp3`, `music/introlagsør.mp3`, valgfritt `music/innmarsj.mp3` og `pause.mp3`.
3. Åpne `index.html` i **Google Chrome** og trykk **Start publikumsskjerm** (F = fullskjerm).
4. Kontrollflaten viser under **MEDIA** om skjermen er tilkoblet og hvilke filer som mangler.

Blokkerer nettleseren kall fra en lokal fil: dobbeltklikk **`Start publikumsskjerm.command`**, som åpner skjermen via `http://localhost:8765`.

**Sang til video:** `soundtracks` i `config.js` angir en sang per video. Sangen fades ned over `soundtrackFadeSeconds` når videoen er ferdig. **Påstanden vises 5 sekunder** før ekstravideo 2 og 3 (`statementBeforeVideoSeconds`).

**Videoer fra iPhone (.MOV, HEVC/HDR)** bør konverteres til H.264 .mp4 med tonemapping:

```bash
ffmpeg -i film.MOV -map 0:v:0 -map 0:a:0 -vf "zscale=t=linear:npl=203,format=gbrpf32le,zscale=p=bt709,tonemap=hable:desat=0,zscale=t=bt709:m=bt709:r=tv,format=yuv420p" -c:v libx264 -crf 20 -c:a aac -movflags +faststart film.mp4
```

## 4. Administrator-PIN

- Sett/bytt: `select public.isq_set_admin_pin('ny-pin');` i SQL Editor. Alle innlogginger avsluttes.
- Innlogging gjelder i 6 timer uten aktivitet og maks 24 timer. «Logg ut» ligger under ADMIN.
- Etter 10 innloggingsforsøk på 10 minutter sperres nye innlogginger i 10 minutter.

## 5. Datamodell

| Tabell | Innhold | Tilgang for publikum |
|---|---|---|
| `isq_doc` | Arrangementsdokumentet (JSON): arrangement, lag, påstander, avstemninger, tilstand, timer, kort, resultater. `ver` = dokumentversjon. | Ingen |
| `isq_votes` | `poll_id`, `voter_hash` (HMAC, aldri token), `choice`, `demo`, tidspunkter. Primærnøkkel `(poll_id, voter_hash)`. | Bare via `isq_cast_vote` |
| `isq_live` | Stemmekatalog: tekst, svaralternativer og status per avstemning. Ingen opptelling. | Lese |
| `isq_tick` | Endringsteller (`ver`, `cver`) for sanntidsvarsler. | Lese |
| `isq_kv` | PIN-hash, sesjoner (hash), begrensninger, skjermstatus. | Ingen |
| `isq_log` | Revisjonslogg for administrative handlinger. | Ingen |
| `isq_secret` | Hemmelig salt for HMAC. | Ingen |
| `isq_rapport_stemmer` (view) | Stemmer per avstemning (mot/nøytral/for/totalt/demo). | Ingen |

Databasefunksjoner: `isq_cast_vote` (publikum), `isq_snapshot`, `isq_commit`, `isq_freeze` (bare Edge Function via service role), `isq_set_admin_pin` (bare SQL Editor). Se `supabase/migrations/`.

**Migrering av dokumentet:** `schemaVersion` + `ensureDoc()` fyller inn nye felt automatisk.

**Rapport:** Table Editor → `isq_rapport_stemmer`, og kontrollflatens RESULTAT-fane. Alt kan eksporteres som CSV fra Table Editor.

## 6. Lokal utvikling og tester

Krav: Node.js 20 eller nyere.

```bash
npm install
npm run dev        # bygger og starter http://127.0.0.1:8787 (PIN 123456)
```

Dev-serveren etterligner Supabase (Edge Function, REST og stemmefunksjonen) med samme motor og minnelagring: `/kontroll/`, `/stem/`, `/screen/` (Mac-mappen), `/skjerm/`.

| Kommando | Hva |
|---|---|
| `npm run build` | Bygger `docs/`, `supabase/functions/isq/` og `dist/display/` |
| `npm test` | Enhets- og integrasjonstester (motor, kjøreplan steg 1–22, Supabase-backend med samtidighet) |
| `npm run test:e2e` | Playwright: hele innslaget med mobil kontroll, storskjerm og tre velgere |
| `npm run lint` / `npm run typecheck` | ESLint / TypeScript-kontroll |
| `npm run check` | Alt over |

`ISQ_ENGINE_MODULE=<sti til engine.mjs> node --test tests/integration/supabase.test.mjs` tester en ferdig samlet motor (den som deployes).

## 7. Oppdatere løsningen

- **Sider (kontroll/stem):** endre i `src/web/`, kjør `npm run build`, commit og push. GitHub Pages oppdateres på 1–2 minutter.
- **Motor (Edge Function):** `npm run build` og deretter `supabase functions deploy isq --no-verify-jwt` (Supabase CLI), eller be Claude deploye. Funksjonen har egen PIN-innlogging, derfor er JWT-sjekk slått av.
- **Database:** nye filer i `supabase/migrations/` og `supabase db push`.
- **Mac-mappen:** kopier `dist/display/index.html` og `config.js` til Mac-en. Mediefilene røres ikke.

## 8. Seed-data og demo-modus

Seed-dataene ligger i `src/shared/config.js` og lastes første gang: forsidetittel «I-Squared», hovedspørsmålet med POWERPOINT / USIKKER / MODERNISERING, Lag Nord (`#55c8ff`) og Lag Sør (`#ff654f`), tre påstander (Nord MOT og Sør FOR på alle tre – kan endres i ADMIN), timer 3:00 / 4:00 / 1:00.

**Demo-modus** (ADMIN): genererer merkede eksempelstemmer. «Slett alle demodata» fjerner dem. **«Nullstill hele arrangementet»** sletter alle stemmer, resultater og kortbruk (påstander og innstillinger beholdes) og gir hver avstemning ny økt-ID, så publikums mobiler glemmer gamle valg.

## 9. Produksjonssjekkliste

- [ ] `npm run check` er grønn.
- [ ] Helsesjekken (`…/functions/v1/isq`) svarer `"ok":true`.
- [ ] PIN er satt med `isq_set_admin_pin` og testet fra operatørens mobil.
- [ ] GitHub Pages er på, og `<nettsted>/stem/` åpner på iPhone og Android – både på lokalets nett og mobilnett.
- [ ] Påstander, lagposisjoner og svaralternativer er kontrollert i ADMIN.
- [ ] Mac-mappen har alle mediefiler; MEDIA-fanen viser «Tilkoblet» og ingen manglende filer.
- [ ] Belastningstest med 100 stemmer er grønn.
- [ ] Generalprøve, deretter **Slett alle demodata** og **Nullstill hele arrangementet**.
- [ ] Reserve: mobilhotspot til Mac-en, ladet operatørmobil, operatørguiden og moderatorkortene.
- [ ] Etter arrangementet: eksporter `isq_rapport_stemmer` og vurder å slette stemmene (SECURITY.md).

## 10. Kapasitet og kjente begrensninger

- **Kapasitet:** én stemme er ett databasekall på noen få millisekunder. 100–300 samtidige stemmer er uproblematisk. Supabase gratisplan tillater 200 samtidige sanntidstilkoblinger; kommer det flere, bruker de overskytende mobilene vanlig polling (3–5 s) og virker like fullt.
- **Gratisplanen pauser prosjekter** etter 7 dager uten aktivitet. Åpne kontrollflaten eller helsesjekken dagen før arrangementet, eller trykk «Restore» i Supabase hvis prosjektet er pauset.
- **Første kall etter en pause** i Edge Function kan ta ca. 1 sekund (kaldstart); deretter typisk 100–300 ms.
- **Dobbeltstemming** begrenses per nettleser (anonym token). Se SECURITY.md.
- **Videoer** spilles bare fra Mac-mappen. Nettversjonen av skjermen viser reservevisning for video.
- **Rapport til regneark** finnes ikke lenger; bruk Table Editor/CSV i Supabase.
