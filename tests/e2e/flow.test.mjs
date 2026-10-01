// Ende-til-ende-test med Playwright av innslaget slik arrangøren har beskrevet det (steg 1–22).
// Kontrollflaten kjøres på en mobil-viewport og styres med «NESTE»-knappen, publikumsskjermen er
// den lokale skjermmappen med testbilder og testvideoer, og publikum stemmer fra egne mobiler.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, copyFileSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

if (!process.env.PLAYWRIGHT_BROWSERS_PATH && existsSync('/opt/pw-browsers')) process.env.PLAYWRIGHT_BROWSERS_PATH = '/opt/pw-browsers';
const { chromium } = await import('playwright');
const { startDevServer } = await import('../../dev/server.mjs');

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');
const shots = join(root, 'test-results');
const fixtures = join(root, 'tests/fixtures');
const mediaDir = join(root, 'dist/display/media');
const PIN = 'e2e-pin-2026';

// Testmedier: bilder og en kort video (1,5 s) under alle videonavnene
const MEDIA = [
  ['hero.jpg', 'images/hero.jpg'],
  ['lagnord.jpg', 'images/lagnord.jpg'],
  ['lagsor.jpg', 'images/lagsør.jpg'],
  ['testvideo.webm', 'video/introdebatt.mp4'],
  ['testvideo.webm', 'video/Introvideonord.mp4'],
  ['testvideo.webm', 'video/Introvideosør.mp4'],
  ['testvideo.webm', 'video/ekstravideopåstand1.mp4'],
  ['testvideo.webm', 'video/ekstravideopåstand2.mp4'],
  ['testvideo.webm', 'video/ekstravideopåstand3.mp4'],
  ['testsang.wav', 'music/introlagnord.mp3'],
  ['testsang.wav', 'music/introlagsør.mp3']
];
const removeMedia = () => MEDIA.forEach(([, to]) => rmSync(join(mediaDir, to), { force: true }));

let srv;
let browser;

before(async () => {
  execFileSync(process.execPath, [join(root, 'scripts/build.mjs')], { stdio: 'ignore' });
  mkdirSync(shots, { recursive: true });
  srv = await startDevServer({ port: 0, adminPin: PIN, quiet: true });
  browser = await chromium.launch();
});

after(async () => {
  removeMedia();
  await browser?.close();
  await srv?.close();
});

/** Venter til en betingelse er sann. */
async function waitFor(fn, { timeout = 15000, message = 'betingelse' } = {}) {
  const start = Date.now();
  let last;
  while (Date.now() - start < timeout) {
    try {
      last = await fn();
      if (last) return last;
    } catch (e) {
      last = e;
    }
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error(`Tidsavbrudd: ${message} (siste: ${last})`);
}

const text = (page, sel) => page.locator(sel).first().innerText();

test('innslaget steg 1–22: NESTE-knappen på mobil styrer storskjermen', { timeout: 300000 }, async () => {
  MEDIA.forEach(([from, to]) => {
    mkdirSync(dirname(join(mediaDir, to)), { recursive: true });
    copyFileSync(join(fixtures, from), join(mediaDir, to));
  });
  const errors = [];
  const watch = (p, name) => p.on('pageerror', (e) => errors.push(`${name}: ${e.message}`));

  // Korte tider så testen ikke tar en halvtime: åpning 10 s, kryssforhør 12 s, sluttappell 10 s
  const adminSession = (await srv.rpc('auth.login', { pin: PIN })).data.session;
  const setup = await srv.rpc('control.action', {
    session: adminSession,
    action: 'updateSettings',
    params: { opening: 10, cross: 12, closing: 10 }
  });
  assert.equal(setup.ok, true, setup.error);

  // --- Publikumsskjerm ---
  const displayCtx = await browser.newContext({ viewport: { width: 1600, height: 900 } });
  const display = await displayCtx.newPage();
  watch(display, 'skjerm');
  await display.goto(`${srv.base}/screen/index.html`);
  await display.click('#startBtn');
  const onScreen = (section, message) =>
    waitFor(async () => (await display.locator(`#${section}.active`).count()) === 1, { message: message || section, timeout: 20000 });
  let shotNo = 0;
  const shot = async (name) => {
    await display.waitForTimeout(500);
    await display.screenshot({ path: join(shots, `kjoreplan-${String(++shotNo).padStart(2, '0')}-${name}.png`) });
  };

  // --- Kontrollflate på mobil ---
  const controlCtx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const control = await controlCtx.newPage();
  watch(control, 'kontroll');
  await control.goto(`${srv.base}/kontroll/`);
  await control.fill('#pin', PIN);
  await control.click('#loginBtn');
  await waitFor(async () => (await control.locator('#nextBtn').count()) === 1, { message: 'NESTE-knapp' });

  /** Trykker NESTE og sjekker at kontrollflaten viser riktig steg som neste */
  const next = async (expectLabel) => {
    await waitFor(async () => (await text(control, '.nextLabel')).includes(expectLabel), { message: 'neste steg: ' + expectLabel });
    await control.click('#nextBtn');
    await control.waitForTimeout(300);
  };

  // --- Publikum ---
  const voterPages = [];
  for (let i = 0; i < 3; i++) {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 780 }, isMobile: true, hasTouch: true });
    const page = await ctx.newPage();
    watch(page, 'velger' + i);
    voterPages.push(page);
  }
  const vote = async (page, label, phase) => {
    await waitFor(async () => (await page.locator('#open:not([hidden])').count()) === 1 && (!phase || (await text(page, '#phase')) === phase), {
      timeout: 25000,
      message: 'stemmesiden viser ' + (phase || 'åpen avstemning')
    });
    await page.locator('.choice', { hasText: new RegExp('^' + label + '$') }).click();
    await waitFor(async () => new RegExp('registrert: ' + label).test(await text(page, '#confirm')), { message: 'bekreftelse ' + label });
  };
  const voteAll = async (labels) => {
    const phase = await text(display, '#qrLabel'); // samme tekst som øverst på stemmesiden
    for (let i = 0; i < labels.length; i++) await vote(voterPages[i], labels[i], phase);
    try {
      await waitFor(async () => (await text(display, '#qrCount')) === String(labels.length), { message: labels.length + ' stemmer på skjermen' });
    } catch (e) {
      const st = (await srv.rpc('public.state', {})).data;
      console.log('DEBUG', await text(display, '#qrCount'), await text(display, '#qrLabel'), st.view, JSON.stringify(st.qrPoll), JSON.stringify(st.poll));
      throw e;
    }
  };

  // 1. Forside med hero.jpg som bakgrunn
  await next('1. Forside');
  await onScreen('v-hero');
  await waitFor(async () => (await display.locator('#bg.has-hero').count()) === 1, { message: 'hero.jpg er bakgrunn' });
  assert.equal(await text(display, '#heroTitle'), 'I-Squared');
  assert.doesNotMatch(await text(display, '#v-hero'), /styrings- og leveransemodellen/, 'hovedspørsmålet står ikke på forsiden');
  assert.match(await text(display, '#v-hero'), /LAG NORD[\s\S]*LAG SØR/);
  await shot('forside');

  // 2. Hovedspørsmål
  await next('2. Vis hovedspørsmål');
  await onScreen('v-mainQuestion');
  assert.match(await text(display, '#mqText'), /styrings- og leveransemodellen/);

  // 3. Avstemning hovedspørsmål aktiveres – publikum skanner QR-koden
  await next('3. Åpne avstemning');
  await onScreen('v-qr');
  assert.match(await text(display, '#qrLabel'), /HOVEDSPØRSMÅL • FØR DEBATTEN/);
  const voteUrl = await display.locator('#qrBox').getAttribute('data-url');
  assert.equal(voteUrl, `${srv.base}/stem/`);
  for (const p of voterPages) await p.goto(voteUrl);
  await voteAll(['MODERNISERING', 'POWERPOINT', 'USIKKER']);
  await shot('qr-hovedsporsmal');

  // 4. Lukkes → rett til debattreglene
  await next('4. Lukk avstemning → debattregler');
  await onScreen('v-rules', 'debattregler etter lukket hovedspørsmål');
  assert.match(await text(display, '#rulesFormat'), /Kryssforhør/);
  await shot('debattregler');

  // 5. Debattintro (sangen ligger i videoen) → tilbake til debattreglene
  await next('5. Debattintro');
  await onScreen('v-video');
  await waitFor(async () => display.evaluate(() => !document.getElementById('player').paused), { message: 'debattintroen spilles' });
  assert.equal(await display.locator('#videoMissing.show').count(), 0, 'debattintro-filen finnes');
  assert.equal(await display.evaluate(() => document.getElementById('player').muted), false, 'debattintroen har egen lyd');
  assert.equal(await display.evaluate(() => document.getElementById('soundtrack').paused), true, 'ingen egen sang til debattintroen');
  await onScreen('v-rules', 'tilbake til regler etter debattintro');

  // 6. Introvideo Nord i fullskjerm → tilbake til debattregler når ferdig
  await next('6. Introvideo Lag Nord');
  await onScreen('v-video');
  await waitFor(async () => display.evaluate(() => !document.getElementById('player').paused), { message: 'videoen spilles' });
  assert.equal(await display.locator('#videoMissing.show').count(), 0, 'videofilen finnes');
  // Sangen til Lag Nord spilles samtidig, og videoens egen lyd er dempet
  const song = () =>
    display.evaluate(() => {
      const a = document.getElementById('soundtrack');
      return { playing: !a.paused, volume: a.volume, src: decodeURIComponent(a.src), videoMuted: document.getElementById('player').muted };
    });
  await waitFor(async () => (await song()).playing, { message: 'sangen spilles under introvideo Nord' });
  let s1 = await song();
  assert.match(s1.src, /music\/introlagnord\.mp3$/);
  assert.equal(s1.volume, 1);
  assert.equal(s1.videoMuted, true);
  await onScreen('v-rules', 'tilbake til regler etter introvideo Nord');
  // Videoen er ferdig: sangen fades ned (volumet synker) og stopper
  await waitFor(
    async () => {
      const x = await song();
      return x.playing && x.volume > 0 && x.volume < 0.95;
    },
    { message: 'sangen fades ned' }
  );
  await waitFor(async () => !(await song()).playing, { message: 'sangen stopper etter fade' });

  // 7. Introvideo Sør → påstand 1
  await next('7. Introvideo Lag Sør');
  await onScreen('v-video');
  await waitFor(async () => /introlagsør\.mp3$/.test((await song()).src) && (await song()).playing, { message: 'sangen til Lag Sør spilles' });
  await onScreen('v-statement', 'påstand 1 etter introvideo Sør');
  assert.equal(await text(display, '#stNr'), 'PÅSTAND 1');
  await shot('pastand-1');

  // 8. Ekstravideo påstand 1 → tilbake til påstand 1
  await next('8. Ekstravideo påstand 1');
  await onScreen('v-video');
  assert.equal(await display.evaluate(() => document.getElementById('player').muted), false, 'ekstravideo har egen lyd');
  await onScreen('v-statement', 'påstand 1 etter ekstravideo');

  // 9. Før-avstemning påstand 1
  await next('9. Åpne før-avstemning påstand 1');
  await onScreen('v-qr');
  await voteAll(['MOT', 'MOT', 'NØYTRAL']);
  assert.equal(await display.locator('#qrDist .distRow').count(), 0, 'fordelingen er skjult');

  // 10. Lukkes → påstand 1
  await next('10. Lukk før-avstemning');
  await onScreen('v-statement');
  await waitFor(async () => (await voterPages[0].locator('#closed:not([hidden])').count()) === 1, { timeout: 25000, message: 'stemmesiden viser lukket' });

  // 11. Åpningsinnlegg Nord – fortsetter i negativ tid til operatøren går tilbake
  await next('11. Åpningsinnlegg Lag Nord');
  await onScreen('v-speaker');
  assert.match(await text(display, '#spTeam'), /LAG NORD/);
  assert.match(await text(display, '#spPhase'), /Åpningsinnlegg/);
  await waitFor(async () => /^−00:0[1-9]$/.test(await text(display, '#spTimer')), { timeout: 20000, message: 'timeren går i minus' });
  assert.equal(await display.locator('#spTimer.over').count(), 1);
  await waitFor(async () => /^−00:/.test(await text(control, '#chipTimer')), { message: 'kontrollflaten viser også minus' });
  await shot('apning-nord-minus');
  await display.waitForTimeout(1500);
  assert.equal(await display.locator('#v-speaker.active').count(), 1, 'blir stående til operatøren går tilbake');
  await next('11. Tilbake til påstand 1');
  await onScreen('v-statement');

  // 12. Åpningsinnlegg Sør – samme oppsett
  await next('12. Åpningsinnlegg Lag Sør');
  await onScreen('v-speaker');
  assert.match(await text(display, '#spTeam'), /LAG SØR/);
  // Spillekort midt i innlegget (fra KORT-fanen): vises stort på skjermen
  await control.click('#t-cards');
  await control.locator('#tab-cards button', { hasText: 'Gult kort' }).last().click();
  await waitFor(async () => /LAG SØR: PASS/.test(await text(display, '#flashTitle')), { message: 'kort-flash' });
  await control.click('#t-run');
  await next('12. Tilbake til påstand 1');
  await onScreen('v-statement');

  // 13. Kryssforhør Nord 4 min (her 12 s) – går i minus, manuelt tilbake
  await next('13. Kryssforhør Lag Nord');
  await onScreen('v-cross');
  assert.equal(await display.locator('#crossN.activeN').count(), 1);
  await shot('kryssforhor-nord');
  await next('13. Tilbake til påstand 1');
  await onScreen('v-statement');

  // 14. Kryssforhør Sør
  await next('14. Kryssforhør Lag Sør');
  await onScreen('v-cross');
  assert.equal(await display.locator('#crossS.activeS').count(), 1);
  await next('14. Tilbake til påstand 1');
  await onScreen('v-statement');

  // 15. Sluttappell Nord 1 min (her 10 s) → påstand 1 vises automatisk når tiden er ute
  await next('15. Sluttappell Lag Nord');
  await onScreen('v-speaker');
  assert.match(await text(display, '#spPhase'), /Sluttappell/);
  await waitFor(async () => (await text(display, '#spTimer')) === 'TID', { timeout: 20000, message: 'TID' });
  await onScreen('v-statement', 'automatisk tilbake til påstand etter sluttappell Nord');

  // 16. Sluttappell Sør → automatisk tilbake
  await next('16. Sluttappell Lag Sør');
  await onScreen('v-speaker');
  assert.match(await text(display, '#spTeam'), /LAG SØR/);
  await onScreen('v-statement', 'automatisk tilbake til påstand etter sluttappell Sør');

  // 17. Etter-avstemning påstand 1 – publikum trenger ikke skanne på nytt
  await next('17. Åpne etter-avstemning');
  await onScreen('v-qr');
  assert.match(await text(display, '#qrLabel'), /PÅSTAND 1 • ETTER DEBATTEN/);
  await voteAll(['FOR', 'NØYTRAL', 'FOR']);

  // 18. Lukkes → direkte til resultat for runde 1: før 1 (2 MOT, 1 NØYTRAL) → etter 5 = +4 → Lag Sør (FOR)
  await next('18. Lukk etter-avstemning');
  await onScreen('v-result');
  await waitFor(async () => /LAG SØR VINNER RUNDEN/.test(await text(display, '#resBody')), { message: 'rundevinner' });
  await waitFor(async () => (await text(display, '#resBig')) === '4', { message: '4 flyttede stemmer' });
  await shot('resultat-runde-1');

  // 19. Påstand 2 og 3 med samme logikk (ekstravideo 2 og 3). Tidene brukes ikke opp her.
  const quickRound = async (n, before, afterVotes) => {
    // Påstanden vises før ekstravideoen
    await next(`Vis påstand ${n}`);
    await onScreen('v-statement', `påstand ${n} før ekstravideo`);
    await waitFor(async () => (await text(display, '#stNr')) === `PÅSTAND ${n}`, { message: `påstand ${n} på skjermen før video` });
    await next(`Ekstravideo påstand ${n}`);
    await onScreen('v-video');
    await onScreen('v-statement', `påstand ${n} etter ekstravideo ${n}`);
    assert.equal(await text(display, '#stNr'), `PÅSTAND ${n}`);
    await next(`Åpne før-avstemning påstand ${n}`);
    await onScreen('v-qr');
    await voteAll(before);
    await next('Lukk før-avstemning');
    await onScreen('v-statement');
    for (const label of [
      'Åpningsinnlegg Lag Nord',
      `Tilbake til påstand ${n}`,
      'Åpningsinnlegg Lag Sør',
      `Tilbake til påstand ${n}`,
      'Kryssforhør Lag Nord',
      `Tilbake til påstand ${n}`,
      'Kryssforhør Lag Sør',
      `Tilbake til påstand ${n}`,
      'Sluttappell Lag Nord',
      'Sluttappell Lag Sør'
    ]) {
      await next(label);
      await display.waitForTimeout(250);
    }
    await next(`Åpne etter-avstemning påstand ${n}`);
    await onScreen('v-qr');
    await voteAll(afterVotes);
    await next(`Lukk etter-avstemning → resultat runde ${n}`);
    await onScreen('v-result');
    assert.match(await text(display, '#resLabel'), new RegExp(`PÅSTAND ${n}`));
  };
  // Påstand 2 (Nord MOT / Sør FOR): FOR,FOR,NØYTRAL (5) → NØYTRAL,MOT,NØYTRAL (2) = −3 → Lag Nord 3
  await quickRound(2, ['FOR', 'FOR', 'NØYTRAL'], ['NØYTRAL', 'MOT', 'NØYTRAL']);
  await waitFor(async () => /LAG NORD VINNER RUNDEN/.test(await text(display, '#resBody')), { message: 'Nord vinner runde 2' });
  // Påstand 3 (Nord MOT / Sør FOR): NØYTRAL,FOR,FOR (5) → MOT,MOT,NØYTRAL (1) = −4 → Lag Nord 4
  await quickRound(3, ['NØYTRAL', 'FOR', 'FOR'], ['MOT', 'MOT', 'NØYTRAL']);
  await waitFor(async () => /LAG NORD VINNER RUNDEN/.test(await text(display, '#resBody')), { message: 'Nord vinner runde 3' });

  // 20. Vinner av debatten kåres: Nord 0 + 3 + 4 = 7, Sør 4 + 0 + 0 = 4
  await next('20. Kår vinner');
  await onScreen('v-winner');
  assert.match(await text(display, '#winnerBody'), /LAG NORD/);
  assert.match(await text(display, '.winnerScore'), /7[\s\S]*4/);
  await shot('vinner');

  // 21. Ny avstemning på hovedspørsmålet
  await next('21. Åpne avstemning');
  await onScreen('v-qr');
  assert.match(await text(display, '#qrLabel'), /HOVEDSPØRSMÅL • ETTER DEBATTEN/);
  await voteAll(['MODERNISERING', 'MODERNISERING', 'USIKKER']);

  // 22. Lukkes → resultat for hovedspørsmålet (før: MOD, PP, USIKKER = 3 → etter 5 = +2)
  await next('22. Lukk avstemning');
  await onScreen('v-mainResult');
  await waitFor(async () => /2 stemmesteg mot MODERNISERING/.test(await text(display, '#finalBody')), { message: 'resultat hovedspørsmål' });
  await shot('resultat-hovedsporsmal');
  await waitFor(async () => /fullført/.test(await text(control, '.nextLabel')), { message: 'kjøreplan fullført' });
  await control.screenshot({ path: join(shots, 'kjoreplan-kontroll-slutt.png'), fullPage: false });

  // Frakobling: skjermen beholder siste visning, viser frakoblet-merke og synkroniserer etterpå
  await displayCtx.setOffline(true);
  await waitFor(async () => (await display.locator('#offline.show').count()) === 1, { timeout: 20000, message: 'frakoblet-symbol' });
  assert.equal(await display.locator('#v-mainResult.active').count(), 1, 'siste visning beholdes');
  await displayCtx.setOffline(false);
  const leaderBtn = control.locator('#tab-run button.btn', { hasText: 'Vis leaderboard' }).first();
  await leaderBtn.click();
  await onScreen('v-leaderboard', 'gjenoppkobling synkroniserer');
  assert.equal(await text(display, '#lbNScore'), '7');
  assert.equal(await text(display, '#lbSScore'), '4');

  assert.deepEqual(errors, [], 'ingen JavaScript-feil i nettleseren');
  removeMedia();
});

test('uten mediefiler: kontrollert reserve for bilder og video', { timeout: 90000 }, async () => {
  removeMedia();
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 900 } });
  const display = await ctx.newPage();
  const errors = [];
  display.on('pageerror', (e) => errors.push(e.message));
  await display.goto(`${srv.base}/screen/index.html`);
  await display.click('#startBtn');
  const session = (await srv.rpc('auth.login', { pin: PIN })).data.session;
  const act = async (action, params = {}) => {
    const r = await srv.rpc('control.action', { session, action, params });
    assert.equal(r.ok, true, r.error);
  };
  await act('showTeam', { team: 'south' });
  await waitFor(async () => (await display.locator('#spPhoto.missing').count()) === 1, { message: 'reserve for lagbilde' });
  assert.equal(await display.locator('#bg.has-hero').count(), 0, 'gradient i stedet for hero');
  await display.screenshot({ path: join(shots, 'reserve-lagbilde.png') });
  // Ekstravideo startet med enkeltknapp mens noe annet vises: påstanden vises først, så videoen
  await act('setView', { view: 'hero' });
  await waitFor(async () => (await display.locator('#v-hero.active').count()) === 1, { message: 'hero før ekstravideo' });
  await act('playVideo', { key: 'extra2' });
  await waitFor(async () => (await display.locator('#v-statement.active').count()) === 1, { message: 'påstand vises før ekstravideo' });
  assert.equal(await text(display, '#stNr'), 'PÅSTAND 2');
  await waitFor(async () => (await display.locator('#v-video.active').count()) === 1, { timeout: 10000, message: 'videoen starter etter påstanden' });
  await waitFor(async () => (await display.locator('#v-statement.active').count()) === 1, { timeout: 15000, message: 'tilbake til påstand 2' });
  await act('setView', { view: 'rules' });
  await act('playVideo', { key: 'introNorth' });
  await waitFor(async () => /Finner ikke videoen/.test(await text(display, '#videoMissing')), { message: 'melding om manglende video' });
  await waitFor(async () => (await display.locator('#v-rules.active').count()) === 1, { timeout: 15000, message: 'tilbake etter manglende video' });
  const c = (await srv.rpc('control.state', { session })).data;
  assert.match(c.display.missing, /Introvideonord\.mp4/);

  // Rolig periode lenger enn 10 s: skjermen venter på endringer uten å melde «frakoblet»
  await display.waitForTimeout(14000);
  assert.equal(await display.locator('#offline.show').count(), 0, 'ingen falsk frakobling i rolige perioder');
  const t0 = Date.now();
  await act('setView', { view: 'hero' });
  await waitFor(async () => (await display.locator('#v-hero.active').count()) === 1, { message: 'endring etter rolig periode' });
  assert.ok(Date.now() - t0 < 1500, 'endringen kom fram raskt etter en rolig periode');
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('etter nullstilling glemmer publikums mobil den gamle stemmen og kan stemme på nytt', { timeout: 90000 }, async () => {
  const session = (await srv.rpc('auth.login', { pin: PIN })).data.session;
  const act = async (action, params = {}) => {
    const r = await srv.rpc('control.action', { session, action, params });
    assert.equal(r.ok, true, r.error);
  };
  await act('resetEvent', { confirm: true });
  await act('openPoll', { pollId: 's1-before' });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 780 }, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  await page.goto(`${srv.base}/stem/`);
  await waitFor(async () => (await page.locator('#open:not([hidden])').count()) === 1, { message: 'stemmesiden åpen' });
  await page.locator('.choice', { hasText: /^FOR$/ }).click();
  await waitFor(async () => /registrert: FOR/.test(await text(page, '#confirm')), { message: 'første stemme' });
  const count = async () => (await srv.rpc('control.state', { session })).data.polls['s1-before'].count;
  assert.equal(await count(), 1);

  // Operatøren nullstiller hele arrangementet og åpner samme avstemning igjen
  await act('resetEvent', { confirm: true });
  await act('openPoll', { pollId: 's1-before' });
  assert.equal(await count(), 0);
  await page.reload();
  await waitFor(async () => (await page.locator('#open:not([hidden])').count()) === 1, { message: 'stemmesiden åpen igjen' });
  assert.equal(await page.locator('#confirm:not([hidden])').count(), 0, 'ingen gammel bekreftelse');
  assert.equal(await page.locator('.choice[aria-pressed="true"]').count(), 0, 'ingen knapp markert');
  await page.locator('.choice', { hasText: /^FOR$/ }).click();
  await waitFor(async () => /registrert: FOR/.test(await text(page, '#confirm')), { message: 'ny stemme' });
  assert.equal(await count(), 1, 'samme valg ble sendt og telt på nytt');
  await ctx.close();
});
