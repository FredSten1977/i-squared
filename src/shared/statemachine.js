// @ts-check
/**
 * Kjøreplan (cue-liste) for I-Squared Statsbygg.
 *
 * Kjøreplanen er en fast, lineær liste med steg. «Neste» på kontrollflaten utfører
 * neste steg. Operatøren kan også hoppe til et hvilket som helst steg eller bruke
 * enkeltknappene, men rekkefølgen under er standardgangen i innslaget:
 *
 *   1  Forside (hero)                         2  Hovedspørsmål
 *   3  Åpne avstemning hovedspørsmål          4–5 Lukk → debattregler
 *   6  Introvideo Nord → tilbake til regler
 *   7  Introvideo Sør → påstand 1
 *   For hver påstand n (1–3):
 *     Ekstravideo n → påstand n · Åpne før-avstemning · Lukk → påstand n
 *     Åpningsinnlegg Nord 3:00 (går i minus) · Tilbake til påstand
 *     Åpningsinnlegg Sør 3:00 (går i minus)  · Tilbake til påstand
 *     Kryssforhør Nord 4:00 (går i minus)    · Tilbake til påstand
 *     Kryssforhør Sør 4:00 (går i minus)     · Tilbake til påstand
 *     Sluttappell Nord 1:00 (automatisk tilbake til påstand)
 *     Sluttappell Sør 1:00 (automatisk tilbake til påstand)
 *     Åpne etter-avstemning · Lukk → resultat for runden
 *   20 Kår vinner av debatten
 *   21 Åpne avstemning hovedspørsmål (etter) 22 Lukk → resultat hovedspørsmål
 */
var ISQ_StateMachine = (function () {
  'use strict';

  var ORDER = [
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

  /**
   * @typedef {{id:string, step:string, label:string, status:string, actions:Array<[string, any]>}} Cue
   * @returns {Cue[]}
   */
  function buildCues() {
    /** @type {Cue[]} */
    var cues = [];
    /** @param {string} id @param {string} step @param {string} label @param {string} status @param {Array<[string, any]>} actions */
    function add(id, step, label, status, actions) {
      cues.push({ id: id, step: step, label: label, status: status, actions: actions });
    }
    add('hero', '1', 'Forside', 'intro', [['setView', { view: 'hero' }]]);
    add('mainq', '2', 'Vis hovedspørsmål', 'intro', [['setView', { view: 'mainQuestion' }]]);
    add('main-open', '3', 'Åpne avstemning: hovedspørsmål', 'main_poll_before', [['openPoll', { pollId: 'main-before', showQr: true }]]);
    add('main-close', '4–5', 'Lukk avstemning → debattregler', 'team_introduction', [
      ['closePoll', { pollId: 'main-before' }],
      ['setView', { view: 'rules' }]
    ]);
    add('intro-n', '6', 'Introvideo Lag Nord (→ regler)', 'team_introduction', [['playVideo', { key: 'introNorth' }]]);
    add('intro-s', '7', 'Introvideo Lag Sør (→ påstand 1)', 'team_introduction', [['playVideo', { key: 'introSouth' }]]);
    for (var n = 1; n <= 3; n++) {
      var s = 'statement_' + n;
      var back = /** @type {[string, any]} */ (['showStatement', { statementNo: n }]);
      var sn = '';
      // Påstand 2 og 3 vises på skjermen før ekstravideoen (påstand 1 vises allerede etter introvideo Sør)
      if (n > 1) add('s' + n + '-show', '19', 'Vis påstand ' + n, s + '_before_poll', [['showStatement', { statementNo: n }]]);
      add('s' + n + '-video', n === 1 ? '8' : '19', 'Ekstravideo påstand ' + n + ' (→ påstand ' + n + ')', s + '_before_poll', [
        ['selectStatement', { statementNo: n }],
        ['playVideo', { key: 'extra' + n }]
      ]);
      add('s' + n + '-open', n === 1 ? '9' : '19', 'Åpne før-avstemning påstand ' + n, s + '_before_poll', [
        ['openPoll', { pollId: 's' + n + '-before', showQr: true }]
      ]);
      add('s' + n + '-close', n === 1 ? '10' : '19', 'Lukk før-avstemning → påstand ' + n, s + '_before_poll', [
        ['closePoll', { pollId: 's' + n + '-before' }]
      ]);
      add('s' + n + '-open-n', n === 1 ? '11' : '19', 'Åpningsinnlegg Lag Nord' + sn, s + '_debate', [['startSegment', { kind: 'opening', team: 'north' }]]);
      add('s' + n + '-back1', n === 1 ? '11' : '19', 'Tilbake til påstand ' + n, s + '_debate', [back]);
      add('s' + n + '-open-s', n === 1 ? '12' : '19', 'Åpningsinnlegg Lag Sør' + sn, s + '_debate', [['startSegment', { kind: 'opening', team: 'south' }]]);
      add('s' + n + '-back2', n === 1 ? '12' : '19', 'Tilbake til påstand ' + n, s + '_debate', [back]);
      add('s' + n + '-cross-n', n === 1 ? '13' : '19', 'Kryssforhør Lag Nord' + sn, s + '_debate', [['startSegment', { kind: 'cross', team: 'north' }]]);
      add('s' + n + '-back3', n === 1 ? '13' : '19', 'Tilbake til påstand ' + n, s + '_debate', [back]);
      add('s' + n + '-cross-s', n === 1 ? '14' : '19', 'Kryssforhør Lag Sør' + sn, s + '_debate', [['startSegment', { kind: 'cross', team: 'south' }]]);
      add('s' + n + '-back4', n === 1 ? '14' : '19', 'Tilbake til påstand ' + n, s + '_debate', [back]);
      add('s' + n + '-close-n', n === 1 ? '15' : '19', 'Sluttappell Lag Nord (→ påstand ' + n + ' automatisk)', s + '_debate', [
        ['startSegment', { kind: 'closing', team: 'north' }]
      ]);
      add('s' + n + '-close-s', n === 1 ? '16' : '19', 'Sluttappell Lag Sør (→ påstand ' + n + ' automatisk)', s + '_debate', [
        ['startSegment', { kind: 'closing', team: 'south' }]
      ]);
      add('s' + n + '-after-open', n === 1 ? '17' : '19', 'Åpne etter-avstemning påstand ' + n, s + '_after_poll', [
        ['openPoll', { pollId: 's' + n + '-after', showQr: true }]
      ]);
      add('s' + n + '-after-close', n === 1 ? '18' : '19', 'Lukk etter-avstemning → resultat runde ' + n, s + '_result', [
        ['closePoll', { pollId: 's' + n + '-after' }]
      ]);
    }
    add('winner', '20', 'Kår vinner av debatten', 'final_result', [['setView', { view: 'winner' }]]);
    add('main2-open', '21', 'Åpne avstemning: hovedspørsmål (etter)', 'main_poll_after', [['openPoll', { pollId: 'main-after', showQr: true }]]);
    add('main2-close', '22', 'Lukk avstemning → resultat hovedspørsmål', 'completed', [['closePoll', { pollId: 'main-after' }]]);
    return cues;
  }

  var CUES = buildCues();

  /** @param {string} status */
  function label(status) {
    var m = /^statement_(\d)_(before_poll|debate|after_poll|result)$/.exec(status);
    if (m) {
      var part = { before_poll: 'før-avstemning', debate: 'debatt', after_poll: 'etter-avstemning', result: 'resultat' }[m[2]];
      return 'Påstand ' + m[1] + ': ' + part;
    }
    return (
      {
        setup: 'Oppsett',
        intro: 'Intro',
        main_poll_before: 'Hovedspørsmål før debatten',
        team_introduction: 'Regler og lagpresentasjon',
        main_poll_after: 'Hovedspørsmål etter debatten',
        final_result: 'Vinner kåret',
        completed: 'Avsluttet'
      }[status] || status
    );
  }

  /** Status som hører til en avstemning når den åpnes. @param {string} pollId */
  function statusForPollOpen(pollId) {
    if (pollId === 'main-before') return 'main_poll_before';
    if (pollId === 'main-after') return 'main_poll_after';
    var m = /^s(\d)-(before|after)$/.exec(pollId);
    return m ? 'statement_' + m[1] + '_' + m[2] + '_poll' : null;
  }

  /** @param {string} status */
  function isValid(status) {
    return ORDER.indexOf(status) !== -1;
  }

  /** @param {string} id */
  function cueIndex(id) {
    for (var i = 0; i < CUES.length; i++) if (CUES[i].id === id) return i;
    return -1;
  }

  return { ORDER: ORDER, CUES: CUES, label: label, statusForPollOpen: statusForPollOpen, isValid: isValid, cueIndex: cueIndex };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = ISQ_StateMachine;
