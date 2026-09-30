# Sikkerhet og personvern

## Oversikt

| Område | Tiltak |
|---|---|
| Driftsmiljø | Supabase (Postgres + Edge Function) i EU (Stockholm), nettsted på GitHub Pages. Alt over HTTPS. |
| Autentisering | Administrator-PIN (lagret som HMAC i databasen) → sesjonstoken med utløp. |
| Tilgangskontroll | Row Level Security på alle tabeller. Publikum kan bare lese stemmekatalogen og endringstelleren, og stemme via én databasefunksjon. |
| Hemmeligheter | Service role-nøkkelen finnes bare i Edge Function (miljøvariabel hos Supabase). I nettleseren brukes bare den **publiserbare** nøkkelen. Ingen hemmeligheter i repoet. |
| Publikum | Anonym voter-token i nettleseren, HMAC-hashet med hemmelig salt i databasen. |
| Misbruk | Validering av all inndata, innloggingssperre, idempotente stemmer (én per nettleser per avstemning). |
| Sporbarhet | Revisjonslogg for administrative handlinger uten publikumsdata. |

## Autentisering

- Kontrollflaten og ADMIN krever **administrator-PIN**. Den settes i Supabase SQL Editor med `select public.isq_set_admin_pin('…');` (minst 6 tegn). Bare **HMAC-SHA256(salt, PIN)** lagres (`isq_kv.ADMIN_PIN_HASH`). Funksjonen kan ikke kalles fra nettleseren.
- Sammenligning skjer i konstant tid.
- Vellykket innlogging gir et tilfeldig **sesjonstoken** (to UUID v4). Token lagres i localStorage på operatørens enhet; databasen har bare en hash av det.
- Sesjonen utløper etter **6 timer uten aktivitet** og senest etter **24 timer**. «Logg ut» sletter sesjonen. Ny PIN logger ut alle.
- **Innloggingssperre:** maks 10 forsøk per 10 minutter. Eksisterende sesjoner påvirkes ikke.

## Tilgangskontroll

**Database (RLS):**

| Tabell/funksjon | anon (nettleser) | Edge Function (service role) |
|---|---|---|
| `isq_live` (stemmekatalog, ingen opptelling) | lese | lese/skrive |
| `isq_tick` (endringsteller) | lese | lese/skrive |
| `isq_doc`, `isq_votes`, `isq_kv`, `isq_log`, `isq_secret` | ingen | via funksjonene under |
| `isq_cast_vote(token, poll, valg)` | kjøre | – |
| `isq_snapshot`, `isq_commit`, `isq_freeze` | ingen | kjøre |
| `isq_set_admin_pin`, `isq_hmac` | ingen | – / kjøre |

`isq_cast_vote` er `security definer` med fast `search_path`, validerer token, avstemnings-ID og valg, og godtar bare stemmer til en avstemning med status **open** i katalogen.

**Edge Function «isq»** har egen innlogging (PIN → sesjon), derfor er Supabase sin JWT-sjekk slått av for denne funksjonen. Den tillater bare disse metodene:

| Metode | Hvem | Kan |
|---|---|---|
| `public.state` | Alle (skjerm) | Lese visning, påstander, lagnavn, timer, kortstatus, antall stemmer, godkjente resultater og leaderboard. Fordeling bare når operatøren har valgt å vise den. |
| `public.videoEnded` | Alle (skjerm) | Melde at en video er ferdig – krever engangsnøkkelen for videoen som spilles nå. |
| `public.displayPing` | Alle (skjerm) | Melde at skjermen er tilkoblet og hvilke mediefiler som mangler. |
| `auth.login` / `auth.logout` | Alle | Logge inn med PIN / ut. |
| `control.state`, `control.action` | Kun innlogget | Alt annet: avstemninger, visninger, timer, kort, resultater, oppsett, demo, nullstilling. |

Kritiske handlinger (nullstille avstemning, slette demodata, overstyre resultat, nullstille arrangement) krever `confirm: true` fra serverens side i tillegg til bekreftelsen i grensesnittet. All inndata valideres med skjemaer (`src/shared/validate.js`).

## Anonym voter-token og hashing

1. Første gang stemmesiden åpnes, lager nettleseren en tilfeldig token på 192 bit og lagrer den i localStorage. Ingen navn, e-post eller innlogging.
2. Databasen lagrer bare **`HMAC-SHA256(salt, "voter:" + token)`**. Saltet ligger i `isq_secret`, som ingen utenfor databasen kan lese.
3. Maks **én stemme per hash per avstemning** (primærnøkkel `(poll_id, voter_hash)`). Ny stemme oppdaterer raden. Samme valg to ganger gir «uendret».
4. Token og hash returneres aldri til nettleseren.
5. Når en avstemning lukkes, stenges den først i katalogen med radlås, slik at stemmer som er på vei enten telles med eller avvises tydelig – aldri telles «halvt».

## Personvern

- Det samles **ikke** inn navn, e-post eller andre direkte personopplysninger. Supabase kan logge IP-adresser i sine tekniske logger (kortvarig); løsningen lagrer dem ikke.
- Lagret per stemme: avstemnings-ID, voter-hash, valg, demo-flagg og tidspunkt.
- **Anbefalt sletting** etter arrangementet: eksporter `isq_rapport_stemmer`, og kjør `delete from isq_votes;` i SQL Editor (eller ADMIN → Nullstill hele arrangementet), eventuelt slett hele Supabase-prosjektet.

## Logging

- **Revisjonslogg** (`isq_log`): tidspunkt, aktør (`admin:` + 6 tegn av sesjonen), handling og parametere. Inneholder **ikke** PIN, sesjonstoken, voter-token, voter-hash eller enkeltstemmer.
- Edge Function-logger og databaselogger ligger i Supabase-dashbordet, synlig bare for prosjekteieren.

## Kjente begrensninger

- **Dobbeltstemming kan ikke hindres helt uten innlogging.** Flere enheter, private vinduer eller tømte nettleserdata gir nye stemmer.
- **PIN er en delt hemmelighet.** Bytt PIN etter arrangementet.
- **Offentlig lesetilstand:** alle som kjenner adressen, kan lese det storskjermen viser. Dette er bevisst.
- **Ingen rate limiting per velger i databasen.** Stemmer er idempotente per token, men en teknisk kyndig person kan lage mange tokens. Det samme gjaldt i Apps Script-versjonen; mot et fysisk publikum er risikoen lav.
