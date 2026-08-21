/**
 * generator.js — pure workout-generation logic. No DOM access, so it can
 * run in the browser (loaded after data.js and rng.js) or in Node for
 * tests (test/generator.test.js).
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory(require("./data"), require("./rng"));
  } else {
    root.MetconGenerator = factory(root.MetconData, root.MetconRng);
  }
})(typeof self !== "undefined" ? self : this, function (MetconData, MetconRng) {
  "use strict";

  var MOVEMENTS = MetconData.MOVEMENTS;
  var FORMATS = MetconData.FORMATS;
  var DEFAULT_EQUIPMENT = MetconData.DEFAULT_EQUIPMENT;
  var INTENSITY_MULTIPLIER = MetconData.INTENSITY_MULTIPLIER;
  var SPACE_RANK = MetconData.SPACE_RANK;
  var createRng = MetconRng.createRng;

  // -----------------------------------------------------------------
  // Equipment / pool helpers
  // -----------------------------------------------------------------

  function getPairWeights(weightsKg) {
    var counts = {};
    (weightsKg || []).forEach(function (w) {
      counts[w] = (counts[w] || 0) + 1;
    });
    return Object.keys(counts)
      .filter(function (w) {
        return counts[w] >= 2;
      })
      .map(Number)
      .sort(function (a, b) {
        return a - b;
      });
  }

  function isEquipmentAvailable(equipment, key) {
    var eq = equipment[key];
    if (eq === true) return true;
    if (eq && typeof eq === "object") return !!eq.enabled;
    return false;
  }

  function getAvailablePool(equipment) {
    var spaceRank = SPACE_RANK[equipment.space] != null ? SPACE_RANK[equipment.space] : SPACE_RANK.medium;
    return MOVEMENTS.filter(function (m) {
      if (SPACE_RANK[m.space] > spaceRank) return false;
      if (m.equipment === null) return equipment.bodyweight !== false;
      if (!isEquipmentAvailable(equipment, m.equipment)) return false;
      if (m.requiresPair) {
        var eq = equipment[m.equipment];
        if (!eq || !eq.weightsKg) return false;
        return getPairWeights(eq.weightsKg).length > 0;
      }
      return true;
    });
  }

  // -----------------------------------------------------------------
  // Weight / rep selection
  // -----------------------------------------------------------------

  // Tiers a sorted weight list by intensity and picks within that tier.
  // Works for any list length, including length 1 or 2.
  function pickWeight(weights, intensity, rng) {
    if (!weights || weights.length === 0) return null;
    var sorted = weights.slice().sort(function (a, b) {
      return a - b;
    });
    var len = sorted.length;
    var third = Math.ceil(len / 3);
    var lo, hi;
    if (intensity === "light") {
      lo = 0;
      hi = third - 1;
    } else if (intensity === "hard") {
      lo = len - third;
      hi = len - 1;
    } else {
      lo = Math.floor(len / 3);
      hi = len - 1 - Math.floor(len / 3);
    }
    if (hi < lo) hi = lo;
    lo = Math.max(0, lo);
    hi = Math.min(len - 1, hi);
    return sorted[rng.int(lo, hi)];
  }

  function movementLoad(movement, equipment, intensity, rng) {
    if (!movement.equipment) return null;
    var eq = equipment[movement.equipment];
    if (!eq || typeof eq !== "object" || !eq.weightsKg || eq.weightsKg.length === 0) return null;
    var weights = movement.requiresPair ? getPairWeights(eq.weightsKg) : eq.weightsKg;
    if (!weights.length) return null;
    var w = pickWeight(weights, intensity, rng);
    if (w == null) return null;
    return movement.requiresPair ? w + "/" + w + " kg" : w + " kg";
  }

  function niceRound(val, scheme) {
    if (scheme === "sec") {
      return Math.max(10, Math.round(val / 5) * 5);
    }
    if (val > 20) return Math.round(val / 5) * 5;
    return Math.round(val);
  }

  // Scales a movement's baseline range for the given format + intensity.
  // Returns null for formats with no prescribed amount (e.g. Tabata).
  function scaleAmount(movement, format, intensity, rng) {
    if (format.repMultiplier == null) return null;
    var mult = format.repMultiplier * (INTENSITY_MULTIPLIER[intensity] || 1);
    var lo = movement.base[0] * mult;
    var hi = movement.base[1] * mult;
    var val = rng.int(Math.round(lo), Math.round(hi));
    val = Math.max(1, val);
    return niceRound(val, movement.scheme);
  }

  // -----------------------------------------------------------------
  // Format + movement selection
  // -----------------------------------------------------------------

  function selectFormat(rng, lastFormatId) {
    var ids = Object.keys(FORMATS);
    var candidates = ids.filter(function (id) {
      return id !== lastFormatId;
    });
    if (candidates.length === 0) candidates = ids;
    return FORMATS[rng.pick(candidates)];
  }

  // Picks `count` movements from the pool, softly preferring pattern
  // diversity (don't stack three squat-dominant moves) and avoiding
  // movements used in the last few days when possible.
  function selectMovements(pool, count, rng, recentIds) {
    recentIds = recentIds || [];
    var candidates = pool.slice();
    var chosen = [];
    var usedPatterns = {};

    for (var i = 0; i < count && candidates.length > 0; i++) {
      var scored = candidates.map(function (m) {
        var score = rng.float();
        if (usedPatterns[m.pattern]) score -= 0.4;
        if (recentIds.indexOf(m.id) !== -1) score -= 0.5;
        return { m: m, score: score };
      });
      scored.sort(function (a, b) {
        return b.score - a.score;
      });
      var topN = Math.min(3, scored.length);
      var pick = scored[rng.int(0, topN - 1)];
      chosen.push(pick.m);
      usedPatterns[pick.m.pattern] = true;
      candidates = candidates.filter(function (c) {
        return c.id !== pick.m.id;
      });
    }
    return chosen;
  }

  // -----------------------------------------------------------------
  // Format-specific metadata (rounds, time caps, etc.)
  // -----------------------------------------------------------------

  var FOR_TIME_ROUNDS_RANGE = { light: [3, 4], moderate: [4, 6], hard: [5, 8] };

  function buildFormatMeta(format, duration, intensity, rng) {
    switch (format.id) {
      case "amrap":
        return { timeCapMinutes: duration };
      case "for_time": {
        var range = FOR_TIME_ROUNDS_RANGE[intensity] || FOR_TIME_ROUNDS_RANGE.moderate;
        return { rounds: rng.int(range[0], range[1]), timeCapMinutes: duration };
      }
      case "emom":
        return { totalMinutes: duration };
      case "tabata":
        return { blockMinutes: 4, roundsPerMovement: 8, workSec: 20, restSec: 10 };
      case "chipper":
        return { timeCapMinutes: duration };
      default:
        return {};
    }
  }

  // -----------------------------------------------------------------
  // Human-readable rendering
  // -----------------------------------------------------------------

  function unitLabel(scheme) {
    if (scheme === "cals") return "cal";
    if (scheme === "sec") return "sec";
    return "reps";
  }

  function movementLine(item) {
    var amountStr = item.amount != null ? item.amount + " " + unitLabel(item.scheme) : "max effort";
    var loadStr = item.load ? " @ " + item.load : "";
    return amountStr + " " + item.name + loadStr;
  }

  function describeWorkout(w) {
    var lines = [w.formatName + " — " + w.formatDescription, ""];

    if (w.formatId === "amrap") {
      lines.push("AMRAP " + w.meta.timeCapMinutes + " min:");
      w.movements.forEach(function (item) {
        lines.push("  " + movementLine(item));
      });
    } else if (w.formatId === "for_time") {
      lines.push(w.meta.rounds + " rounds for time (cap " + w.meta.timeCapMinutes + " min):");
      w.movements.forEach(function (item) {
        lines.push("  " + movementLine(item));
      });
    } else if (w.formatId === "emom") {
      lines.push("EMOM x " + w.meta.totalMinutes + " min — rotate every minute:");
      w.movements.forEach(function (item, idx) {
        lines.push("  Min " + (idx + 1) + " (repeat cycle): " + movementLine(item));
      });
    } else if (w.formatId === "tabata") {
      var totalMin = w.movements.length * w.meta.blockMinutes;
      lines.push(
        "Tabata — " +
          w.meta.workSec +
          "s work / " +
          w.meta.restSec +
          "s rest x " +
          w.meta.roundsPerMovement +
          " rounds per movement (~" +
          totalMin +
          " min total):"
      );
      w.movements.forEach(function (item) {
        lines.push("  " + item.name + (item.load ? " @ " + item.load : "") + " — max reps each interval");
      });
    } else if (w.formatId === "chipper") {
      lines.push("Chipper — one trip through, for time (cap " + w.meta.timeCapMinutes + " min):");
      w.movements.forEach(function (item) {
        lines.push("  " + movementLine(item));
      });
    }
    return lines.join("\n");
  }

  // -----------------------------------------------------------------
  // Main entry point
  // -----------------------------------------------------------------

  function generateWorkout(options) {
    options = options || {};
    var equipment = options.equipment || DEFAULT_EQUIPMENT;
    var duration = options.duration || 20;
    var intensity = options.intensity || "moderate";
    var seed = options.seed;
    var recentIds = options.recentMovementIds || [];
    var lastFormatId = options.lastFormatId || null;

    var rng = createRng(seed);
    var pool = getAvailablePool(equipment);
    if (pool.length === 0) {
      throw new Error("No movements available for the current equipment/space settings.");
    }

    var format = selectFormat(rng, lastFormatId);
    var wantedCount = format.movementCount[intensity] || format.movementCount.moderate;
    wantedCount = Math.min(wantedCount, pool.length);

    if (format.id === "tabata") {
      var blocks = Math.max(1, Math.floor(duration / 4));
      wantedCount = Math.min(wantedCount, blocks);
    }
    if (format.id === "emom") {
      wantedCount = Math.min(wantedCount, Math.max(1, Math.floor(duration)));
    }

    var chosenMovements = selectMovements(pool, wantedCount, rng, recentIds);

    var items = chosenMovements.map(function (m) {
      return {
        id: m.id,
        name: m.name,
        scheme: m.scheme,
        amount: scaleAmount(m, format, intensity, rng),
        load: movementLoad(m, equipment, intensity, rng),
      };
    });

    var workout = {
      formatId: format.id,
      formatName: format.name,
      formatDescription: format.description,
      duration: duration,
      intensity: intensity,
      meta: buildFormatMeta(format, duration, intensity, rng),
      movements: items,
      seed: seed || null,
    };

    workout.text = describeWorkout(workout);
    return workout;
  }

  return {
    generateWorkout: generateWorkout,
    getAvailablePool: getAvailablePool,
    getPairWeights: getPairWeights,
    pickWeight: pickWeight,
    scaleAmount: scaleAmount,
    selectMovements: selectMovements,
    selectFormat: selectFormat,
    describeWorkout: describeWorkout,
  };
});
