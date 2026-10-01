// @ts-check
/**
 * Seed-data og faste definisjoner for I-Squared Statsbygg.
 * Kjører i Apps Script (global), i nettleseren (global) og i Node (module.exports).
 */
var ISQ_Config = (function () {
  'use strict';

  var CHOICES = ['against', 'neutral', 'for'];
  var CHOICE_LABELS = { against: 'MOT', neutral: 'NØYTRAL', for: 'FOR' };
  /** Skala for netto flyttede stemmesteg. */
  var CHOICE_VALUE = { against: 0, neutral: 1, for: 2 };

  var TEAMS = ['north', 'south'];

  var CARDS = [
    { key: 'yellow', icon: '🟨', title: 'PASS', name: 'Gult kort', text: 'Laget slipper å svare.' },
    { key: 'red', icon: '🟥', title: 'INNSIGELSE', name: 'Rødt kort', text: 'Laget avbryter med en kort innsigelse.' },
    { key: 'green', icon: '🟩', title: 'EKSTRATID', name: 'Grønt kort', text: 'Laget får ett ekstra minutt.' },
    { key: 'english', icon: '🇬🇧', title: 'ENGLISH, PLEASE', name: 'Britisk flagg', text: 'Svaret må gis på engelsk.' },
    { key: 'yesno', icon: '❗', title: 'JA ELLER NEI', name: 'Utropstegn', text: 'Motstanderlaget må først svare ja eller nei.' }
  ];

  var VIEWS = [
    'hero',
    'mainQuestion',
    'statement',
    'qr',
    'team',
    'opening',
    'cross',
    'closing',
    'result',
    'leaderboard',
    'mainResult',
    'winner',
    'rules',
    'video',
    'black'
  ];

  var VIEW_LABELS = {
    hero: 'Hero',
    mainQuestion: 'Hovedspørsmål',
    statement: 'Påstand',
    qr: 'QR-kode / avstemning',
    team: 'Lagpresentasjon',
    opening: 'Åpningsinnlegg',
    cross: 'Kryssforhør',
    closing: 'Sluttappell',
    result: 'Avstemningsresultat',
    leaderboard: 'Leaderboard',
    mainResult: 'Resultat hovedspørsmål',
    winner: 'Vinner av debatten',
    rules: 'Debattregler',
    video: 'Video',
    black: 'Svart skjerm'
  };

  /**
   * Videoer spilles fra den lokale publikumsskjerm-mappen på Mac-en.
   * returnTo: hvor skjermen går når videoen er ferdig (null = visningen før videoen).
   */
  var VIDEOS = [
    // Debattintroen har sangen innbakt (ingen egen soundtrack), og går tilbake til debattreglene
    { key: 'introDebate', label: 'Debattintro', file: 'media/video/introdebatt.mp4', returnTo: { view: 'rules' } },
    { key: 'introNorth', label: 'Introvideo Lag Nord', file: 'media/video/Introvideonord.mp4', team: 'north', returnTo: null },
    { key: 'introSouth', label: 'Introvideo Lag Sør', file: 'media/video/Introvideosør.mp4', team: 'south', returnTo: { view: 'statement', statementNo: 1 } },
    {
      key: 'extra1',
      label: 'Ekstravideo påstand 1',
      file: 'media/video/ekstravideopåstand1.mp4',
      statement: 1,
      returnTo: { view: 'statement', statementNo: 1 }
    },
    {
      key: 'extra2',
      label: 'Ekstravideo påstand 2',
      file: 'media/video/ekstravideopåstand2.mp4',
      statement: 2,
      returnTo: { view: 'statement', statementNo: 2 }
    },
    {
      key: 'extra3',
      label: 'Ekstravideo påstand 3',
      file: 'media/video/ekstravideopåstand3.mp4',
      statement: 3,
      returnTo: { view: 'statement', statementNo: 3 }
    }
  ];

  /** Debattdeler: varighet styres i innstillingene; overtime = timeren fortsetter i minus. */
  var SEGMENTS = {
    opening: { label: 'Åpningsinnlegg', overtime: true, autoReturn: false },
    cross: { label: 'Kryssforhør', overtime: true, autoReturn: false },
    closing: { label: 'Sluttappell', overtime: false, autoReturn: true }
  };
  /** Sekunder «TID» vises før sluttappellen går automatisk tilbake til påstanden. */
  var AUTO_RETURN_GRACE_MS = 2000;

  var MUSIC = [
    { key: 'walkon', label: 'Innmarsj', file: 'media/music/innmarsj.mp3' },
    { key: 'break', label: 'Pausemusikk', file: 'media/music/pause.mp3' }
  ];

  var POLL_IDS = ['main-before', 'main-after', 's1-before', 's1-after', 's2-before', 's2-after', 's3-before', 's3-after'];

  var STATUSES = [
    'setup',
    'intro',
    'main_poll_before',
    'team_introduction',
    'statement_1_before_poll',
    'statement_1_debate',
    'statement_1_after_poll',
    'statement_1_result',
    'statement_2_before_poll',
    'statement_2_debate',
    'statement_2_after_poll',
    'statement_2_result',
    'statement_3_before_poll',
    'statement_3_debate',
    'statement_3_after_poll',
    'statement_3_result',
    'main_poll_after',
    'final_result',
    'completed'
  ];

  var DEFAULT_SLUG = 'i-squared-statsbygg';

  /** @returns {any} et nytt arrangementsdokument med seed-data */
  function seedDocument() {
    var polls = {};
    POLL_IDS.forEach(function (id) {
      var parts = id.split('-');
      var isMain = parts[0] === 'main';
      polls[id] = {
        id: id,
        type: isMain ? 'main' : 'statement',
        statementNo: isMain ? null : Number(parts[0].slice(1)),
        phase: parts[1],
        status: 'draft',
        openedAt: null,
        closedAt: null
      };
    });
    return {
      schemaVersion: 4,
      version: 1,
      event: {
        slug: DEFAULT_SLUG,
        title: 'I-Squared Statsbygg',
        heroTitle: 'I-Squared',
        kicker: 'Statsbygg presenterer',
        mainQuestion:
          'Vil den nye styrings- og leveransemodellen modernisere vår digitale utvikling, eller blir den en PowerPoint-presentasjon uten reell praktisk effekt?',
        mainLabels: { against: 'POWERPOINT', neutral: 'USIKKER', for: 'MODERNISERING' },
        status: 'setup',
        demoMode: false,
        settings: {
          soundEnabled: true,
          autoStartTimer: true,
          requireEqualTurnout: false,
          durations: { opening: 180, cross: 240, closing: 60, team: 60 }
        },
        createdAt: null,
        updatedAt: null
      },
      teams: {
        north: { key: 'north', name: 'Lag Nord', color: '#55c8ff', image: 'media/images/lagnord.jpg' },
        south: { key: 'south', name: 'Lag Sør', color: '#ff654f', image: 'media/images/lagsør.jpg' }
      },
      statements: [
        {
          no: 1,
          short: 'Tjenester',
          text: 'Statsbygg bør organisere digital utvikling rundt tjenester, ikke rundt organisasjonsstrukturen.',
          northPosition: 'against',
          southPosition: 'for'
        },
        {
          no: 2,
          short: 'Kontroll',
          text: 'Den største hindringen for digital utvikling i Statsbygg er ikke teknologi, men ledere som ikke tør å gi fra seg kontroll.',
          northPosition: 'against',
          southPosition: 'for'
        },
        {
          no: 3,
          short: 'Kulturendring',
          text: 'Kulturendringen den nye styrings- og leveransemodellen krever er vi klare for i Statsbygg.',
          northPosition: 'against',
          southPosition: 'for'
        }
      ],
      polls: polls,
      state: {
        view: 'hero',
        previousView: 'hero',
        activeStatement: 1,
        activePollId: null,
        cueIndex: -1,
        qrPollId: null,
        activeTeam: 'north',
        segment: null,
        revealDistribution: false,
        resultStatement: null,
        video: null,
        music: null,
        flash: null
      },
      timer: { status: 'idle', startedAt: null, durationSeconds: 180, pausedRemaining: null },
      cards: [],
      results: {}
    };
  }

  return {
    CHOICES: CHOICES,
    CHOICE_LABELS: CHOICE_LABELS,
    CHOICE_VALUE: CHOICE_VALUE,
    TEAMS: TEAMS,
    CARDS: CARDS,
    VIEWS: VIEWS,
    VIEW_LABELS: VIEW_LABELS,
    VIDEOS: VIDEOS,
    SEGMENTS: SEGMENTS,
    AUTO_RETURN_GRACE_MS: AUTO_RETURN_GRACE_MS,
    MUSIC: MUSIC,
    POLL_IDS: POLL_IDS,
    STATUSES: STATUSES,
    DEFAULT_SLUG: DEFAULT_SLUG,
    seedDocument: seedDocument
  };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = ISQ_Config;
