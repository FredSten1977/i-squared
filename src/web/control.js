// @ts-check
/* global ISQ_Config, ISQ_Timer, ISQ_QR, ISQ_Client */
/**
 * Mobil kontrollflate. All tilstand ligger på serveren; denne siden henter
 * kontrolltilstand hvert 1,5 sekund og sender handlinger via rpc.
 */
(function () {
  'use strict';

  var C = ISQ_Config;
  var T = ISQ_Timer;
  var Q = ISQ_QR;
  var cl = ISQ_Client;
  var $ = cl.$;
  var esc = cl.esc;
  var BOOT = cl.BOOT;

  var session = cl.storage.get('isq-session');
  /** @type {any} */
  var state = null;
  /** @type {any} */
  var poller = null;
  var online = true;
  var adminRendered = false;
  var currentTab = BOOT.page === 'admin' ? 'admin' : cl.storage.get('isq-tab') || 'run';

  var CH = ['against', 'neutral', 'for'];
  var POLL_NAMES = {
    'main-before': 'Hovedspørsmål • før',
    'main-after': 'Hovedspørsmål • etter',
    's1-before': 'Påstand 1 • før',
    's1-after': 'Påstand 1 • etter',
    's2-before': 'Påstand 2 • før',
    's2-after': 'Påstand 2 • etter',
    's3-before': 'Påstand 3 • før',
    's3-after': 'Påstand 3 • etter'
  };
  var STATUS_LABEL = { draft: 'IKKE ÅPNET', open: 'ÅPEN', closed: 'LUKKET' };

  // ---------- Hjelpere ----------
  /**
   * @param {string} label @param {string} action @param {any} [params]
   * @param {{cls?:string, confirm?:string, title?:string, typed?:string, disabled?:boolean, sub?:string}} [o]
   */
  function btn(label, action, params, o) {
    var x = o || {};
    return (
      '<button type="button" class="btn ' +
      (x.cls || '') +
      '" data-act="' +
      action +
      '" data-p="' +
      esc(JSON.stringify(params || {})) +
      '"' +
      (x.confirm ? ' data-confirm="' + esc(x.confirm) + '"' : '') +
      (x.title ? ' data-title="' + esc(x.title) + '"' : '') +
      (x.typed ? ' data-typed="' + esc(x.typed) + '"' : '') +
      (x.disabled ? ' disabled' : '') +
      '>' +
      esc(label) +
      (x.sub ? '<small>' + esc(x.sub) + '</small>' : '') +
      '</button>'
    );
  }
  /** @param {string} team */
  function teamName(team) {
    return state && state.teams[team] ? state.teams[team].name : team === 'north' ? 'Lag Nord' : 'Lag Sør';
  }
  /** @param {string} p */
  function pos(p) {
    return p === 'for' ? 'FOR' : 'MOT';
  }
  function stNo() {
    return state.activeStatement || 1;
  }
  /** @param {number} n */
  function statement(n) {
    return state.statements.filter(function (/** @type {any} */ s) {
      return s.no === n;
    })[0];
  }
  /** @param {string} iso */
  function clock(iso) {
    try {
      var d = new Date(iso);
      return ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2);
    } catch (e) {
      return '';
    }
  }
  /** @param {string} msg @param {boolean} [ok] */
  function toast(msg, ok) {
    var t = $('toast');
    t.textContent = msg;
    t.className = 'toast show' + (ok ? ' ok' : '');
    clearTimeout(/** @type {any} */ (toast).t);
    /** @type {any} */ (toast).t = setTimeout(
      function () {
        t.className = 'toast';
      },
      ok ? 1800 : 4500
    );
  }

  // ---------- Innlogging ----------
  function showLogin(msg) {
    if (poller) poller.stop();
    poller = null;
    $('app').hidden = true;
    $('login').hidden = false;
    $('loginErr').textContent = msg || '';
    $('loginTitle').textContent = BOOT.title || 'I-Squared Statsbygg';
    setTimeout(function () {
      $('pin').focus();
    }, 50);
  }
  $('loginForm').addEventListener('submit', function (/** @type {Event} */ e) {
    e.preventDefault();
    var b = $('loginBtn');
    b.disabled = true;
    $('loginErr').textContent = '';
    cl.call('auth.login', { pin: $('pin').value })
      .then(function (d) {
        session = d.session;
        cl.storage.set('isq-session', d.session);
        $('pin').value = '';
        start();
      })
      .catch(function (/** @type {any} */ err) {
        $('loginErr').textContent = err.message;
      })
      .then(function () {
        b.disabled = false;
      });
  });

  function start() {
    $('login').hidden = true;
    $('app').hidden = false;
    selectTab(currentTab);
    poller = cl.poller({
      method: 'control.state',
      payload: function () {
        return { session: session };
      },
      interval: 1500,
      rtInterval: 3000,
      realtime: 'isq_tick',
      minGap: 400,
      hiddenInterval: 5000,
      onData: function (d) {
        if (state && d.version < state.version) return; // eldre svar som kom sent
        state = d;
        flushReportIfNeeded();
        render();
      },
      onStatus: function (on) {
        online = on;
        renderConn();
      },
      onError: function (/** @type {any} */ e) {
        if (e.code === 'AUTH') {
          cl.storage.remove('isq-session');
          session = null;
          showLogin(e.message);
          return true;
        }
        return false;
      }
    });
  }

  // ---------- Faner ----------
  /** @param {string} tab */
  function selectTab(tab) {
    currentTab = tab;
    cl.storage.set('isq-tab', tab);
    document.querySelectorAll('.tabbar button').forEach(function (b) {
      b.setAttribute('aria-selected', b.getAttribute('data-tab') === tab ? 'true' : 'false');
    });
    document.querySelectorAll('.tab').forEach(function (s) {
      s.classList.toggle('active', s.id === 'tab-' + tab);
    });
    if (tab === 'admin') adminRendered = false;
    if (state) render();
    window.scrollTo(0, 0);
  }
  document.querySelector('.tabbar').addEventListener('click', function (e) {
    var b = /** @type {HTMLElement} */ (e.target).closest('button[data-tab]');
    if (b) selectTab(/** @type {string} */ (b.getAttribute('data-tab')));
  });

  // ---------- Rapport i bakgrunnen ----------
  var flushing = false;
  /** Rapporten til regnearket skrives i et eget kall, så knappene ikke må vente på den. */
  function flushReportIfNeeded() {
    if (!state || !state.reportPending || flushing) return;
    flushing = true;
    cl.call('control.flushReport', { session: session })
      .catch(function () {
        /* prøves igjen senere */
      })
      .then(function () {
        flushing = false;
      });
  }

  // ---------- Handlinger ----------
  var busy = false;
  /** @param {string} action @param {any} params @param {HTMLElement|null} [el] */
  function act(action, params, el) {
    if (busy) {
      toast('Venter på svar fra forrige trykk …', true);
      return Promise.resolve(null);
    }
    busy = true;
    if (el) el.classList.add('busy');
    return cl
      .call('control.action', { session: session, action: action, params: params || {} })
      .then(function (d) {
        state = d.state;
        render();
        flushReportIfNeeded();
        if (d.result && d.result.warning) toast(d.result.warning);
        return d;
      })
      .catch(function (/** @type {any} */ e) {
        if (e.code === 'AUTH') {
          cl.storage.remove('isq-session');
          showLogin(e.message);
        } else {
          toast(e.message || 'Handlingen feilet.');
        }
        return null;
      })
      .then(function (d) {
        busy = false;
        if (el) el.classList.remove('busy');
        return d;
      });
  }

  // Bekreftelsesdialog
  /** @type {any} */
  var modalResolve = null;
  /** @param {{title?:string, text:string, typed?:string, extra?:string, ok?:string}} o @returns {Promise<boolean>} */
  function confirmDialog(o) {
    $('modalTitle').textContent = o.title || 'Bekreft';
    $('modalText').textContent = o.text;
    var extra = o.extra || '';
    if (o.typed)
      extra +=
        '<label for="typedInput">Skriv <b>' +
        esc(o.typed) +
        '</b> for å bekrefte</label><input id="typedInput" autocomplete="off" autocapitalize="characters" />';
    $('modalExtra').innerHTML = extra;
    $('modalOk').textContent = o.ok || 'Bekreft';
    $('modal').classList.add('show');
    setTimeout(function () {
      var f = /** @type {HTMLElement|null} */ ($('modalExtra').querySelector('input,textarea'));
      (f || $('modalCancel')).focus();
    }, 50);
    return new Promise(function (resolve) {
      modalResolve = function (/** @type {boolean} */ ok) {
        if (ok && o.typed) {
          var v = String($('typedInput').value || '')
            .trim()
            .toUpperCase();
          if (v !== o.typed.toUpperCase()) {
            toast('Skriv ' + o.typed + ' for å bekrefte.');
            return;
          }
        }
        $('modal').classList.remove('show');
        modalResolve = null;
        resolve(ok);
      };
    });
  }
  $('modalOk').addEventListener('click', function () {
    if (modalResolve) modalResolve(true);
  });
  $('modalCancel').addEventListener('click', function () {
    if (modalResolve) modalResolve(false);
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && modalResolve) modalResolve(false);
  });

  document.addEventListener('click', function (e) {
    var el = /** @type {HTMLElement|null} */ (/** @type {HTMLElement} */ (e.target).closest('[data-act]'));
    if (!el || /** @type {any} */ (el).disabled) return;
    if (el.tagName === 'A') e.preventDefault();
    var action = /** @type {string} */ (el.getAttribute('data-act'));
    var params = {};
    try {
      params = JSON.parse(el.getAttribute('data-p') || '{}');
    } catch (err) {
      /* ignorert */
    }
    if (action.indexOf('ui:') === 0) return uiAction(action.slice(3), params, el);
    var msg = el.getAttribute('data-confirm');
    if (msg) {
      confirmDialog({ title: el.getAttribute('data-title') || 'Bekreft', text: msg, typed: el.getAttribute('data-typed') || undefined }).then(function (ok) {
        if (ok) act(action, Object.assign({}, params, { confirm: true }), el);
      });
      return;
    }
    act(action, params, el);
  });

  /** Handlinger som krever skjema/inndata. @param {string} name @param {any} p @param {HTMLElement} el */
  function uiAction(name, p, el) {
    if (name === 'override') {
      var r = (state.results || {})[String(p.statementNo)] || {};
      confirmDialog({
        title: 'Overstyr resultat – påstand ' + p.statementNo,
        text: 'Sett flyttede stemmer manuelt. Resultatet merkes som manuelt fastsatt.',
        extra:
          '<div class="grid"><div><label for="ovN">' +
          esc(teamName('north')) +
          '</label><input id="ovN" type="number" inputmode="numeric" min="0" value="' +
          (r.north || 0) +
          '" /></div>' +
          '<div><label for="ovS">' +
          esc(teamName('south')) +
          '</label><input id="ovS" type="number" inputmode="numeric" min="0" value="' +
          (r.south || 0) +
          '" /></div></div>' +
          '<label for="ovR">Begrunnelse (vises i logg og rapport)</label><textarea id="ovR"></textarea>',
        ok: 'Overstyr'
      }).then(function (ok) {
        if (!ok) return;
        act(
          'overrideResult',
          {
            statementNo: p.statementNo,
            north: Number($('ovN').value || 0),
            south: Number($('ovS').value || 0),
            reason: String($('ovR').value || '').trim(),
            confirm: true
          },
          el
        );
      });
    } else if (name === 'customTime' || name === 'customStart') {
      var m = Number($('tMin').value || 0);
      var s = Number($('tSec').value || 0);
      var secs = Math.max(0, Math.round(m * 60 + s));
      act(name === 'customStart' ? 'timerStart' : 'timerSet', { seconds: secs }, el);
    } else if (name === 'saveEvent') {
      var slug = String($('aSlug').value || '').trim();
      var params = {
        title: $('aTitle').value,
        heroTitle: $('aHero').value,
        kicker: $('aKicker').value,
        mainQuestion: $('aMain').value,
        labelAgainst: $('aLA').value,
        labelNeutral: $('aLN').value,
        labelFor: $('aLF').value,
        slug: slug
      };
      var go = function (/** @type {boolean} */ confirmed) {
        if (confirmed) /** @type {any} */ (params).confirm = true;
        act('updateEvent', params, el).then(function (d) {
          if (d) {
            adminRendered = false;
            render();
            toast('Lagret', true);
          }
        });
      };
      if (slug && slug !== state.eventConfig.slug) {
        confirmDialog({ title: 'Bytt arrangement-ID', text: 'Lenker og QR-koder med ?event=' + state.eventConfig.slug + ' slutter å virke. Fortsette?' }).then(
          function (ok) {
            if (ok) go(true);
          }
        );
      } else go(false);
    } else if (name === 'saveStatement') {
      var n = p.statementNo;
      act(
        'updateStatement',
        {
          statementNo: n,
          text: $('sT' + n).value,
          short: $('sS' + n).value,
          northPosition: $('sN' + n).value,
          southPosition: $('sP' + n).value
        },
        el
      ).then(function (d) {
        if (d) toast('Påstand ' + n + ' lagret', true);
      });
    } else if (name === 'saveSettings') {
      act(
        'updateSettings',
        {
          soundEnabled: $('setSound').checked,
          autoStartTimer: $('setAuto').checked,
          requireEqualTurnout: $('setEqual').checked,
          opening: Number($('dOpen').value),
          cross: Number($('dCross').value),
          closing: Number($('dClose').value),
          team: Number($('dTeam').value)
        },
        el
      ).then(function (d) {
        if (d) toast('Innstillinger lagret', true);
      });
    } else if (name === 'demo') {
      act('generateDemoVotes', { pollId: $('demoPoll').value, count: $('demoCount').value ? Number($('demoCount').value) : undefined }, el).then(function (d) {
        if (d && d.result) toast(d.result.count + ' demostemmer lagt til', true);
      });
    } else if (name === 'reloadAdmin') {
      adminRendered = false;
      /** @type {any} */ ($('tab-admin')).__html = '';
      render();
    } else if (name === 'logout') {
      cl.call('auth.logout', { session: session }).catch(function () {});
      cl.storage.remove('isq-session');
      session = null;
      showLogin('Du er logget ut.');
    } else if (name === 'copy') {
      var url = String(p.url || '');
      if (navigator.clipboard)
        navigator.clipboard.writeText(url).then(
          function () {
            toast('Lenke kopiert', true);
          },
          function () {
            toast(url);
          }
        );
      else toast(url);
    } else if (name === 'tab') {
      selectTab(p.tab);
    }
  }

  // ---------- Rendring ----------
  // Tegn ikke om en fane mens fingeren er på skjermen (hindrer tapte trykk på mobil)
  var pointerActive = false;
  var pendingRender = false;
  document.addEventListener(
    'pointerdown',
    function () {
      pointerActive = true;
    },
    true
  );
  ['pointerup', 'pointercancel'].forEach(function (ev) {
    document.addEventListener(
      ev,
      function () {
        setTimeout(function () {
          pointerActive = false;
          if (pendingRender) {
            pendingRender = false;
            render();
          }
        }, 250);
      },
      true
    );
  });
  /** @param {string} id @param {string} html @returns {boolean} om innholdet ble byttet */
  function setHtml(id, html) {
    var el = /** @type {any} */ ($(id));
    if (el.__html === html) return false;
    if (pointerActive) {
      pendingRender = true;
      return false;
    }
    el.innerHTML = html;
    el.__html = html;
    return true;
  }

  function renderConn() {
    var dot = $('connDot');
    dot.className = 'dot' + (online ? '' : ' off');
    $('connText').textContent = online ? 'Tilkoblet' : 'Frakoblet – prøver igjen';
  }

  function render() {
    if (!state) return;
    renderConn();
    renderHeader();
    if (currentTab === 'run') renderRun();
    if (currentTab === 'poll') renderPoll();
    if (currentTab === 'timer') renderTimer();
    if (currentTab === 'cards') renderCards();
    if (currentTab === 'results') renderResults();
    if (currentTab === 'media') renderMedia();
    if (currentTab === 'admin') renderAdmin();
  }

  function activePoll() {
    return state.poll;
  }

  function renderHeader() {
    $('appTitle').textContent = state.event.title + ' • Kontroll';
    var v = state.view === 'video' && state.video ? 'Video' : C.VIEW_LABELS[state.view] || state.view;
    if (['team', 'opening', 'closing'].indexOf(state.view) !== -1) v += ' ' + (state.activeTeam === 'north' ? 'Nord' : 'Sør');
    $('chipView').textContent = v;
    $('chipStatement').textContent = String(stNo()) + ' • ' + (statement(stNo()) || {}).short;
    var p = activePoll();
    $('chipPoll').textContent = p
      ? (p.status === 'open' ? 'ÅPEN ' : p.status === 'closed' ? 'Lukket ' : '') +
        (p.type === 'main' ? 'Hoved' : 'P' + p.statementNo) +
        (p.phase === 'before' ? ' før' : ' etter')
      : '–';
    $('chipVotes').textContent = p ? String(p.count) : '0';
    $('chipScore').textContent = state.leaderboard.north + ' – ' + state.leaderboard.south;
  }

  function renderRun() {
    var n = stNo();
    var s = statement(n) || {};
    var nx = state.nextStep;
    var cues = state.cues || [];
    var cur = cues[state.cueIndex];
    var d = state.settings.durations;
    var p = activePoll();
    var inSegment = !!state.segment && ['opening', 'cross', 'closing'].indexOf(state.view) !== -1;
    var h = '';

    // Neste steg i kjøreplanen
    h += '<h2>Kjøreplan</h2><div class="card next">';
    h += '<div class="now">Sist utført: <b>' + (cur ? esc(cur.step + '. ' + cur.label) : 'ingenting ennå') + '</b></div>';
    if (nx) {
      h += '<div class="nextLabel">Neste: <b>' + esc(nx.step + '. ' + nx.label) + '</b></div>';
      h += '<button type="button" class="btn gold big" data-act="nextCue" data-p="{}" id="nextBtn">NESTE ▶︎</button>';
    } else {
      h += '<div class="nextLabel">Kjøreplanen er fullført.</div>';
    }
    if (inSegment) h += '<div style="height:8px"></div>' + btn('Tilbake til påstand ' + n, 'showStatement', { statementNo: n }, { cls: 'big' });
    h += '</div>';

    // Hele kjøreplanen – trykk for å hoppe
    h +=
      '<details class="card cueList"' +
      (cueListOpen ? ' open' : '') +
      '><summary>Hele kjøreplanen (' +
      cues.length +
      ' steg) – trykk et steg for å hoppe dit</summary><ol>';
    cues.forEach(function (/** @type {any} */ c) {
      var cls = c.index === state.cueIndex ? ' current' : c.index < state.cueIndex ? ' done' : '';
      h +=
        '<li><button type="button" class="cue' +
        cls +
        '" data-act="runCue" data-p="' +
        esc(JSON.stringify({ index: c.index })) +
        '"><span class="st">' +
        esc(c.step) +
        '</span>' +
        esc(c.label) +
        '</button></li>';
    });
    h += '</ol></details>';

    // Enkeltknapper i samme rekkefølge som innslaget
    h +=
      '<h2>Start</h2><div class="grid">' +
      btn('1. Forside', 'setView', { view: 'hero' }) +
      btn('2. Hovedspørsmål', 'setView', { view: 'mainQuestion' }) +
      btn(
        '3. Åpne avstemning',
        'openPoll',
        { pollId: 'main-before', showQr: true },
        { cls: 'gold', sub: 'Hovedspørsmål • ' + state.polls['main-before'].count + ' stemmer' }
      ) +
      btn('4. Lukk avstemning', 'closePoll', { pollId: 'main-before' }, { disabled: state.polls['main-before'].status !== 'open', sub: '→ debattregler' }) +
      btn('5. Debattregler', 'setView', { view: 'rules' }) +
      btn('6. Introvideo Nord', 'playVideo', { key: 'introNorth' }, { cls: 'blue', sub: '→ tilbake til regler' }) +
      btn('7. Introvideo Sør', 'playVideo', { key: 'introSouth' }, { cls: 'red span2', sub: '→ påstand 1' }) +
      '</div>';

    h += '<h2>Velg påstand</h2><div class="seg">';
    [1, 2, 3].forEach(function (i) {
      h += btn('Påstand ' + i, 'selectStatement', { statementNo: i }, { cls: i === n ? 'on' : '' });
    });
    h +=
      '</div><p class="small muted" style="margin:6px 4px 0">' +
      esc(s.text || '') +
      '<br>' +
      esc(teamName('north')) +
      ': <b>' +
      pos(s.northPosition) +
      '</b> • ' +
      esc(teamName('south')) +
      ': <b>' +
      pos(s.southPosition) +
      '</b></p>';

    var before = 's' + n + '-before';
    var after = 's' + n + '-after';
    /** @param {string} id */
    var pollSub = function (id) {
      return state.polls[id].count + ' stemmer • ' + STATUS_LABEL[/** @type {'open'} */ (state.polls[id].status)];
    };
    h +=
      '<h2>Påstand ' +
      n +
      '</h2><div class="grid">' +
      btn('Ekstravideo ' + n, 'playVideo', { key: 'extra' + n }, { sub: '→ påstand ' + n }) +
      btn('Vis påstand ' + n, 'showStatement', { statementNo: n }, { cls: 'gold' }) +
      btn('Åpne før-avstemning', 'openPoll', { pollId: before, showQr: true }, { cls: 'gold', sub: pollSub(before) }) +
      btn('Lukk før-avstemning', 'closePoll', { pollId: before }, { disabled: state.polls[before].status !== 'open', sub: '→ påstand ' + n }) +
      btn('Åpningsinnlegg Nord', 'startSegment', { kind: 'opening', team: 'north' }, { cls: 'blue', sub: T.format(d.opening) + ' • går i minus' }) +
      btn('Åpningsinnlegg Sør', 'startSegment', { kind: 'opening', team: 'south' }, { cls: 'red', sub: T.format(d.opening) + ' • går i minus' }) +
      btn('Kryssforhør Nord', 'startSegment', { kind: 'cross', team: 'north' }, { cls: 'blue', sub: T.format(d.cross) + ' • går i minus' }) +
      btn('Kryssforhør Sør', 'startSegment', { kind: 'cross', team: 'south' }, { cls: 'red', sub: T.format(d.cross) + ' • går i minus' }) +
      btn('Sluttappell Nord', 'startSegment', { kind: 'closing', team: 'north' }, { cls: 'blue', sub: T.format(d.closing) + ' • → påstand' }) +
      btn('Sluttappell Sør', 'startSegment', { kind: 'closing', team: 'south' }, { cls: 'red', sub: T.format(d.closing) + ' • → påstand' }) +
      btn('Tilbake til påstand ' + n, 'showStatement', { statementNo: n }, { cls: 'span2' }) +
      btn('Åpne etter-avstemning', 'openPoll', { pollId: after, showQr: true }, { cls: 'gold', sub: pollSub(after) }) +
      btn('Lukk etter-avstemning', 'closePoll', { pollId: after }, { disabled: state.polls[after].status !== 'open', sub: '→ resultat runde ' + n }) +
      btn('Vis resultat runde ' + n, 'showResult', { statementNo: n }, { cls: 'green' }) +
      btn('Vis leaderboard', 'setView', { view: 'leaderboard' }, { cls: 'green' }) +
      '</div>';

    h +=
      '<h2>Avslutning</h2><div class="grid">' +
      btn('20. Kår vinner', 'setView', { view: 'winner' }, { cls: 'green span2' }) +
      btn(
        '21. Åpne avstemning',
        'openPoll',
        { pollId: 'main-after', showQr: true },
        { cls: 'gold', sub: 'Hovedspørsmål etter • ' + state.polls['main-after'].count + ' stemmer' }
      ) +
      btn(
        '22. Lukk avstemning',
        'closePoll',
        { pollId: 'main-after' },
        { disabled: state.polls['main-after'].status !== 'open', sub: '→ resultat hovedspørsmål' }
      ) +
      '</div>';

    h +=
      '<h2>Annet</h2><div class="grid">' +
      btn(
        'Lukk aktiv avstemning',
        'closePoll',
        {},
        { disabled: !(p && p.status === 'open'), sub: p && p.status === 'open' ? POLL_NAMES[/** @type {'s1-before'} */ (p.id)] : 'Ingen åpen' }
      ) +
      btn('Vis QR-kode', 'showQr', {}) +
      btn('Vis Lag Nord', 'showTeam', { team: 'north' }, { cls: 'blue' }) +
      btn('Vis Lag Sør', 'showTeam', { team: 'south' }, { cls: 'red' }) +
      btn('Svart skjerm', 'setView', { view: 'black' }, { cls: 'danger span2' }) +
      '</div>';
    setHtml('tab-run', h);
    var det = document.querySelector('#tab-run details.cueList');
    if (det) {
      det.addEventListener('toggle', function () {
        cueListOpen = /** @type {HTMLDetailsElement} */ (det).open;
      });
    }
  }
  var cueListOpen = false;

  /** @param {any} p */
  function bars(p) {
    if (!p.distribution) return '';
    return (
      '<div class="bars">' +
      CH.map(function (c) {
        var n = p.distribution[c] || 0;
        var pct = p.count ? Math.round((n / p.count) * 100) : 0;
        return '<div class="' + c + '"><span>' + esc(p.labels[c]) + '</span><i style="width:' + pct + '%"></i><span class="num">' + n + '</span></div>';
      }).join('') +
      '</div>'
    );
  }

  /** @param {string} id */
  function pollCard(id) {
    var p = state.polls[id];
    var h =
      '<div class="card pollRow"><div class="pollHead"><b>' +
      esc(POLL_NAMES[/** @type {'s1-before'} */ (id)]) +
      '</b><span><span class="num">' +
      p.count +
      '</span> <span class="pill ' +
      p.status +
      '">' +
      STATUS_LABEL[/** @type {'open'} */ (p.status)] +
      '</span></span></div>';
    if (p.demo) h += '<div class="small" style="color:var(--gold)">Inkluderer ' + p.demo + ' demostemmer</div>';
    h += bars(p);
    h += '<div class="grid grid3">';
    if (p.status === 'open') h += btn('Lukk', 'closePoll', { pollId: id }, { cls: 'gold' });
    else h += btn(p.status === 'closed' ? 'Åpne igjen' : 'Åpne', 'openPoll', { pollId: id, showQr: true }, { cls: 'green' });
    h += btn('Vis QR', 'showQr', { pollId: id });
    h += btn(
      'Nullstill',
      'resetPoll',
      { pollId: id },
      {
        cls: 'danger',
        title: 'Nullstill avstemning',
        confirm:
          'Alle ' +
          p.count +
          ' stemmer i «' +
          POLL_NAMES[/** @type {'s1-before'} */ (id)] +
          '» slettes, og et eventuelt rundeResultat fjernes. Dette kan ikke angres.'
      }
    );
    h += '</div></div>';
    return h;
  }

  var qrLinksHtml = '';
  function renderPoll() {
    var p = activePoll();
    var h = '<h2>Aktiv avstemning</h2><div class="card">';
    if (p) {
      h +=
        '<div class="pollHead"><b>' +
        esc(POLL_NAMES[/** @type {'s1-before'} */ (p.id)]) +
        '</b><span class="pill ' +
        p.status +
        '">' +
        STATUS_LABEL[/** @type {'open'} */ (p.status)] +
        '</span></div>' +
        '<div class="bigTimer" aria-live="polite">' +
        p.count +
        '<span class="small muted" style="font-size:16px;letter-spacing:0"> stemmer</span></div>';
      h +=
        '<div class="grid">' +
        (p.status === 'open'
          ? btn('Lukk avstemning', 'closePoll', { pollId: p.id }, { cls: 'gold big' })
          : btn('Åpne igjen', 'reopenPoll', { pollId: p.id }, { cls: 'green big' })) +
        btn('Vis QR på skjerm', 'showQr', { pollId: p.id }, { cls: 'big' }) +
        btn(
          state.revealDistribution ? 'Skjul fordeling på skjerm' : 'Vis fordeling på skjerm',
          'setReveal',
          { reveal: !state.revealDistribution },
          { cls: 'span2' + (state.revealDistribution ? ' on' : '') }
        ) +
        '</div>';
      h += '<p class="small muted">Fordelingen er skjult på storskjermen til du velger å vise den. I kontrollflaten vises den når avstemningen er lukket.</p>';
    } else {
      h += '<p class="muted">Ingen avstemning er aktiv.</p>';
    }
    h += '</div>';
    h += '<h2>Hovedspørsmålet</h2>' + pollCard('main-before') + pollCard('main-after');
    [1, 2, 3].forEach(function (n) {
      h += '<h2>Påstand ' + n + '</h2>' + pollCard('s' + n + '-before') + pollCard('s' + n + '-after');
    });
    if (!qrLinksHtml) {
      var items = [
        ['main', 'Hovedspørsmålet'],
        ['s1', 'Påstand 1'],
        ['s2', 'Påstand 2'],
        ['s3', 'Påstand 3']
      ];
      qrLinksHtml =
        '<div class="qrs">' +
        items
          .map(function (it) {
            var url = cl.voteUrl(it[0]);
            var svg = '';
            try {
              svg = Q.toSvg(url, { margin: 2 });
            } catch (e) {
              svg = '';
            }
            return (
              '<div class="qrItem">' +
              svg +
              '<div>' +
              esc(it[1]) +
              '</div><a href="' +
              esc(url) +
              '" target="_blank" rel="noopener">Åpne</a> • ' +
              '<a href="#" data-act="ui:copy" data-p="' +
              esc(JSON.stringify({ url: url })) +
              '">Kopier</a></div>'
            );
          })
          .join('') +
        '</div>';
    }
    h +=
      '<h2>Reserve: direktelenker</h2><details class="card"><summary>Vis separate QR-koder</summary><p class="small muted">Hovedlenken på storskjermen åpner alltid den aktive avstemningen. Disse lenkene låser seg til ett spørsmål og viser før- eller etter-avstemningen som er åpen.</p>' +
      qrLinksHtml +
      '<p class="small muted" style="word-break:break-all">Fast lenke: ' +
      esc(cl.voteUrl()) +
      '</p></details>';
    var open = document.querySelector('#tab-poll details');
    var wasOpen = open && /** @type {HTMLDetailsElement} */ (open).open;
    if (!setHtml('tab-poll', h)) return;
    if (wasOpen) /** @type {HTMLDetailsElement} */ (document.querySelector('#tab-poll details')).open = true;
  }

  function renderTimer() {
    var t = state.timer;
    var h =
      '<h2>Timer</h2><div class="card"><div id="bigTimer" class="bigTimer">--:--</div>' +
      '<div class="small muted" style="text-align:center;margin-bottom:10px">Status: <b id="timerStatus"></b></div><div class="grid">';
    if (t.status === 'running') h += btn('Pause', 'timerPause', {}, { cls: 'gold big' });
    else if (t.status === 'paused') h += btn('Fortsett', 'timerResume', {}, { cls: 'green big' });
    else h += btn('Start', 'timerStart', {}, { cls: 'green big' });
    h +=
      btn('Nullstill', 'timerReset', {}, { cls: 'big' }) +
      btn('−10 sek', 'timerAdjust', { delta: -10 }) +
      btn('+10 sek', 'timerAdjust', { delta: 10 }) +
      btn('+1 minutt', 'timerAdjust', { delta: 60 }, { cls: 'span2 gold' }) +
      '</div></div>';
    h +=
      '<h2>Valgfri tid</h2><div class="card"><div class="grid"><div><label for="tMin">Minutter</label><input id="tMin" type="number" inputmode="numeric" min="0" value="' +
      (Number(cl.storage.get('isq-tmin')) || 2) +
      '"></div><div><label for="tSec">Sekunder</label><input id="tSec" type="number" inputmode="numeric" min="0" max="59" value="' +
      (Number(cl.storage.get('isq-tsec')) || 0) +
      '"></div>' +
      btn('Sett tid', 'ui:customTime', {}) +
      btn('Start med tiden', 'ui:customStart', {}, { cls: 'green' }) +
      '</div></div>';
    var d = state.settings.durations;
    h +=
      '<h2>Debattdeler</h2><div class="grid">' +
      btn('Åpningsinnlegg Nord', 'startSegment', { kind: 'opening', team: 'north' }, { cls: 'blue', sub: T.format(d.opening) }) +
      btn('Åpningsinnlegg Sør', 'startSegment', { kind: 'opening', team: 'south' }, { cls: 'red', sub: T.format(d.opening) }) +
      btn('Kryssforhør Nord', 'startSegment', { kind: 'cross', team: 'north' }, { cls: 'blue', sub: T.format(d.cross) }) +
      btn('Kryssforhør Sør', 'startSegment', { kind: 'cross', team: 'south' }, { cls: 'red', sub: T.format(d.cross) }) +
      btn('Sluttappell Nord', 'startSegment', { kind: 'closing', team: 'north' }, { cls: 'blue', sub: T.format(d.closing) }) +
      btn('Sluttappell Sør', 'startSegment', { kind: 'closing', team: 'south' }, { cls: 'red', sub: T.format(d.closing) }) +
      '</div><p class="small muted">' +
      (state.settings.autoStartTimer ? 'Timeren starter automatisk når en debattdel vises.' : 'Timeren lastes, men må startes manuelt.') +
      '</p>';
    var mi = document.activeElement && /** @type {HTMLElement} */ (document.activeElement).id;
    if (mi === 'tMin' || mi === 'tSec') {
      cl.storage.set('isq-tmin', $('tMin').value);
      cl.storage.set('isq-tsec', $('tSec').value);
      // Ikke tegn skjemaet på nytt mens brukeren skriver
      return;
    }
    setHtml('tab-timer', h);
    tickTimers();
  }
  document.addEventListener('input', function (e) {
    var id = /** @type {HTMLElement} */ (e.target).id;
    if (id === 'tMin' || id === 'tSec') cl.storage.set(id === 'tMin' ? 'isq-tmin' : 'isq-tsec', /** @type {HTMLInputElement} */ (e.target).value);
  });

  function renderCards() {
    var h = '';
    ['north', 'south'].forEach(function (team) {
      h += '<h2>' + esc(teamName(team)) + '</h2><div class="grid grid1">';
      C.CARDS.forEach(function (c) {
        var used = state.cards[team][c.key];
        if (used) {
          h +=
            '<button type="button" class="btn cardBtn used" data-act="revertCard" data-p="' +
            esc(JSON.stringify({ id: used.id })) +
            '" data-title="Angre kortbruk" data-confirm="' +
            esc('Registrer ' + c.name + ' for ' + teamName(team) + ' som ubrukt igjen?' + (c.key === 'green' ? ' Ekstraminuttet trekkes fra timeren.' : '')) +
            '">' +
            '<span class="ic" aria-hidden="true">' +
            c.icon +
            '</span><span>' +
            esc(c.name + ' – ' + c.title) +
            '<small>Brukt kl. ' +
            clock(used.usedAt) +
            ' • trykk for å angre</small></span></button>';
        } else {
          h +=
            '<button type="button" class="btn cardBtn ' +
            (team === 'north' ? 'blue' : 'red') +
            '" data-act="useCard" data-p="' +
            esc(JSON.stringify({ team: team, key: c.key })) +
            '">' +
            '<span class="ic" aria-hidden="true">' +
            c.icon +
            '</span><span>' +
            esc(c.name + ' – ' + c.title) +
            '<small>' +
            esc(c.text) +
            '</small></span></button>';
        }
      });
      h += '</div>';
    });
    h += '<h2>Skjerm</h2><div class="grid">' + btn('Vis spillekort og regler', 'setView', { view: 'rules' }, { cls: 'span2' }) + '</div>';
    setHtml('tab-cards', h);
  }

  function renderResults() {
    var lb = state.leaderboard;
    var h =
      '<h2>Leaderboard</h2><div class="card"><div class="score"><div><div class="north"><b>' +
      esc(teamName('north')) +
      '</b></div><div class="n north">' +
      lb.north +
      '</div></div><div><div class="south"><b>' +
      esc(teamName('south')) +
      '</b></div><div class="n south">' +
      lb.south +
      '</div></div></div>' +
      '<p class="small muted" style="text-align:center">Netto flyttede stemmesteg, kun godkjente runder.</p><div class="grid">' +
      btn('Vis leaderboard', 'setView', { view: 'leaderboard' }, { cls: 'green span2' }) +
      '</div></div>';

    [1, 2, 3].forEach(function (n) {
      var s = statement(n);
      var r = state.results[String(n)];
      var b = state.polls['s' + n + '-before'];
      var a = state.polls['s' + n + '-after'];
      h += '<h2>Påstand ' + n + ' • ' + esc(s.short) + '</h2><div class="card">';
      h +=
        '<div class="small muted">' +
        esc(teamName('north')) +
        ': <b>' +
        pos(s.northPosition) +
        '</b> • ' +
        esc(teamName('south')) +
        ': <b>' +
        pos(s.southPosition) +
        '</b></div>';
      h +=
        '<div class="small" style="margin:6px 0">Før: <b class="num">' +
        b.count +
        '</b> (' +
        STATUS_LABEL[/** @type {'open'} */ (b.status)] +
        ') • Etter: <b class="num">' +
        a.count +
        '</b> (' +
        STATUS_LABEL[/** @type {'open'} */ (a.status)] +
        ')</div>';
      if (r) {
        var modeTxt = r.mode === 'normalized' ? 'Normalisert' : r.mode === 'manual' ? 'Manuelt overstyrt' : 'Standard';
        h +=
          '<div class="row"><span class="pill ' +
          r.status +
          '">' +
          (r.status === 'approved' ? 'I LEADERBOARD' : 'VENTER PÅ AVGJØRELSE') +
          '</span><span class="small muted">' +
          modeTxt +
          (r.demo ? ' • DEMO' : '') +
          '</span></div>';
        if (r.mode !== 'manual') {
          h +=
            '<div class="small" style="margin-top:8px">Før: MOT ' +
            r.before.against +
            ' / NØYTRAL ' +
            r.before.neutral +
            ' / FOR ' +
            r.before['for'] +
            ' (score ' +
            r.beforeScore +
            ')<br>' +
            'Etter: MOT ' +
            r.after.against +
            ' / NØYTRAL ' +
            r.after.neutral +
            ' / FOR ' +
            r.after['for'] +
            ' (score ' +
            r.afterScore +
            ')<br>' +
            'Netto flyttede stemmesteg: <b class="num">' +
            (r.netMovement > 0 ? '+' : '') +
            r.netMovement +
            '</b>' +
            (r.mode === 'normalized' ? ' (rå: ' + r.rawNetMovement + ')' : '') +
            '</div>';
        } else {
          h += '<div class="small" style="margin-top:8px">Begrunnelse: ' + esc(r.overrideReason || '') + '</div>';
        }
        if (r.status === 'pending') h += '<div class="small muted" style="margin-top:8px">Foreløpig standardberegning – ikke godkjent:</div>';
        h +=
          '<div class="score" style="margin-top:8px"><div><div class="small north">Nord</div><div class="n north" style="font-size:32px">' +
          r.north +
          '</div></div><div><div class="small south">Sør</div><div class="n south" style="font-size:32px">' +
          r.south +
          '</div></div></div>';
        if (r.status === 'pending') {
          h +=
            '<div class="warnBox"><b>⚠︎ Ulikt antall stemmer før (' +
            r.beforeTotal +
            ') og etter (' +
            r.afterTotal +
            ').</b><br>Resultatet er ikke lagt til i leaderboardet. Velg:</div><div class="grid grid1">' +
            btn('1. Vent på flere stemmer', 'reopenPoll', { pollId: 's' + n + '-after' }, { sub: 'Åpner etter-avstemningen igjen' }) +
            btn(
              '2. Godkjenn normalisert beregning',
              'approveResult',
              { statementNo: n, mode: 'normalized' },
              { cls: 'gold', sub: 'Merkes tydelig som normalisert' }
            ) +
            btn('3. Overstyr resultat manuelt', 'ui:override', { statementNo: n }, { cls: 'danger' }) +
            '</div>';
        }
      } else {
        h += '<p class="small muted">Ikke beregnet.</p>';
      }
      h +=
        '<div class="grid" style="margin-top:8px">' +
        btn(
          r ? 'Beregn på nytt' : 'Beregn resultat',
          'computeResult',
          { statementNo: n },
          { cls: 'green', disabled: b.status !== 'closed' || a.status !== 'closed' }
        ) +
        btn('Vis på skjerm', 'showResult', { statementNo: n }, { disabled: !r }) +
        (r && r.status === 'approved' ? btn('Overstyr', 'ui:override', { statementNo: n }) : '') +
        (r
          ? btn(
              'Fjern resultat',
              'clearResult',
              { statementNo: n },
              { cls: 'danger', title: 'Fjern resultat', confirm: 'Resultatet for påstand ' + n + ' fjernes fra leaderboardet. Stemmene beholdes.' }
            )
          : '') +
        '</div></div>';
    });

    var m = state.mainResult;
    h += '<h2>Hovedspørsmålet (teller ikke)</h2><div class="card">';
    if (m) {
      h +=
        '<div class="small">Før (' +
        m.beforeTotal +
        '): ' +
        CH.map(function (c) {
          return esc(m.labels[c]) + ' ' + m.before[c];
        }).join(' / ') +
        '<br>' +
        'Etter (' +
        m.afterTotal +
        '): ' +
        CH.map(function (c) {
          return esc(m.labels[c]) + ' ' + m.after[c];
        }).join(' / ') +
        '</div>';
    }
    h += '<div class="grid" style="margin-top:8px">' + btn('Vis hovedresultat', 'setView', { view: 'mainResult' }, { cls: 'green span2' }) + '</div></div>';
    setHtml('tab-results', h);
  }

  function renderMedia() {
    var d = state.display;
    var h = '<h2>Publikumsskjerm</h2><div class="card">';
    if (d) {
      var ago = Math.max(0, Math.round((cl.serverNow() - d.at) / 1000));
      var ok = ago < 30;
      h +=
        '<div class="row"><span><span class="dot' +
        (ok ? '' : ' off') +
        '"></span> ' +
        (ok ? 'Tilkoblet' : 'Ikke sett på ' + ago + ' s') +
        '</span><span class="small muted">sist sett for ' +
        ago +
        ' s siden</span></div>';
      if (d.missing) h += '<div class="warnBox small"><b>Mangler filer i skjermmappen:</b><br>' + esc(d.missing) + '</div>';
      else h += '<div class="small muted" style="margin-top:6px">Ingen manglende mediefiler rapportert.</div>';
    } else {
      h += '<p class="small muted">Publikumsskjermen har ikke meldt seg ennå. Åpne index.html i skjermmappen på Mac-en og trykk «Start publikumsskjerm».</p>';
    }
    h += '</div>';

    var v = state.video;
    h += '<h2>Video nå</h2><div class="card">';
    if (v) {
      var vid = C.VIDEOS.filter(function (x) {
        return x.key === v.key;
      })[0];
      h +=
        '<div class="row"><b>' +
        esc(vid ? vid.label : v.key) +
        '</b><span class="pill ' +
        (v.status === 'playing' ? 'open' : 'closed') +
        '">' +
        (v.status === 'playing' ? 'SPILLER' : 'PAUSE') +
        '</span></div><div class="grid" style="margin-top:8px">' +
        (v.status === 'playing' ? btn('Pause', 'pauseVideo', {}, { cls: 'gold big' }) : btn('Fortsett', 'resumeVideo', {}, { cls: 'green big' })) +
        btn('Stopp', 'stopVideo', {}, { cls: 'danger big' }) +
        '</div><p class="small muted">Når videoen er ferdig, går skjermen tilbake til forrige visning.</p>';
    } else {
      h += '<p class="small muted">Ingen video spilles.</p>';
    }
    h += '</div><h2>Videoer</h2><div class="grid">';
    C.VIDEOS.forEach(function (x) {
      h += btn(x.label, 'playVideo', { key: x.key }, { cls: x.team === 'north' ? 'blue' : x.team === 'south' ? 'red' : '' });
    });
    h += '</div><h2>Musikk</h2><div class="grid">';
    C.MUSIC.forEach(function (x) {
      h += btn(x.label, 'playMusic', { key: x.key }, { cls: state.music && state.music.key === x.key ? 'on' : '' });
    });
    h += btn('Stopp musikk', 'stopMusic', {}, { cls: 'danger', disabled: !state.music }) + '</div>';
    h +=
      '<h2>Skjerm</h2><div class="grid">' +
      btn('Svart skjerm', 'setView', { view: 'black' }, { cls: 'danger' }) +
      btn('Vis hero', 'setView', { view: 'hero' }) +
      '</div>' +
      '<p class="small muted">Fullskjerm styres på Mac-en: klikk «Start publikumsskjerm» eller trykk F i skjermvinduet.</p>';
    setHtml('tab-media', h);
  }

  function renderAdmin() {
    var logHtml = (state.log || [])
      .map(function (/** @type {any} */ l) {
        return esc(clock(l.at) + '  ' + l.actor + '  ' + l.action + '  ' + (typeof l.payload === 'string' ? l.payload : JSON.stringify(l.payload || {})));
      })
      .join('<br>');
    if (adminRendered) {
      var logEl = $('auditLog');
      if (logEl) logEl.innerHTML = logHtml || 'Ingen hendelser.';
      var st = $('statusNow');
      if (st) st.textContent = state.event.statusLabel;
      return;
    }
    var e = state.eventConfig;
    var s = state.settings;
    var h =
      '<h2>Arrangement</h2><div class="card">' +
      '<label for="aTitle">Tittel</label><input id="aTitle" value="' +
      esc(e.title) +
      '">' +
      '<label for="aHero">Tittel på forsiden</label><input id="aHero" value="' +
      esc(e.heroTitle || '') +
      '">' +
      '<label for="aKicker">Overtekst</label><input id="aKicker" value="' +
      esc(e.kicker) +
      '">' +
      '<label for="aMain">Hovedspørsmål</label><textarea id="aMain">' +
      esc(e.mainQuestion) +
      '</textarea>' +
      '<div class="grid wide3"><div><label for="aLA">Svar 1 (MOT-siden)</label><input id="aLA" value="' +
      esc(e.mainLabels.against) +
      '"></div>' +
      '<div><label for="aLN">Svar 2 (nøytral)</label><input id="aLN" value="' +
      esc(e.mainLabels.neutral) +
      '"></div>' +
      '<div><label for="aLF">Svar 3 (FOR-siden)</label><input id="aLF" value="' +
      esc(e.mainLabels['for']) +
      '"></div></div>' +
      '<label for="aSlug">Arrangement-ID (brukes i ?event=)</label><input id="aSlug" value="' +
      esc(e.slug) +
      '" autocapitalize="off">' +
      '<div style="height:10px"></div>' +
      btn('Lagre arrangement', 'ui:saveEvent', {}, { cls: 'green' }) +
      '</div>';

    h += '<h2>Påstander og lagposisjoner</h2>';
    state.statements.forEach(function (/** @type {any} */ st) {
      var n = st.no;
      /** @param {string} id @param {string} v */
      var sel = function (id, v) {
        return (
          '<select id="' +
          id +
          '"><option value="for"' +
          (v === 'for' ? ' selected' : '') +
          '>FOR</option><option value="against"' +
          (v === 'against' ? ' selected' : '') +
          '>MOT</option></select>'
        );
      };
      h +=
        '<div class="card"><b>Påstand ' +
        n +
        '</b><label for="sT' +
        n +
        '">Tekst</label><textarea id="sT' +
        n +
        '">' +
        esc(st.text) +
        '</textarea>' +
        '<label for="sS' +
        n +
        '">Kortnavn</label><input id="sS' +
        n +
        '" value="' +
        esc(st.short) +
        '">' +
        '<div class="grid"><div><label for="sN' +
        n +
        '">' +
        esc(teamName('north')) +
        '</label>' +
        sel('sN' + n, st.northPosition) +
        '</div>' +
        '<div><label for="sP' +
        n +
        '">' +
        esc(teamName('south')) +
        '</label>' +
        sel('sP' + n, st.southPosition) +
        '</div></div>' +
        '<div style="height:10px"></div>' +
        btn('Lagre påstand ' + n, 'ui:saveStatement', { statementNo: n }, { cls: 'green' }) +
        '</div>';
    });

    var d = s.durations;
    h +=
      '<h2>Innstillinger</h2><div class="card">' +
      '<label class="check"><input type="checkbox" id="setSound"' +
      (s.soundEnabled ? ' checked' : '') +
      '> Lydsignal når timeren når 0</label>' +
      '<label class="check"><input type="checkbox" id="setAuto"' +
      (s.autoStartTimer ? ' checked' : '') +
      '> Start timer automatisk ved debattdel</label>' +
      '<label class="check"><input type="checkbox" id="setEqual"' +
      (s.requireEqualTurnout !== false ? ' checked' : '') +
      '> Krev likt antall stemmer før og etter (anbefalt)</label>' +
      '<div class="grid"><div><label for="dOpen">Åpningsinnlegg (sek)</label><input id="dOpen" type="number" inputmode="numeric" value="' +
      d.opening +
      '"></div>' +
      '<div><label for="dCross">Kryssforhør (sek)</label><input id="dCross" type="number" inputmode="numeric" value="' +
      d.cross +
      '"></div>' +
      '<div><label for="dClose">Sluttappell (sek)</label><input id="dClose" type="number" inputmode="numeric" value="' +
      d.closing +
      '"></div>' +
      '<div><label for="dTeam">Lagpresentasjon (sek)</label><input id="dTeam" type="number" inputmode="numeric" value="' +
      d.team +
      '"></div></div>' +
      '<div style="height:10px"></div>' +
      btn('Lagre innstillinger', 'ui:saveSettings', {}, { cls: 'green' }) +
      '</div>';

    h +=
      '<h2>Demo-modus</h2><div class="card"><p class="small muted">Genererer merkede eksempelstemmer slik at hele flyten kan testes uten publikum. Storskjermen viser «DEMO» mens demodata finnes.</p>' +
      '<label for="demoPoll">Avstemning</label><select id="demoPoll">' +
      C.POLL_IDS.map(function (id) {
        return (
          '<option value="' +
          id +
          '"' +
          (id === (state.poll && state.poll.id) ? ' selected' : '') +
          '>' +
          esc(POLL_NAMES[/** @type {'s1-before'} */ (id)]) +
          '</option>'
        );
      }).join('') +
      '</select><label for="demoCount">Antall (tomt = 40, eller samme som før-avstemningen)</label><input id="demoCount" type="number" inputmode="numeric" min="1" max="500">' +
      '<div class="grid" style="margin-top:10px">' +
      btn('Generer demostemmer', 'ui:demo', {}, { cls: 'gold' }) +
      btn(
        'Slett alle demodata',
        'clearDemo',
        {},
        { cls: 'danger', title: 'Slett demodata', confirm: 'Alle demostemmer og resultater beregnet med demostemmer slettes. Ekte stemmer beholdes.' }
      ) +
      '</div></div>';

    h +=
      '<h2>Lenker</h2><div class="card small" style="word-break:break-all">Stemmeside: <a href="' +
      esc(cl.voteUrl()) +
      '" target="_blank" rel="noopener" style="color:var(--north)">' +
      esc(cl.voteUrl()) +
      '</a>' +
      '<br><br>Supabase (config.js): <b>' +
      esc(BOOT.supabaseUrl || '') +
      '</b><br>Nettsted (siteUrl): <b>' +
      esc(cl.siteBase()) +
      '</b></div>';

    h += '<h2>Audit-logg</h2><div class="card"><div class="log" id="auditLog">' + (logHtml || 'Ingen hendelser.') + '</div></div>';

    h +=
      '<h2>Farlig sone</h2><div class="card"><div class="grid grid1">' +
      btn(
        'Nullstill hele arrangementet',
        'resetEvent',
        {},
        {
          cls: 'danger big',
          title: 'Nullstill arrangement',
          typed: 'NULLSTILL',
          confirm: 'Alle stemmer, resultater, kortbruk og timer slettes. Innstillinger og påstander beholdes. Dette kan ikke angres.'
        }
      ) +
      btn('Last inn verdier på nytt', 'ui:reloadAdmin', {}) +
      btn('Logg ut', 'ui:logout', {}) +
      '</div></div>';
    setHtml('tab-admin', h);
    adminRendered = /** @type {any} */ ($('tab-admin')).__html === h;
  }

  // ---------- Timer-visning ----------
  function tickTimers() {
    if (!state) return;
    var sec = T.remainingMs(state.timer, cl.serverNow()) / 1000;
    var signedSec = T.signedRemainingMs(state.timer, cl.serverNow()) / 1000;
    var ph = T.phase(sec);
    var seg = state.segment;
    var cfg = seg && C.SEGMENTS[seg.kind];
    var over = !!(cfg && cfg.overtime && state.timer.status === 'running' && signedSec <= -1);
    var text = over ? T.formatSigned(signedSec) : ph === 'done' ? 'TID' : T.format(sec);
    $('chipTimer').textContent = text;
    $('chipTimerK').textContent = state.timer.status === 'running' ? 'Timer • går' : state.timer.status === 'paused' ? 'Timer • pause' : 'Timer';
    var box = $('chipTimerBox');
    box.classList.toggle('warn', ph === 'warn');
    box.classList.toggle('danger', ph === 'danger' || ph === 'done' || over);
    var big = $('bigTimer');
    if (big) {
      big.textContent = text;
      big.className = 'bigTimer ' + (over ? 'over' : ph);
      $('timerStatus').textContent = state.timer.status === 'running' ? 'går' : state.timer.status === 'paused' ? 'pause' : 'klar';
    }
  }
  setInterval(tickTimers, 200);
  setInterval(function () {
    if (state && currentTab === 'media') renderMedia();
  }, 5000);

  // ---------- Oppstart ----------
  if (session) start();
  else showLogin();
})();
