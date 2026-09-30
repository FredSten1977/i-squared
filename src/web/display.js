// @ts-check
/* global ISQ_Config, ISQ_Timer, ISQ_QR, ISQ_Client */
/**
 * Publikumsskjerm. Henter tilstand fra serveren hvert sekund, beholder siste
 * kjente visning ved frakobling og regner timeren ut lokalt.
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
  var MEDIA = BOOT.media || {};

  var VIEW_SECTION = {
    hero: 'v-hero',
    mainQuestion: 'v-mainQuestion',
    statement: 'v-statement',
    qr: 'v-qr',
    team: 'v-speaker',
    opening: 'v-speaker',
    closing: 'v-speaker',
    cross: 'v-cross',
    result: 'v-result',
    leaderboard: 'v-leaderboard',
    mainResult: 'v-mainResult',
    winner: 'v-winner',
    rules: 'v-rules',
    video: 'v-video',
    black: 'v-black'
  };
  var CHOICES = ['against', 'neutral', 'for'];
  var CLIENT_ID = cl.storage.get('isq-display-id') || cl.randomToken(9);
  cl.storage.set('isq-display-id', CLIENT_ID);

  /** @type {any} */
  var state = null;
  var shownSection = '';
  var lastVersion = -1;
  var missing = /** @type {Record<string, boolean>} */ ({});
  /** @type {AudioContext|null} */
  var audioCtx = null;
  var audioUnlocked = false;

  // ---------- Skalering av 16:9-scenen ----------
  function scaleStage() {
    var s = Math.min(window.innerWidth / 1920, window.innerHeight / 1080);
    $('stage').style.transform = 'translate(-50%, -50%) scale(' + s + ')';
  }
  window.addEventListener('resize', scaleStage);
  scaleStage();

  // ---------- Media ----------
  /** @param {string} key */
  function mediaPath(key) {
    var m = MEDIA || {};
    if (key === 'hero') return m.hero || 'media/images/hero.jpg';
    if (key === 'north') return m.north || 'media/images/lagnord.jpg';
    if (key === 'south') return m.south || 'media/images/lagsør.jpg';
    var v = C.VIDEOS.filter(function (x) {
      return x.key === key;
    })[0];
    if (v) return (m.videos && m.videos[key]) || v.file;
    var mu = C.MUSIC.filter(function (x) {
      return x.key === key;
    })[0];
    if (mu) return (m.music && m.music[key]) || mu.file;
    return '';
  }

  /** Sang som spilles samtidig med en video (standard: introvideoene). @param {string} videoKey */
  var DEFAULT_SOUNDTRACKS = { introNorth: 'media/music/introlagnord.mp3', introSouth: 'media/music/introlagsør.mp3' };
  function soundtrackPath(videoKey) {
    var m = MEDIA || {};
    var map = m.soundtracks || DEFAULT_SOUNDTRACKS;
    return map[videoKey] || '';
  }
  /** Sekunder påstanden vises før en ekstravideo, hvis den ikke allerede står på skjermen. */
  var PREROLL_MS = Math.max(0, Number(MEDIA && MEDIA.statementBeforeVideoSeconds != null ? MEDIA.statementBeforeVideoSeconds : 5)) * 1000;
  var FADE_MS = Math.max(0, Number(MEDIA && MEDIA.soundtrackFadeSeconds != null ? MEDIA.soundtrackFadeSeconds : 3)) * 1000;
  var VIDEO_SOUND_WITH_SOUNDTRACK = !!(MEDIA && MEDIA.videoSoundWithSoundtrack);
  /** @param {string} path */
  function markMissing(path) {
    if (!missing[path]) {
      missing[path] = true;
      ping();
    }
  }

  (function loadHero() {
    var src = mediaPath('hero');
    var img = new Image();
    img.onload = function () {
      var bg = $('bg');
      bg.style.setProperty('--hero', 'url("' + encodeURI(src) + '")');
      bg.classList.add('has-hero');
    };
    img.onerror = function () {
      markMissing(src);
    };
    img.src = src;
  })();

  /** @type {Record<string, string>} */
  var teamImgState = {};
  /** @param {HTMLImageElement} img @param {HTMLElement} box @param {string} team */
  function setTeamImage(img, box, team) {
    var src = mediaPath(team);
    box.classList.toggle('missing', teamImgState[team] === 'missing');
    if (img.getAttribute('data-src') === src) return;
    img.setAttribute('data-src', src);
    img.onerror = function () {
      teamImgState[team] = 'missing';
      box.classList.add('missing');
      markMissing(src);
    };
    img.onload = function () {
      teamImgState[team] = 'ok';
      box.classList.remove('missing');
    };
    img.src = src;
  }

  // ---------- Lyd ----------
  function unlockAudio() {
    try {
      var AC = /** @type {any} */ (window).AudioContext || /** @type {any} */ (window).webkitAudioContext;
      if (AC && !audioCtx) audioCtx = new AC();
      if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
      audioUnlocked = true;
      $('muted').classList.remove('show');
      var p = $('player');
      if (p.src && !p.paused) p.muted = false;
    } catch (e) {
      /* ignorert */
    }
  }
  function beep() {
    if (!audioCtx || !state || !state.event.soundEnabled) return;
    var t0 = audioCtx.currentTime;
    [0, 0.35].forEach(function (d) {
      var o = /** @type {AudioContext} */ (audioCtx).createOscillator();
      var g = /** @type {AudioContext} */ (audioCtx).createGain();
      o.type = 'sine';
      o.frequency.value = 880;
      g.gain.setValueAtTime(0.0001, t0 + d);
      g.gain.exponentialRampToValueAtTime(0.5, t0 + d + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + d + 0.28);
      o.connect(g);
      g.connect(/** @type {AudioContext} */ (audioCtx).destination);
      o.start(t0 + d);
      o.stop(t0 + d + 0.3);
    });
  }

  // ---------- Startoverlegg og fullskjerm ----------
  function toggleFullscreen() {
    var d = /** @type {any} */ (document);
    if (!d.fullscreenElement && !d.webkitFullscreenElement) {
      var el = /** @type {any} */ (document.documentElement);
      (el.requestFullscreen || el.webkitRequestFullscreen || function () {}).call(el);
    } else {
      (d.exitFullscreen || d.webkitExitFullscreen || function () {}).call(d);
    }
  }
  $('startBtn').addEventListener('click', function () {
    unlockAudio();
    $('start').classList.add('hidden');
    try {
      toggleFullscreen();
    } catch (e) {
      /* ignorert */
    }
  });
  $('muted').addEventListener('click', unlockAudio);
  document.addEventListener('keydown', function (e) {
    if (e.key === 'f' || e.key === 'F') toggleFullscreen();
  });
  if (!BOOT.supabaseUrl) {
    $('startWarn').hidden = false;
    $('startWarn').textContent = 'Mangler adressen til Supabase. Åpne config.js i denne mappen og fyll inn supabaseUrl og supabaseKey.';
  }
  var cursorTimer = /** @type {any} */ (null);
  document.addEventListener('mousemove', function () {
    document.body.classList.remove('hide-cursor');
    clearTimeout(cursorTimer);
    cursorTimer = setTimeout(function () {
      document.body.classList.add('hide-cursor');
    }, 3000);
  });

  // ---------- Hjelpere ----------
  /** @param {string} team */
  function teamName(team) {
    return state && state.teams[team] ? state.teams[team].name : team === 'north' ? 'Lag Nord' : 'Lag Sør';
  }
  /** @param {number} no */
  function statementOf(no) {
    return (
      (state.statements || []).filter(function (/** @type {any} */ s) {
        return s.no === no;
      })[0] || { text: '', no: no }
    );
  }
  /** @param {string} p */
  function posLabel(p) {
    return p === 'for' ? 'FOR' : p === 'against' ? 'MOT' : String(p || '').toUpperCase();
  }
  /** @param {HTMLElement} el @param {string} text @param {number} limit */
  function setLongText(el, text, limit) {
    el.textContent = text;
    el.classList.toggle('long', text.length > limit);
  }
  /** @param {number} n */
  function signed(n) {
    return (n > 0 ? '+' : n < 0 ? '−' : '±') + Math.abs(n);
  }

  // ---------- Rendring ----------
  /** Visningen som skal vises nå, inkludert lokale overganger (video ferdig, sluttappell ute). */
  // Ekstravideo: påstanden skal alltid vises før videoen. Står den ikke allerede på skjermen,
  // vises den først i noen sekunder (f.eks. når videoen startes med en enkeltknapp).
  var preroll = { nonce: '', until: 0, no: 0 };
  var shownStatementNo = 0;
  /** @param {any} st */
  function checkPreroll(st) {
    var v = st.video;
    if (!v || st.view !== 'video' || v.nonce === preroll.nonce) return;
    preroll.nonce = v.nonce;
    preroll.until = 0;
    var cfg = C.VIDEOS.filter(function (x) {
      return x.key === v.key;
    })[0];
    var n = cfg && cfg.statement;
    if (n && PREROLL_MS && !(shownSection === 'v-statement' && shownStatementNo === n)) {
      preroll.until = Date.now() + PREROLL_MS;
      preroll.no = n;
    }
  }

  function effectiveView() {
    var st = state;
    var view = st.view;
    if (view === 'video' && pendingReturn && st.video && st.video.nonce === pendingReturn.nonce) {
      if (pendingReturn.statementNo) st.activeStatement = pendingReturn.statementNo;
      return pendingReturn.view;
    }
    if (view === 'video' && st.video && preroll.nonce === st.video.nonce && Date.now() < preroll.until) {
      st.activeStatement = preroll.no;
      return 'statement';
    }
    var seg = st.segment;
    var cfg = seg && C.SEGMENTS[seg.kind];
    if (cfg && cfg.autoReturn && view === seg.kind && st.timer.status === 'running') {
      if (T.signedRemainingMs(st.timer, cl.serverNow()) <= -C.AUTO_RETURN_GRACE_MS) return 'statement';
    }
    return view;
  }

  function render() {
    var st = state;
    var view = effectiveView();
    if (view === 'video' && !st.video) view = st.previousView || 'hero';
    var sectionId = VIEW_SECTION[/** @type {keyof typeof VIEW_SECTION} */ (view)] || 'v-hero';
    if (sectionId !== shownSection) {
      document.querySelectorAll('.view').forEach(function (e) {
        e.classList.remove('active');
      });
      $(sectionId).classList.add('active');
      shownSection = sectionId;
      if (sectionId === 'v-result') lastResultKey = '';
    }
    $('demo').classList.toggle('show', !!st.event.demo);

    // Hero
    $('heroKicker').textContent = st.event.kicker || '';
    // Forside: «I-Squared» med siste ledd i lagfarge
    var title = String(st.event.heroTitle || st.event.title || '');
    var cut = Math.max(title.lastIndexOf('-'), title.lastIndexOf(' '));
    $('heroTitle').innerHTML = cut > 0 ? esc(title.slice(0, cut + 1)) + '<span>' + esc(title.slice(cut + 1)) + '</span>' : esc(title);
    $('heroNorth').textContent = teamName('north').toUpperCase();
    $('heroSouth').textContent = teamName('south').toUpperCase();

    // Hovedspørsmål
    setLongText($('mqText'), st.event.mainQuestion, 120);

    // Påstand
    var s = statementOf(st.activeStatement);
    $('stNr').textContent = 'PÅSTAND ' + s.no;
    if (sectionId === 'v-statement') shownStatementNo = s.no;
    setLongText($('stText'), s.text, 110);
    $('stPositions').innerHTML =
      '<span><span class="north">' +
      esc(teamName('north')) +
      '</span> argumenterer <b>' +
      posLabel(s.northPosition) +
      '</b></span>' +
      '<span><span class="south">' +
      esc(teamName('south')) +
      '</span> argumenterer <b>' +
      posLabel(s.southPosition) +
      '</b></span>';

    if (sectionId === 'v-qr') renderQr();
    if (sectionId === 'v-speaker') renderSpeaker(view);
    if (sectionId === 'v-cross') renderCross();
    if (sectionId === 'v-result') renderResult();
    if (sectionId === 'v-leaderboard') renderLeaderboard();
    if (sectionId === 'v-mainResult') renderFinal();
    if (sectionId === 'v-winner') renderWinner();
    if (sectionId === 'v-rules') renderRules();
    syncVideo(view);
    syncMusic();
    handleFlash();
  }

  var qrCache = { url: '', svg: '' };
  function renderQr() {
    var p = state.qrPoll;
    if (!p) {
      $('qrLabel').textContent = 'AVSTEMNING';
      $('qrTitle').textContent = 'Ingen avstemning er valgt';
      $('qrAnswers').innerHTML = '';
      $('qrCount').textContent = '0';
      $('qrState').className = 'pollState';
      $('qrState').textContent = '';
      $('qrDist').innerHTML = '';
    } else {
      var phase = p.phase === 'before' ? 'FØR DEBATTEN' : 'ETTER DEBATTEN';
      $('qrLabel').textContent = (p.type === 'main' ? 'HOVEDSPØRSMÅL' : 'PÅSTAND ' + p.statementNo) + ' • ' + phase;
      setLongText($('qrTitle'), p.text, 120);
      $('qrAnswers').innerHTML = CHOICES.map(function (c) {
        return '<span class="answer">' + esc(p.labels[c]) + '</span>';
      }).join('');
      $('qrCount').textContent = String(p.count);
      var st = $('qrState');
      st.className = 'pollState ' + (p.status === 'open' ? 'open' : p.status === 'closed' ? 'closed' : '');
      st.textContent = p.status === 'open' ? 'AVSTEMNINGEN ER ÅPEN' : p.status === 'closed' ? 'AVSTEMNINGEN ER STENGT' : 'ÅPNER SNART';
      $('qrDist').innerHTML = p.distribution ? distBars(p.distribution, p.labels, p.count) : '';
    }
    var url = cl.voteUrl();
    if (qrCache.url !== url) {
      try {
        qrCache.svg = Q.toSvg(url, { margin: 2, title: 'QR-kode: ' + url });
      } catch (e) {
        qrCache.svg = '';
      }
      qrCache.url = url;
    }
    var box = $('qrBox');
    if (qrCache.svg && BOOT.supabaseUrl && /^https?:/.test(url)) {
      box.classList.remove('off');
      if (box.getAttribute('data-url') !== url) {
        box.innerHTML = qrCache.svg;
        box.setAttribute('data-url', url);
      }
    } else {
      box.classList.add('off');
      box.innerHTML = 'QR-kode mangler adresse.<br>Sett siteUrl i config.js';
      box.removeAttribute('data-url');
    }
  }

  /** @param {any} dist @param {any} labels @param {number} total */
  function distBars(dist, labels, total) {
    return CHOICES.map(function (c) {
      var n = dist[c] || 0;
      var pct = total ? Math.round((n / total) * 100) : 0;
      return (
        '<div class="distRow"><span>' +
        esc(labels[c]) +
        '</span><div class="bar"><i class="c-' +
        c +
        '" style="width:' +
        pct +
        '%"></i></div><span>' +
        n +
        '</span></div>'
      );
    }).join('');
  }

  /** @param {string} view */
  function renderSpeaker(view) {
    var team = view === 'team' ? state.activeTeam : (state.segment && state.segment.team) || state.activeTeam;
    var south = team === 'south';
    var card = $('speakerCard');
    card.className = 'speaker ' + (south ? 'southMode teamSouth' : 'teamNorth');
    var photo = $('spPhoto');
    photo.className = 'photo ' + (south ? 's' : 'n');
    $('spFallback').textContent = south ? 'S' : 'N';
    setTeamImage($('spImg'), photo, team);
    $('spImg').alt = teamName(team);
    $('spTeam').textContent = teamName(team).toUpperCase();
    $('spTeam').className = 'team ' + (south ? 'south' : 'north');
    var labels = { team: 'Lagpresentasjon', opening: 'Åpningsinnlegg', closing: 'Sluttappell' };
    $('spPhase').textContent = /** @type {any} */ (labels)[view] || '';
    var s = statementOf(state.activeStatement);
    var showStatement = view !== 'team';
    $('spStatement').textContent = showStatement ? 'Påstand ' + s.no + ': ' + s.text : '';
    var stance = south ? s.southPosition : s.northPosition;
    $('spStance').textContent = showStatement ? 'ARGUMENTERER ' + posLabel(stance) : '';
    $('spStance').style.display = showStatement ? '' : 'none';
    $('spCards').innerHTML = C.CARDS.map(function (c) {
      var used = state.cards[team] && state.cards[team][c.key];
      return (
        '<span class="card' +
        (used ? ' used' : '') +
        '" aria-label="' +
        esc(c.name + (used ? ' – brukt' : ' – tilgjengelig')) +
        '">' +
        c.icon +
        ' ' +
        esc(c.title) +
        '</span>'
      );
    }).join('');
    $('spTimer').classList.toggle('hidden', view === 'team' && state.timer.status === 'idle');
  }

  function renderCross() {
    var s = statementOf(state.activeStatement);
    $('crossLabel').textContent = 'PÅSTAND ' + s.no;
    $('crossStatement').textContent = s.text;
    $('crossNName').textContent = teamName('north').toUpperCase();
    $('crossSName').textContent = teamName('south').toUpperCase();
    var active = (state.segment && state.segment.team) || state.activeTeam;
    $('crossN').className = 'teamBox' + (active === 'north' ? ' activeN' : '');
    $('crossS').className = 'teamBox' + (active === 'south' ? ' activeS' : '');
    $('crossNTag').textContent = active === 'north' ? 'HAR ORDET' : '';
    $('crossSTag').textContent = active === 'south' ? 'HAR ORDET' : '';
  }

  var lastResultKey = '';
  function renderResult() {
    var no = state.resultStatement || state.activeStatement;
    var s = statementOf(no);
    $('resLabel').textContent = 'PÅSTAND ' + no + ' – RESULTAT';
    setLongText($('resText'), s.text, 110);
    var r = state.result;
    var key = r ? [r.statementNo, r.status, r.calculatedAt, r.approvedAt, r.north, r.south].join('|') : 'none';
    if (key === lastResultKey) return;
    lastResultKey = key;
    var body = $('resBody');
    if (!r || r.statementNo !== no) {
      body.innerHTML = '<div class="verdict"><div class="sub">Resultatet er ikke klart ennå.</div></div>';
      return;
    }
    if (r.pending) {
      body.innerHTML = '<div class="verdict"><div class="big">…</div><div class="sub">Resultatet kontrolleres av juryen.</div></div>';
      return;
    }
    var labels = C.CHOICE_LABELS;
    var html = '';
    if (r.before && r.after && r.mode !== 'manual') {
      html +=
        '<div class="compare"><div><h3>FØR DEBATTEN</h3><div class="dist">' +
        distBars0(r.before, labels) +
        '</div><div class="total">' +
        r.beforeTotal +
        ' stemmer</div></div><div><h3>ETTER DEBATTEN</h3><div class="dist">' +
        distBars0(r.after, labels) +
        '</div><div class="total">' +
        r.afterTotal +
        ' stemmer</div></div></div>';
      html +=
        '<div class="delta">' +
        CHOICES.map(function (c) {
          return '<span>' + labels[/** @type {'for'} */ (c)] + ' ' + signed(r.change[c]) + '</span>';
        }).join('') +
        '</div>';
    }
    html += '<div class="verdict">';
    if (r.mode === 'manual') {
      html += '<div class="big pop"><span class="north">' + r.north + '</span> – <span class="south">' + r.south + '</span></div>';
      html += '<div class="sub">flyttede stemmer (' + esc(teamName('north')) + ' – ' + esc(teamName('south')) + ')</div>';
    } else if (r.netMovement === 0) {
      html += '<div class="big pop">0</div><div class="sub">Ingen netto flyttede stemmer</div>';
    } else {
      var dir = r.netMovement > 0 ? 'FOR' : 'MOT';
      html += '<div class="big pop" id="resBig" data-target="' + Math.abs(r.netMovement) + '">0</div>';
      html += '<div class="sub">flyttede stemmer mot ' + dir + '</div>';
    }
    if (r.winner) {
      html += '<div class="winner pop ' + r.winner + '">' + esc(teamName(r.winner).toUpperCase()) + ' VINNER RUNDEN</div>';
    } else {
      html += '<div class="winner pop">UAVGJORT</div>';
    }
    if (r.mode === 'normalized') html += '<div><span class="badge">NORMALISERT BEREGNING</span></div>';
    if (r.mode === 'manual' || r.overridden) html += '<div><span class="badge">MANUELT FASTSATT</span></div>';
    html += '</div>';
    body.innerHTML = html;
    animateBars(body);
    var big = $('resBig');
    if (big) countUp(big, Number(big.getAttribute('data-target')));
  }

  /** @param {any} t @param {any} labels */
  function distBars0(t, labels) {
    var total = (t.against || 0) + (t.neutral || 0) + (t['for'] || 0);
    return CHOICES.map(function (c) {
      var n = t[c] || 0;
      var pct = total ? Math.round((n / total) * 100) : 0;
      return (
        '<div class="distRow"><span>' +
        esc(labels[c]) +
        '</span><div class="bar"><i class="c-' +
        c +
        '" data-w="' +
        pct +
        '"></i></div><span>' +
        n +
        '</span></div>'
      );
    }).join('');
  }
  /** @param {HTMLElement} root */
  function animateBars(root) {
    var bars = root.querySelectorAll('i[data-w]');
    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        bars.forEach(function (b) {
          /** @type {HTMLElement} */ (b).style.width = b.getAttribute('data-w') + '%';
        });
      });
    });
  }
  /** @param {HTMLElement} el @param {number} target */
  function countUp(el, target) {
    var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce || target <= 1) {
      el.textContent = String(target);
      return;
    }
    var start = performance.now();
    var dur = 1200;
    function step(t) {
      var k = Math.min(1, (t - start) / dur);
      el.textContent = String(Math.round(target * (1 - Math.pow(1 - k, 3))));
      if (k < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }

  function renderLeaderboard() {
    var lb = state.leaderboard;
    $('lbNName').textContent = teamName('north').toUpperCase();
    $('lbSName').textContent = teamName('south').toUpperCase();
    $('lbNScore').textContent = String(lb.north);
    $('lbSScore').textContent = String(lb.south);
    $('lbN').classList.toggle('lead', lb.leader === 'north');
    $('lbS').classList.toggle('lead', lb.leader === 'south');
    var active = state.resultStatement;
    /** @param {string} team */
    function rows(team) {
      return lb.rounds
        .map(function (/** @type {any} */ r) {
          var cls = 'round' + (!r.approved ? ' pending' : '') + (r.approved && r.winner === team ? ' win' : '');
          var cur = r.statementNo === active && r.approved ? ' aria-current="true"' : '';
          var star = r.approved && r.winner === team ? '<span class="star" aria-label="rundevinner">★</span>' : '';
          return '<div class="' + cls + '"' + cur + '><span>Påstand ' + r.statementNo + '</span><span>' + (r.approved ? r[team] : '–') + star + '</span></div>';
        })
        .join('');
    }
    $('lbNRounds').innerHTML = rows('north');
    $('lbSRounds').innerHTML = rows('south');
  }

  var lastFinalKey = '';
  function renderFinal() {
    var m = state.mainResult;
    var lb = state.leaderboard;
    var key = JSON.stringify([m, lb.north, lb.south]);
    if (key === lastFinalKey) return;
    lastFinalKey = key;
    var html = '';
    if (m) {
      html +=
        '<div class="compare"><div><h3>FØR</h3><div class="dist">' +
        distBars0(m.before, m.labels) +
        '</div><div class="total">' +
        m.beforeTotal +
        ' stemmer</div></div><div><h3>ETTER</h3><div class="dist">' +
        distBars0(m.after, m.labels) +
        '</div><div class="total">' +
        m.afterTotal +
        ' stemmer</div></div></div>';
    }
    if (m) {
      var net = m.netMovement;
      html +=
        '<div class="delta" style="margin-top:34px">' +
        CHOICES.map(function (c) {
          return '<span>' + esc(m.labels[c]) + ' ' + signed(m.change[c]) + '</span>';
        }).join('') +
        '</div>';
      html +=
        '<div class="finalShift pop">' +
        (net === 0 ? 'Salen står der den sto' : 'Salen flyttet seg ' + Math.abs(net) + ' stemmesteg mot ' + esc(net > 0 ? m.labels['for'] : m.labels.against)) +
        '</div>';
    }
    html += '<div class="thanks">TAKK FOR I DAG</div>';
    $('finalBody').innerHTML = html;
    animateBars($('finalBody'));
  }

  var lastWinnerKey = '';
  function renderWinner() {
    var lb = state.leaderboard;
    var key = JSON.stringify(lb);
    if (key === lastWinnerKey) return;
    lastWinnerKey = key;
    var html = '';
    if (lb.leader) {
      html +=
        '<div class="kicker gold">VINNER AV DEBATTEN</div><div class="winnerName pop ' + lb.leader + '">' + esc(teamName(lb.leader).toUpperCase()) + '</div>';
    } else {
      html += '<div class="kicker gold">DEBATTEN ENDTE</div><div class="winnerName pop">UAVGJORT</div>';
    }
    html +=
      '<div class="winnerScore"><span class="north">' +
      esc(teamName('north')) +
      ' <b>' +
      lb.north +
      '</b></span><span class="dash">–</span><span class="south"><b>' +
      lb.south +
      '</b> ' +
      esc(teamName('south')) +
      '</span></div><div class="unit">FLYTTEDE STEMMER TOTALT</div>';
    html +=
      '<div class="winnerRounds">' +
      lb.rounds
        .map(function (/** @type {any} */ r) {
          return (
            '<div><span>Påstand ' +
            r.statementNo +
            '</span><b class="north">' +
            (r.approved ? r.north : '–') +
            '</b><b class="south">' +
            (r.approved ? r.south : '–') +
            '</b></div>'
          );
        })
        .join('') +
      '</div>';
    $('winnerBody').innerHTML = html;
  }

  var rulesKey = '';
  function renderRules() {
    var d = state.event.durations || { opening: 180, cross: 240, closing: 60 };
    var key = JSON.stringify(d);
    if (key === rulesKey) return;
    rulesKey = key;
    /** @param {number} sec */
    var mm = function (sec) {
      var m = Math.floor(sec / 60);
      var r = sec % 60;
      if (!m) return r + ' sek';
      return r ? m + ' min ' + r + ' sek' : m + ' min';
    };
    var steps = [
      ['1', 'Før-avstemning', 'Salen stemmer MOT, NØYTRAL eller FOR på påstanden.'],
      ['2', 'Åpningsinnlegg', mm(d.opening) + ' per lag. Lag Nord starter.'],
      ['3', 'Kryssforhør', mm(d.cross) + ' per lag.'],
      ['4', 'Sluttappell', mm(d.closing) + ' per lag.'],
      ['5', 'Etter-avstemning', 'Salen stemmer på nytt.'],
      ['6', 'Poeng', 'Laget som flytter flest stemmer i sin retning, vinner runden.']
    ];
    $('rulesFormat').innerHTML = steps
      .map(function (x) {
        return '<li><span class="no">' + x[0] + '</span><div><b>' + esc(x[1]) + '</b><span>' + esc(x[2]) + '</span></div></li>';
      })
      .join('');
    $('rulesGrid').innerHTML = C.CARDS.map(function (c) {
      return (
        '<div class="ruleCard"><div class="icon" aria-hidden="true">' +
        c.icon +
        '</div><div class="t">' +
        esc(c.title) +
        '</div><div class="d">' +
        esc(c.name + ': ' + c.text) +
        '</div></div>'
      );
    }).join('');
  }

  // ---------- Timer ----------
  var timerKey = '';
  var wasPositive = false;
  function tickTimer() {
    if (state) {
      var ms = T.remainingMs(state.timer, cl.serverNow());
      var signedMs = T.signedRemainingMs(state.timer, cl.serverNow());
      var sec = ms / 1000;
      var phase = T.phase(sec);
      var seg = state.segment;
      var cfg = seg && C.SEGMENTS[seg.kind];
      var overtime = !!(cfg && cfg.overtime && state.timer.status === 'running' && signedMs <= -1000);
      var text = overtime ? T.formatSigned(signedMs / 1000) : phase === 'done' ? 'TID' : T.format(sec);
      ['spTimer', 'crossTimer'].forEach(function (id) {
        var el = $(id);
        if (el.textContent !== text) el.textContent = text;
        el.classList.toggle('warn', phase === 'warn');
        el.classList.toggle('danger', phase === 'danger');
        el.classList.toggle('done', phase === 'done' && !overtime);
        el.classList.toggle('over', overtime);
      });
      // Sluttappell: bytt til påstanden lokalt med en gang tiden (+ «TID») er ute
      if (shownSection && VIEW_SECTION[/** @type {keyof typeof VIEW_SECTION} */ (effectiveView())] !== shownSection) render();
      var key = state.timer.status + '|' + state.timer.startedAt + '|' + state.timer.durationSeconds;
      if (key !== timerKey) {
        timerKey = key;
        wasPositive = ms > 0;
      } else if (wasPositive && ms <= 0 && state.timer.status === 'running') {
        wasPositive = false;
        if (['opening', 'cross', 'closing', 'team'].indexOf(state.view) !== -1) beep();
      }
    }
    requestAnimationFrame(function () {
      setTimeout(tickTimer, 100);
    });
  }

  // ---------- Kort-flash ----------
  var lastFlashId = '';
  var flashTimer = /** @type {any} */ (null);
  var firstState = true;
  function handleFlash() {
    var f = state.flash;
    if (!f) {
      if (lastFlashId) {
        $('flash').classList.remove('show');
        lastFlashId = '';
      }
      return;
    }
    if (f.id === lastFlashId) return;
    lastFlashId = f.id;
    if (firstState && cl.serverNow() - f.at > 8000) return;
    var c = C.CARDS.filter(function (x) {
      return x.key === f.key;
    })[0];
    if (!c) return;
    $('flashIcon').textContent = c.icon;
    $('flashTitle').textContent = teamName(f.team).toUpperCase() + ': ' + c.title;
    $('flashText').textContent = c.text;
    var el = $('flash');
    el.className = 'flash show ' + f.team;
    clearTimeout(flashTimer);
    flashTimer = setTimeout(function () {
      el.classList.remove('show');
    }, 4500);
  }

  // ---------- Video ----------
  var player = /** @type {HTMLVideoElement} */ ($('player'));
  var currentNonce = '';
  /** @type {{nonce:string, view:string, statementNo:number|null}|null} */
  var pendingReturn = null;
  /** @param {string} nonce @param {string} returnView @param {number|null} [returnStatement] */
  function finishVideo(nonce, returnView, returnStatement) {
    if (pendingReturn && pendingReturn.nonce === nonce) return;
    pendingReturn = { nonce: nonce, view: returnView || 'hero', statementNo: returnStatement || null };
    player.pause();
    fadeOutSoundtrack();
    if (state) render();
    cl.call('public.videoEnded', { nonce: nonce }).catch(function () {
      /* tilstanden rettes ved neste henting */
    });
  }
  // ---------- Sang til video ----------
  var soundtrack = /** @type {HTMLAudioElement} */ ($('soundtrack'));
  var soundtrackOn = false;
  var fadeTimer = /** @type {any} */ (null);
  /** @param {string} src */
  function startSoundtrack(src) {
    clearInterval(fadeTimer);
    soundtrackOn = true;
    soundtrack.onerror = function () {
      markMissing(src);
      soundtrackOn = false;
    };
    soundtrack.src = src;
    soundtrack.volume = 1;
    try {
      soundtrack.currentTime = 0;
    } catch (e) {
      /* ignorert */
    }
    soundtrack.play().catch(function () {
      $('muted').classList.add('show');
    });
  }
  /** Fader sangen ned (standard 3 sekunder) og stopper den. */
  function fadeOutSoundtrack() {
    if (!soundtrackOn) return;
    soundtrackOn = false;
    clearInterval(fadeTimer);
    if (soundtrack.paused || !FADE_MS) {
      soundtrack.pause();
      return;
    }
    var start = soundtrack.volume;
    var t0 = Date.now();
    fadeTimer = setInterval(function () {
      var k = Math.min(1, (Date.now() - t0) / FADE_MS);
      soundtrack.volume = Math.max(0, start * (1 - k));
      if (k >= 1) {
        clearInterval(fadeTimer);
        soundtrack.pause();
      }
    }, 50);
  }

  function tryPlay() {
    player.muted = !audioUnlocked || (soundtrackOn && !VIDEO_SOUND_WITH_SOUNDTRACK);
    var pr = player.play();
    if (pr && pr.catch) {
      pr.then(function () {
        if (player.muted) $('muted').classList.add('show');
      }).catch(function () {
        player.muted = true;
        $('muted').classList.add('show');
        player.play().catch(function () {
          /* ignorert */
        });
      });
    }
  }
  /** @param {string} view */
  function syncVideo(view) {
    var v = view === 'video' ? state.video : null;
    if (!v) {
      if (currentNonce) {
        player.pause();
        player.removeAttribute('src');
        player.load();
        currentNonce = '';
        fadeOutSoundtrack();
        $('videoMissing').classList.remove('show');
      }
      return;
    }
    if (v.nonce !== currentNonce) {
      currentNonce = v.nonce;
      var src = mediaPath(v.key);
      $('videoMissing').classList.remove('show');
      player.onended = function () {
        finishVideo(v.nonce, v.returnView, v.returnStatement);
      };
      player.onerror = function () {
        markMissing(src);
        $('videoMissing').textContent = 'Finner ikke videoen: ' + src;
        $('videoMissing').classList.add('show');
        setTimeout(function () {
          finishVideo(v.nonce, v.returnView, v.returnStatement);
        }, 4000);
      };
      player.src = src;
      try {
        player.currentTime = 0;
      } catch (e) {
        /* ignorert */
      }
      var track = soundtrackPath(v.key);
      if (track && v.status === 'playing') startSoundtrack(track);
      else fadeOutSoundtrack();
      if (v.status === 'playing') tryPlay();
    } else if (v.status === 'paused' && !player.paused) {
      player.pause();
      if (soundtrackOn) soundtrack.pause();
    } else if (v.status === 'playing' && player.paused && !player.ended && !$('videoMissing').classList.contains('show')) {
      tryPlay();
      if (soundtrackOn && soundtrack.paused) soundtrack.play().catch(function () {});
    }
  }

  // ---------- Musikk ----------
  var music = /** @type {HTMLAudioElement} */ ($('music'));
  var musicNonce = '';
  function syncMusic() {
    var m = state.music;
    if (!m) {
      if (musicNonce) {
        music.pause();
        musicNonce = '';
      }
      return;
    }
    if (m.nonce !== musicNonce) {
      musicNonce = m.nonce;
      var src = mediaPath(m.key);
      music.onerror = function () {
        markMissing(src);
      };
      music.src = src;
      music.volume = 0.7;
      music.play().catch(function () {
        $('muted').classList.add('show');
      });
    }
  }

  // ---------- Tilkobling ----------
  function ping() {
    cl.call('public.displayPing', {
      clientId: CLIENT_ID,
      missing: Object.keys(missing).join(', ').slice(0, 1900),
      version: lastVersion > 0 ? lastVersion : 0,
      mode: BOOT.mode || 'local'
    }).catch(function () {
      /* ignorert */
    });
  }

  cl.poller({
    method: 'public.state',
    interval: 1000,
    rtInterval: 1500,
    realtime: 'isq_tick',
    minGap: 300,
    hiddenInterval: 3000,
    onData: function (data) {
      if (state && data.version < state.version) return; // eldre svar som kom sent
      state = data;
      if (pendingReturn && (!data.video || data.video.nonce !== pendingReturn.nonce)) pendingReturn = null;
      checkPreroll(data);
      if (data.version !== lastVersion || shownSection === '') {
        lastVersion = data.version;
        render();
        firstState = false;
      } else {
        handleFlash();
        if (shownSection === 'v-qr') renderQr();
      }
    },
    onStatus: function (online) {
      $('offline').classList.toggle('show', !online);
    }
  });
  setInterval(ping, 10000);
  setTimeout(ping, 1500);
  tickTimer();
})();
