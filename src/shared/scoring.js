// @ts-check
/**
 * Beregning av netto flyttede stemmesteg.
 * Skala: MOT = 0, NØYTRAL = 1, FOR = 2.
 */
var ISQ_Scoring = (function () {
  'use strict';

  /** @typedef {{against:number, neutral:number, for:number}} Tally */

  /** @param {any} t @returns {Tally} */
  function normalizeTally(t) {
    t = t || {};
    return {
      against: toCount(t.against),
      neutral: toCount(t.neutral),
      for: toCount(t['for'])
    };
  }

  /** @param {any} n */
  function toCount(n) {
    var x = Number(n);
    if (!isFinite(x) || x < 0) return 0;
    return Math.floor(x);
  }

  /** @param {Tally} t */
  function total(t) {
    return t.against + t.neutral + t['for'];
  }

  /** Stemmesteg-score: antall nøytral + 2 × antall for. @param {Tally} t */
  function stepScore(t) {
    return t.neutral + 2 * t['for'];
  }

  /**
   * Fordeler en netto bevegelse til lagene ut fra posisjonene.
   * @param {number} net
   * @param {string} northPosition
   * @param {string} southPosition
   */
  function awardTeams(net, northPosition, southPosition) {
    var north = 0;
    var south = 0;
    var direction = net > 0 ? 'for' : net < 0 ? 'against' : null;
    if (direction) {
      if (northPosition === direction) north = Math.abs(net);
      if (southPosition === direction) south = Math.abs(net);
    }
    var winner = north > south ? 'north' : south > north ? 'south' : null;
    return { north: north, south: south, winner: winner, direction: direction };
  }

  /**
   * @param {{before:any, after:any, northPosition:string, southPosition:string, mode?:string}} input
   */
  function computeRound(input) {
    var before = normalizeTally(input.before);
    var after = normalizeTally(input.after);
    var mode = input.mode === 'normalized' ? 'normalized' : 'strict';
    var beforeTotal = total(before);
    var afterTotal = total(after);
    var beforeScore = stepScore(before);
    var afterScore = stepScore(after);
    var equalTurnout = beforeTotal === afterTotal;

    var rawNet;
    if (mode === 'strict') {
      rawNet = afterScore - beforeScore;
    } else if (beforeTotal === 0 || afterTotal === 0) {
      rawNet = 0;
    } else {
      var avgBefore = beforeScore / beforeTotal;
      var avgAfter = afterScore / afterTotal;
      var base = (beforeTotal + afterTotal) / 2;
      rawNet = (avgAfter - avgBefore) * base;
    }
    var netMovement = mode === 'strict' ? rawNet : roundHalfAwayFromZero(rawNet);
    var award = awardTeams(netMovement, input.northPosition, input.southPosition);

    return {
      mode: mode,
      before: before,
      after: after,
      beforeTotal: beforeTotal,
      afterTotal: afterTotal,
      beforeScore: beforeScore,
      afterScore: afterScore,
      equalTurnout: equalTurnout,
      needsDecision: mode === 'strict' && !equalTurnout,
      rawNetMovement: Math.round(rawNet * 100) / 100,
      netMovement: netMovement,
      change: {
        against: after.against - before.against,
        neutral: after.neutral - before.neutral,
        for: after['for'] - before['for']
      },
      north: award.north,
      south: award.south,
      winner: award.winner,
      direction: award.direction
    };
  }

  /** @param {number} x */
  function roundHalfAwayFromZero(x) {
    var r = Math.round(Math.abs(x));
    return x < 0 ? -r : r;
  }

  /**
   * Summerer godkjente rundeskårer. Hovedspørsmålet er aldri med.
   * @param {Record<string, any>} results  nøkkel = påstandsnummer
   * @param {number} [statementCount]
   */
  function leaderboard(results, statementCount) {
    var n = statementCount || 3;
    var rounds = [];
    var north = 0;
    var south = 0;
    for (var i = 1; i <= n; i++) {
      var r = results ? results[String(i)] : null;
      var approved = !!(r && r.status === 'approved');
      var ns = approved ? toCount(r.north) : 0;
      var ss = approved ? toCount(r.south) : 0;
      north += ns;
      south += ss;
      rounds.push({
        statementNo: i,
        approved: approved,
        north: ns,
        south: ss,
        winner: approved ? (ns > ss ? 'north' : ss > ns ? 'south' : null) : null,
        mode: approved ? r.mode : null,
        overridden: approved ? !!r.overridden : false
      });
    }
    return {
      rounds: rounds,
      north: north,
      south: south,
      leader: north > south ? 'north' : south > north ? 'south' : null
    };
  }

  /**
   * Før/etter-sammenligning for hovedspørsmålet (teller ikke i leaderboard).
   * @param {any} beforeIn @param {any} afterIn
   */
  function mainComparison(beforeIn, afterIn) {
    var before = normalizeTally(beforeIn);
    var after = normalizeTally(afterIn);
    var bt = total(before);
    var at = total(after);
    return {
      before: before,
      after: after,
      beforeTotal: bt,
      afterTotal: at,
      beforePct: percentages(before),
      afterPct: percentages(after),
      change: {
        against: after.against - before.against,
        neutral: after.neutral - before.neutral,
        for: after['for'] - before['for']
      },
      netMovement: stepScore(after) - stepScore(before)
    };
  }

  /** Prosentfordeling (kun til visning av fordeling, aldri i score). @param {any} t */
  function percentages(t) {
    var x = normalizeTally(t);
    var n = total(x);
    if (!n) return { against: 0, neutral: 0, for: 0 };
    return {
      against: Math.round((x.against / n) * 100),
      neutral: Math.round((x.neutral / n) * 100),
      for: Math.round((x['for'] / n) * 100)
    };
  }

  return {
    normalizeTally: normalizeTally,
    total: total,
    stepScore: stepScore,
    awardTeams: awardTeams,
    computeRound: computeRound,
    leaderboard: leaderboard,
    mainComparison: mainComparison,
    percentages: percentages
  };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = ISQ_Scoring;
