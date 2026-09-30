# Scoring – netto flyttede stemmesteg

## Modellen

Hver stemme får en verdi på en tretrinnsskala:

| Svar | Verdi |
|---|---|
| MOT | 0 |
| NØYTRAL | 1 |
| FOR | 2 |

For hver påstand regnes det ut:

```
beforeScore = antallNøytralFør  + 2 × antallForFør
afterScore  = antallNøytralEtter + 2 × antallForEtter
netMovement = afterScore − beforeScore
```

- **Positiv** `netMovement` = netto bevegelse mot FOR.
- **Negativ** `netMovement` = netto bevegelse mot MOT.
- **Null** = ingen netto bevegelse.

Laget som argumenterer i retningen av bevegelsen, får **absoluttverdien** som poeng for påstanden. Det andre laget får 0. Ved null får begge 0. Lagenes posisjon (FOR/MOT) settes per påstand i ADMIN og lagres sammen med resultatet.

**Totalscore** i leaderboardet er summen av lagets poeng for de tre påstandene. Bare *godkjente* runder teller. Prosentpoeng brukes aldri i poengene. **Hovedspørsmålet teller ikke**; det vises bare som en før-og-etter-sammenligning til slutt.

Koden ligger i `src/shared/scoring.js` og er dekket av enhetstester i `tests/unit/scoring.test.mjs`.

## Hvorfor stemmesteg?

Et poeng per runde («vinneren får 1») belønner ikke hvor mye et lag faktisk flyttet salen. Prosentpoeng blir misvisende når antallet deltakere er lite. Stemmesteg er et tall publikum kan forstå: *«Lag Nord flyttet 8 stemmer.»* Det gir også uttelling for delvis overbevisning (MOT → NØYTRAL) og mer for full overbevisning (MOT → FOR).

## Konkrete eksempler

| Endring (én person) | Bidrag til `netMovement` | Uttelling til |
|---|---|---|
| MOT → NØYTRAL | +1 | FOR-siden |
| NØYTRAL → FOR | +1 | FOR-siden |
| MOT → FOR | +2 | FOR-siden |
| FOR → NØYTRAL | −1 | MOT-siden |
| NØYTRAL → MOT | −1 | MOT-siden |
| FOR → MOT | −2 | MOT-siden |

**Eksempel A – Lag Nord argumenterer FOR (som på påstand 3)**

| | MOT | NØYTRAL | FOR | Totalt | Score |
|---|---|---|---|---|---|
| Før | 10 | 10 | 10 | 30 | 10 + 2·10 = 30 |
| Etter | 6 | 10 | 14 | 30 | 10 + 2·14 = 38 |

`netMovement = 38 − 30 = +8` → Lag Nord (FOR) får **8 flyttede stemmer**, Lag Sør 0.

**Eksempel B – Lag Sør argumenterer MOT**

| | MOT | NØYTRAL | FOR | Totalt | Score |
|---|---|---|---|---|---|
| Før | 5 | 10 | 10 | 25 | 10 + 20 = 30 |
| Etter | 6 | 13 | 6 | 25 | 13 + 12 = 25 |

`netMovement = −5` → Lag Sør (MOT) får **5**, Lag Nord 0.

**Eksempel C – påstand der Lag Nord er MOT (som på påstand 1 og 2)**

Før: 0 MOT, 4 NØYTRAL, 4 FOR (score 12). Etter: 4 MOT, 4 NØYTRAL, 0 FOR (score 4). `netMovement = −8` → Lag Nord (MOT) får 8.

**Eksempel D – full kveld**

| Påstand | Posisjon Nord/Sør | netMovement | Nord | Sør |
|---|---|---|---|---|
| 1 | MOT / FOR | +4 | 0 | 4 |
| 2 | MOT / FOR | −3 | 3 | 0 |
| 3 | FOR / MOT | +6 | 6 | 0 |
| **Totalt** | | | **9** | **4** |

## Metodiske begrensninger

Avstemningen er anonym og aggregert. Systemet vet hvor mange som svarte MOT, NØYTRAL og FOR før og etter, men **ikke** hvilke enkeltpersoner som flyttet seg.

- `netMovement` er derfor **netto** bevegelse. Én person som går MOT → FOR (+2) og en annen som går FOR → MOT (−2), gir til sammen 0, selv om to personer faktisk endret mening.
- Tallet kan derfor ikke tolkes som «antall personer som skiftet mening». Riktig begrep i dokumentasjon og forklaringer er **«netto flyttede stemmesteg»**. På storskjermen brukes det kortere **«flyttede stemmer»**.
- Resultatet påvirkes av hvem som er i salen og stemmer. Folk som kommer eller går mellom før og etter, endrer tallene uten å ha flyttet seg.
- Voter-token lagres per nettleser. Systemet kan i prinsippet koble én persons før- og etterstemme (samme hash), men dette brukes bevisst **ikke**. Både personvern og enkelhet taler for den aggregerte modellen.

## Ulik deltakelse før og etter

**Standard (fra versjon 4):** er antallet stemmer før og etter ulikt, brukes **normalisert beregning automatisk** (se under). Resultatet vises med en gang og merkes «NORMALISERT BEREGNING» på skjermen, i kontrollflaten og i rapporten. Operatøren kan overstyre under RESULTAT.

**Strengt alternativ:** slå på «Krev likt antall stemmer før og etter» i ADMIN → Innstillinger. Da gjelder:

1. Skjermen viser «Resultatet kontrolleres», og resultatet legges **ikke** i leaderboardet.
2. Kontrollflaten viser et tydelig varsel med tallene og tre valg:
   1. **Vent på flere stemmer** – etter-avstemningen åpnes igjen. Lukk og beregn på nytt når tallene stemmer.
   2. **Godkjenn normalisert beregning** – se under. Merkes «NORMALISERT» på skjermen, i kontrollflaten, i loggen og i rapporten.
   3. **Overstyr manuelt** – operatøren setter poengene og oppgir en begrunnelse. Merkes «MANUELT FASTSATT» og logges.

Råe summer (uten normalisering) brukes aldri ved ulik deltakelse, fordi flere eller færre deltakere da ville gitt poeng uten at noen har endret mening.

### Normalisert beregning

Normalisering sammenligner **gjennomsnittlig stemmesteg per deltaker** i stedet for summer, og skalerer til gjennomsnittlig deltakelse:

```
snittFør   = beforeScore / antallFør
snittEtter = afterScore  / antallEtter
base       = (antallFør + antallEtter) / 2
netMovement (normalisert) = avrund( (snittEtter − snittFør) × base )
```

Avrunding skjer til nærmeste heltall, bort fra null ved ,5. Rå verdi (to desimaler) vises i kontrollflaten.

*Eksempel:* før 10/10/10 (30 stemmer, score 30, snitt 1,000), etter 10/10/15 (35 stemmer, score 40, snitt 1,143). `base = 32,5`, rå = 0,143 × 32,5 = 4,64 → **5** til FOR-siden. Uten normalisering ville de fem ekstra FOR-stemmene alene gitt +10.

Kommer flere med samme fordeling (f.eks. 2/2/2 → 4/4/4), gir normalisert beregning 0, som er riktig: ingen har endret mening.

## Fysisk personflytting vs. netto flyttede stemmesteg

| | Fysisk personflytting | Netto flyttede stemmesteg |
|---|---|---|
| Hva måles | Hvor mange personer som endret svar, og hvordan | Summen av endringer på skalaen 0–1–2 |
| Krever | Å koble hver persons før- og etterstemme | Bare antall per svaralternativ før og etter |
| Motstridende bevegelser | Telles hver for seg | Opphever hverandre |
| Personvern | Krever sporing av enkeltpersoners svar over tid | Kun aggregerte tall |
| Brukes her | Nei | **Ja** |

Eksempel: 3 personer går MOT → FOR og 2 personer går FOR → MOT. Fysisk flyttet 5 personer. Netto stemmesteg er 3·2 − 2·2 = **+2**, og FOR-siden får 2.
