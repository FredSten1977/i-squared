# Operatørguide – I-Squared Statsbygg

Denne guiden er for den som styrer arrangementet fra mobilen på scenen og den som setter opp Mac-en med storskjermen.

## 1. Før arrangementet (dagen før eller tidlig)

1. **Mac-en**
   - Koble Mac-en til storskjermen/prosjektoren. Velg **Systeminnstillinger → Skjermer** og sett storskjermen som eget skjermbilde (ikke speiling), eller speil hvis du bare har én skjerm.
   - Koble lyd fra Mac-en til lydanlegget.
   - Slå av varsler: **Fokus → Ikke forstyrr**. Slå av dvale: **Systeminnstillinger → Lås skjerm → Aldri** mens arrangementet pågår.
2. **Skjermmappen** (se README kapittel 10) skal ligge på Mac-en med riktig `config.js` og alle mediefiler.
3. **Operatørmobilen** skal være ladet og ha lysstyrke høy. Legg kontrollflaten til på hjemskjermen: åpne <https://fredsten1977.github.io/i-squared/kontroll/> → Del → «Legg til på Hjem-skjerm» (iPhone) eller ⋮ → «Legg til på startskjermen» (Android).
4. **Supabase-prosjektet må være aktivt.** Gratisplanen pauser prosjekter etter 7 dager uten bruk. Åpne kontrollflaten dagen før; får du feil, gå til supabase.com → prosjektet → **Restore**.
5. Gjør en **generalprøve** med demo-modus (ADMIN → Demo-modus). Slett demodata og **nullstill arrangementet** etterpå.

## 2. Åpne publikumsskjermen på Mac

1. Åpne skjermmappen og høyreklikk `index.html` → **Åpne med → Google Chrome**.
2. Dra Chrome-vinduet over på storskjermen.
3. Klikk **Start publikumsskjerm**. Dette slår på lyd og går til fullskjerm.
4. **Fullskjerm:** trykk **F** i skjermvinduet (eller ⌃⌘F). **Esc** går ut av fullskjerm.
5. På mobilen: fanen **MEDIA** skal vise «Tilkoblet» og ingen manglende filer.

Hvis siden ikke får kontakt (rødt merke «Frakoblet» nederst til høyre): sjekk nettet, sjekk `supabaseUrl` i `config.js`, eller dobbeltklikk `Start publikumsskjerm.command` i mappen.

## 3. Kontrollflaten på mobil

Logg inn med administrator-PIN. Øverst ser du alltid:

| Felt | Betydning |
|---|---|
| Tilkoblet / Frakoblet | Kontakt mellom mobilen og serveren |
| SKJERM | Hva publikumsskjermen viser nå |
| PÅSTAND | Aktiv påstand |
| TIMER | Gjenværende tid, og om den går eller er på pause |
| AVSTEMNING | Aktiv avstemning og status |
| STEMMER | Antall stemmer mottatt i aktiv avstemning (sanntid) |
| NORD – SØR | Foreløpig totalscore (flyttede stemmer) |

Fanene nederst: **PLAN** (kjøreplan), **AVSTEM** (avstemning), **TIMER**, **KORT** (spillekort), **RESULTAT**, **MEDIA**, **ADMIN**.

Vanlige scenehandlinger skjer med ett trykk. Kritiske handlinger (nullstille avstemning, slette stemmer, overstyre resultat, nullstille arrangement, bytte arrangement-ID) krever bekreftelse.

### NESTE-knappen og manuell overstyring

Øverst i **PLAN** står **Sist utført**, **Neste** og en stor **NESTE ▶︎**-knapp. Kjøreplanen er fast (se under), og ett trykk utfører neste steg.

Du kan når som helst **overstyre manuelt**:

- Alle knappene under NESTE (Start, Påstand n, Avslutning, Annet) virker uavhengig av kjøreplanen.
- Trykker du en knapp som tilsvarer et steg i kjøreplanen, flytter NESTE seg dit og fortsetter derfra. Eksempel: trykker du manuelt «Kryssforhør Sør», er neste steg «Tilbake til påstand».
- Knapper som ikke er i kjøreplanen (svart skjerm, leaderboard, spillekort), flytter ikke NESTE.
- **Hele kjøreplanen** (sammenleggbar liste) viser alle 57 stegene. Trykk på et steg for å hoppe dit og utføre det.
- Under en debattdel vises også en stor **Tilbake til påstand**-knapp.

## 4. Kjøreplan

| Steg | NESTE gjør | Storskjerm |
|---|---|---|
| 1 | Forside | «I-Squared», Lag Nord mot Lag Sør, hero.jpg som bakgrunn |
| 2 | Vis hovedspørsmål | Hovedspørsmålet i stor tekst |
| 3 | Åpne avstemning: hovedspørsmål | QR-kode og antall stemmer |
| 4 | Lukk avstemning | **Rett til debattreglene** (format, taletider og spillekort) |
| 5 | Debattintro | «Velkommen til I-Squared» i fullskjerm med sangen innbakt i videoen, deretter **tilbake til debattreglene** |
| 6 | Introvideo Lag Nord | Video i fullskjerm med Lag Nords sang. Sangen fades ned de siste 3 sekundene av videoen, og skjermen går **tilbake til debattreglene** |
| 7 | Introvideo Lag Sør | Video i fullskjerm med Lag Sørs sang (fades ned), **deretter påstand 1** |
| 8 | Ekstravideo påstand 1 | Video, **tilbake til påstand 1** |
| 9 | Åpne før-avstemning påstand 1 | QR-kode |
| 10 | Lukk før-avstemning | **Tilbake til påstand 1** |
| 11 | Åpningsinnlegg Lag Nord (3:00) | Timeren **fortsetter i minus** (rød, «−00:12») til du trykker NESTE = Tilbake til påstand |
| 12 | Åpningsinnlegg Lag Sør (3:00) | Som over. NESTE = Tilbake til påstand |
| 13 | Kryssforhør Lag Nord (4:00) | Lag Nord markert, timer i minus. NESTE = Tilbake til påstand |
| 14 | Kryssforhør Lag Sør (4:00) | Som over. NESTE = Tilbake til påstand |
| 15 | Sluttappell Lag Nord (1:00) | Ved 0 vises «TID» i 2 sekunder, så **påstanden automatisk** |
| 16 | Sluttappell Lag Sør (1:00) | Som over |
| 17 | Åpne etter-avstemning | QR-kode (publikum trenger ikke skanne på nytt) |
| 18 | Lukk etter-avstemning | **Direkte til resultatet for runden** |
| 19 | Påstand 2 og 3 | **Vis påstand** først, deretter samme gang som 8–18 med ekstravideo 2 og 3 |
| 20 | Kår vinner av debatten | Vinnerlaget, totalscore og poeng per påstand |
| 21 | Åpne avstemning: hovedspørsmål (etter) | QR-kode |
| 22 | Lukk avstemning | **Resultat for hovedspørsmålet** (før og etter) |

Tider kan endres under **ADMIN → Innstillinger**. Leaderboardet kan vises når som helst med «Vis leaderboard».

Hvis antall stemmer før og etter er ulikt i steg 18, beregnes resultatet automatisk med andeler og merkes «NORMALISERT» (se kapittel 6).

## 5. Avstemninger

- Det kan bare være **én åpen avstemning** om gangen. Åpner du en ny, lukkes den forrige.
- Storskjermen viser **antall** stemmer, ikke fordelingen. I **AVSTEM** kan du trykke **Vis fordeling på skjerm** hvis du ønsker det.
- Publikum kan **endre stemmen** så lenge avstemningen er åpen. Det teller fortsatt som én stemme.
- **Åpne igjen:** en lukket avstemning kan åpnes igjen (f.eks. hvis noen ikke rakk å stemme).
- **Nullstill** (AVSTEM) sletter alle stemmer i én avstemning og tilhørende resultat. Krever bekreftelse.
- **Reserve – separate QR-koder:** AVSTEM → «Reserve: direktelenker» viser egne QR-koder for hovedspørsmålet og hver påstand. De kan vises på en mobil eller skrives ut.

## 6. Beregne resultat

Trykk **Beregn resultat** når både før- og etter-avstemningen for påstanden er lukket.

- **Likt antall stemmer før og etter:** resultatet godkjennes og legges i leaderboardet automatisk. Skjermen viser rundevinneren.
- **Ulikt antall:** resultatet beregnes automatisk med andeler (normalisert) og vises med en gang, merket «NORMALISERT BEREGNING». Du kan overstyre under RESULTAT.
- **Hvis «Krev likt antall stemmer» er slått på i ADMIN:** skjermen viser «Resultatet kontrolleres», og RESULTAT-fanen viser et gult varsel med tre valg:
  1. **Vent på flere stemmer** – åpner etter-avstemningen igjen. Lukk og beregn på nytt.
  2. **Godkjenn normalisert beregning** – bruker andeler i stedet for antall. Merkes «NORMALISERT BEREGNING» på skjermen.
  3. **Overstyr resultat manuelt** – skriv inn poeng for hvert lag og en begrunnelse. Merkes «MANUELT FASTSATT».
- **Beregn på nytt** og **Fjern resultat** finnes i RESULTAT for hver påstand.
- Hovedspørsmålet teller aldri i leaderboardet.

Se [SCORING.md](SCORING.md) for hvordan poengene regnes ut.

## 7. Timer

- Timeren starter automatisk når du trykker en debattdel (kan slås av i ADMIN → Innstillinger).
- **TIMER**-fanen: Start / Pause / Fortsett, Nullstill, −10 sek, +10 sek, +1 minutt og valgfri tid.
- Storskjermen: hvit → gul ved 30 sek → rød og pulserende ved 10 sek → lydsignal ved 0 (kan slås av i ADMIN). Åpningsinnlegg og kryssforhør fortsetter i minus. Sluttappell viser «TID» og går automatisk tilbake til påstanden.
- Går du til en annen visning under en debattdel, stoppes timeren (pause hvis det er tid igjen).
- Timeren går videre selv om mobilen mister nettet – den regnes ut lokalt fra starttidspunktet.

## 8. Spillekort

Fanen **KORT** viser fem kort per lag. Trykk et kort når laget bruker det:

- Kortet vises stort på storskjermen i noen sekunder og markeres som brukt.
- **Grønt kort** legger automatisk til 60 sekunder på timeren.
- Hvert kort kan brukes én gang per lag i hele arrangementet.
- **Feilregistrert?** Trykk det brukte kortet og bekreft for å angre. (Grønt kort trekker da fra 60 sekunder igjen.)
- **Spillekort og regler** viser alle kortene på storskjermen.

## 9. Feilhåndtering

| Problem | Løsning |
|---|---|
| Mobilen viser «Frakoblet» | Vent noen sekunder – den kobler til igjen. Bytt mellom wifi og mobilnett. Oppdater siden (innloggingen beholdes). |
| Storskjermen viser «Frakoblet» | Skjermen beholder siste bilde. Sjekk nettet på Mac-en, eller koble Mac-en til mobilhotspot. Den synkroniserer automatisk når nettet er tilbake. |
| Storskjermen henger | Trykk ⌘R i Chrome og deretter **Start publikumsskjerm**. Tilstanden hentes fra serveren. |
| Video vises ikke | MEDIA viser hvilke filer som mangler. Skjermen går tilbake etter 4 sekunder. Sjekk filnavnet i `media/video/`. |
| Ingen lyd | Klikk «🔇 Klikk for lyd» nederst på storskjermen, eller klikk en gang i skjermvinduet. |
| «Serveren er opptatt» | Mange stemmer samtidig. Handlingen kan trykkes på nytt etter et øyeblikk. Publikums stemmer prøves automatisk på nytt. |
| Feil PIN / utlogget | Logg inn igjen. Etter 10 forsøk må du vente 10 minutter. |
| Publikum får «Avstemningen er ikke åpen» | Sjekk at riktig avstemning er åpen (AVSTEM). Siden deres oppdateres av seg selv, normalt med en gang (ellers innen 5–15 sekunder). |
| Feil kort registrert | KORT → trykk det brukte kortet → bekreft angre. |
| Feil resultat | RESULTAT → **Overstyr** med begrunnelse, eller **Nullstill** avstemningen og kjør den på nytt. |

## 10. Nullstille en runde

1. **AVSTEM** → finn påstanden → **Nullstill** på før- og/eller etter-avstemningen (sletter stemmer og resultatet for påstanden).
2. Kjør runden på nytt fra steg 6 i kjøreplanen.

For å nullstille alt (f.eks. etter generalprøve): **ADMIN → Nullstill hele arrangementet** (skriv NULLSTILL). Påstander og innstillinger beholdes.

## 11. Brudd i internettforbindelsen

- **Kort brudd (sekunder–minutter):** Alt fortsetter. Storskjermen står på siste visning, timeren teller videre lokalt, og alle flater synkroniserer seg når nettet er tilbake. Publikums mobil prøver en stemme på nytt noen ganger. Kom den likevel ikke fram, får personen en feilmelding og kan trykke igjen.
- **Mac-en mister nettet:** koble den til mobilhotspot. Videoer spilles uansett fra disken.
- **Operatørmobilen mister nettet:** bytt til mobilnett. Kontrollflaten kan også åpnes på en annen mobil eller PC med samme PIN.
- **Lokalets wifi er nede for publikum:** be publikum bruke mobilnett – stemmesiden krever bare vanlig internett.
- **Lengre brudd under en avstemning:** la avstemningen stå åpen til nettet er tilbake, eller nullstill og kjør den på nytt.

## 12. Etter arrangementet

- Vis **hovedresultat** og **leaderboard**.
- Resultatene står under **RESULTAT** i kontrollflaten. Stemmetall per avstemning finnes i Supabase → Table Editor → `isq_rapport_stemmer` (kan lastes ned som CSV).
- Logg ut av kontrollflaten (ADMIN → Logg ut).
