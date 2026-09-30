# IMPLEMENTATION_PLAN – I-Squared Statsbygg

## 1. Kartlegging av eksisterende prosjekt

Mottatte filer:

| Fil | Innhold |
|---|---|
| `index.html` | Publikumsskjerm (prototype). Visninger: forside, påstand, QR (Menti-bilder), taler med timer, kryssforhør, leaderboard, video, svart skjerm, kort-flash. |
| `kontroll.html` | Kontrollpanel (desktop-layout). Visninger, videoer, debattrunde, timer, spillekort, manuell poengføring, nullstilling. |
| `kontroll_mappestruktur.html` | Byte-identisk med `kontroll.html`. |

Refererte assets (ikke mottatt, ligger lokalt på Mac-en):
`hero.jpg`, `Bilder/lagnord.jpg`, `Bilder/lagsør.jpg`, `Video/Introvideonord.mp4`, `Video/Introvideosør.mp4`,
`Video/ekstravideopåstand1–3.mp4`, `Assets/menti-*.png` (Menti-QR, utgår). `Music/` brukes ikke av prototypene.

### Det som fungerer og bevares
- Visuelt uttrykk: mørk marineblå bakgrunn med hero-overlay, Lag Nord cyan `#55c8ff`, Lag Sør rød/oransje `#ff654f`, gull `#ffd166`, stor fet typografi, taler-kort med lagbilde, kort-flash.
- Innhold: tittel, hovedspørsmål, tre påstander, fem spillekort, timerfarger (gul ≤ 30 s, rød pulserende ≤ 10 s).
- Funksjoner: hero, lagbilder, introvideoer, ekstravideoer, timer, påstander, kryssforhør med aktivt lag, sluttappell, spillekort, leaderboard, svart skjerm, lagret tilstand.

### Feil og begrensninger funnet
1. **Skjermene snakker ikke sammen.** `index.html` lytter på kanalen `isquared-v3` og nøkkelen `isquared-command-v3`, mens `kontroll.html` sender på `isquared-statsbygg` og `isquared-command`. Ingen kommandoer kommer fram.
2. **Visningsnavn stemmer ikke.** Kontroll sender `scoreboard`, `blackout` og `rules`; skjermen kjenner `leader` og `black`, og `rules` finnes ikke.
3. **Leaderboard-modellene er ulike.** Kontroll sender `scores/rounds`, skjermen leser `points/roundWinners/roundMoves` (prosentpoeng og ett vinnerpoeng) – i strid med ny scoringsmodell.
4. **To uavhengige nedtellinger** (én i hver fane) som driver fra hverandre; timeren teller ned én gang per sekund lokalt.
5. **Kun samme nettleser/maskin.** BroadcastChannel/localStorage krever samme profil – ubrukelig fra mobil.
6. **Avstemning i Menti** med statiske QR-bilder; ingen egen stemmelagring.
7. Monolittisk minifisert kode, ingen tilgangskontroll, ingen tester, desktop-layout på kontrollflaten.

## 2. Arkitekturvalg (avvik fra spesifikasjonen)

Arrangøren ønsker **Google Apps Script** (samme modell som golf-appen) i stedet for Next.js/Supabase/Vercel, og at **videoer ligger lokalt på Mac-en**.

| Spesifikasjon | Løsning |
|---|---|
| Next.js + Vercel | Apps Script nettapp (`doGet` + `google.script.run`), deploy med clasp eller kopiering |
| Supabase Postgres | Google-regneark (JSON-dokument for tilstand, egen fane for stemmer, egen fane for logg) + CacheService for raske lesinger |
| Supabase Realtime | Polling (skjerm/kontroll ~1 s, stemmeside ~8 s) med versjonsnummer. Timer regnes lokalt fra `startedAt` med klokke-korrigering mot server |
| RLS | Alle tilganger går gjennom serverfunksjoner. Offentlige metoder er hvitelistet; kontrollmetoder krever sesjonstoken fra PIN-innlogging |
| Supabase Auth | Admin-PIN i Script Properties, hashes ved første bruk, sesjonstoken i CacheService, sperre etter mislykkede forsøk |
| Zod | Egen liten valideringsmodul (Apps Script kan ikke laste npm-pakker uten bundler) |
| TypeScript | JavaScript med JSDoc, typekontrollert med `tsc --checkJs` |
| Vitest | `node:test` (innebygd) – samme dekning |
| Playwright | Playwright mot lokal dev-server som kjører samme motor med minnelagring |
| Publikumsskjerm på nett | **Lokal mappe på Mac-en** (`display/index.html` + media) som henter tilstand fra Apps Script. Reserveversjon uten video serveres også fra Apps Script |

## 3. Struktur

```
src/shared/   config, scoring, timer, validate, statemachine, qr, engine, memstore  (UMD: kjører i Apps Script, nettleser og Node)
src/gas/      Code.js (doGet, rpc, GasStore mot Sheets/Cache/Properties/Lock), appsscript.json
src/web/      control.*, vote.*, display.*, landing, felles transport
scripts/      build.mjs → dist/gas (clasp push) og dist/display (Mac-mappe)
dev/          server.mjs – lokal server som etterligner Apps Script
tests/        unit, integration, e2e (Playwright)
legacy/       originale prototyper
```

## 4. Rekkefølge
1. Delt kjerne med rene funksjoner og motor (engine) over et lagringsgrensesnitt.
2. Enhets- og integrasjonstester mot minnelagring.
3. Apps Script-adapter.
4. Frontend: publikumsskjerm, kontrollflate (mobil, faner), stemmeside.
5. Build, dev-server, Playwright-flyt.
6. Lint, typekontroll, tester, build – rett feil.
7. Dokumentasjon: README, OPERATØRGUIDE, SCORING, SECURITY.
