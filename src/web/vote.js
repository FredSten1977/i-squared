// @ts-check
/* global ISQ_Client */
/**
 * Publikumspoll. Anonym voter-token lagres lokalt; serveren hasher den før lagring.
 */
(function () {
  'use strict';

  var cl = ISQ_Client;
  var $ = cl.$;
  var BOOT = cl.BOOT;
  var LABELS_DEFAULT = { against: 'MOT', neutral: 'NØYTRAL', for: 'FOR' };

  var token = cl.storage.get('isq-voter');
  if (!token || !/^[A-Za-z0-9_-]{16,128}$/.test(token)) {
    token = cl.randomToken(24);
    cl.storage.set('isq-voter', token);
  }

  /** @type {any} */
  var poll = null;
  var sending = false;
  /** @type {string|null} */
  var queued = null;
  var pollKey = BOOT.poll || null;

  /** @param {string} id */
  function show(id) {
    ['loading', 'closed', 'open'].forEach(function (x) {
      $(x).hidden = x !== id;
    });
  }

  /** Nøkkel for lokalt husket stemme; endres når avstemningen nullstilles. @param {string} pollId */
  function voteKey(pollId) {
    var sessionId = poll && poll.id === pollId && poll.session ? poll.session : lastSession[pollId] || '';
    return 'isq-vote:' + pollId + ':' + sessionId;
  }
  /** @type {Record<string, string>} */
  var lastSession = {};
  /** @param {string} pollId */
  function myChoice(pollId) {
    return cl.storage.get(voteKey(pollId));
  }

  function labelsOf() {
    return (poll && poll.labels) || LABELS_DEFAULT;
  }

  function renderChoices() {
    var mine = poll ? myChoice(poll.id) : null;
    var labels = labelsOf();
    document.querySelectorAll('.choice').forEach(function (b) {
      var c = /** @type {string} */ (b.getAttribute('data-choice'));
      b.setAttribute('aria-pressed', mine === c ? 'true' : 'false');
      /** @type {HTMLButtonElement} */ (b).disabled = sending;
      $('lbl-' + c).textContent = labels[c];
    });
    var conf = $('confirm');
    if (mine) {
      conf.hidden = false;
      conf.innerHTML = '<strong>✓ Stemmen din er registrert: ' + cl.esc(labels[mine]) + '</strong><br>Du kan endre stemmen så lenge avstemningen er åpen.';
    } else {
      conf.hidden = true;
    }
  }

  /** @param {any} data */
  function render(data) {
    if (data.event && data.event.title) {
      $('title').textContent = data.event.title;
      document.title = 'Stem • ' + data.event.title;
    }
    var p = data.poll;
    if (p) lastSession[p.id] = p.session || '';
    if (!p || p.status !== 'open') {
      poll = p && p.status === 'open' ? p : null;
      $('closedText').textContent =
        p && p.status === 'closed' && myChoice(p.id)
          ? 'Takk for stemmen! Avstemningen er stengt. Siden oppdateres automatisk når neste avstemning åpner.'
          : 'Siden oppdateres automatisk når neste avstemning åpner. Du trenger ikke skanne på nytt.';
      show('closed');
      return;
    }
    var changed = !poll || poll.id !== p.id;
    poll = p;
    $('phase').textContent =
      (p.type === 'main' ? 'HOVEDSPØRSMÅL' : 'PÅSTAND ' + p.statementNo) + ' • ' + (p.phase === 'before' ? 'FØR DEBATTEN' : 'ETTER DEBATTEN');
    $('question').textContent = p.text;
    if (changed) $('error').hidden = true;
    renderChoices();
    show('open');
  }

  /** @param {string} msg */
  function showError(msg) {
    var e = $('error');
    e.textContent = msg;
    e.hidden = false;
  }

  /** @param {string} choice @param {number} [attempt] */
  function send(choice, attempt) {
    if (!poll) return;
    if (sending) {
      queued = choice;
      return;
    }
    var pollId = poll.id;
    sending = true;
    $('error').hidden = true;
    renderChoices();
    cl.call('public.vote', { token: token, choice: choice, pollId: pollId })
      .then(function () {
        cl.storage.set(voteKey(pollId), choice);
        if (navigator.vibrate) navigator.vibrate(30);
      })
      .catch(function (/** @type {any} */ e) {
        var n = attempt || 0;
        if ((e.code === 'BUSY' || e.code === 'NETWORK' || e.code === 'INTERNAL') && n < 3) {
          sending = false;
          setTimeout(
            function () {
              send(choice, n + 1);
            },
            800 * (n + 1) + Math.random() * 600
          );
          return 'retry';
        }
        if (e.code === 'POLL_CLOSED') {
          showError('Avstemningen ble stengt før stemmen kom fram.');
          p.now();
        } else {
          showError(e.message || 'Noe gikk galt. Prøv igjen.');
        }
      })
      .then(function (r) {
        if (r === 'retry') return;
        sending = false;
        renderChoices();
        if (queued && queued !== myChoice(pollId)) {
          var q = queued;
          queued = null;
          send(q);
        } else {
          queued = null;
        }
      });
  }

  $('choices').addEventListener('click', function (ev) {
    var b = /** @type {HTMLElement} */ (ev.target).closest('.choice');
    if (!b || !poll) return;
    var c = /** @type {string} */ (b.getAttribute('data-choice'));
    if (c === myChoice(poll.id) && !sending) return;
    send(c);
  });

  var p = cl.poller({
    method: 'public.voteState',
    payload: function () {
      return pollKey ? { poll: pollKey } : {};
    },
    interval: 3000,
    rtInterval: 15000,
    realtime: 'isq_live',
    hiddenInterval: 15000,
    jitter: 2000,
    onData: render,
    onError: function () {
      return false;
    }
  });
})();
