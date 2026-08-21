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
  var FORMAT_WEIGHTS = MetconData.FORMAT_WEIGHTS;
  var DEFAULT_EQUIPMENT = MetconData.DEFAULT_EQUIPMENT;
  var INTENSITY_MULTIPLIER = MetconData.INTENSITY_MULTIPLIER;
  var SPACE_RANK = MetconData.SPACE_RANK;
  var DURATION_REFERENCE_MINUTES = MetconData.DURATION_REFERENCE_MINUTES;
  var createRng = MetconRng.createRng;

  // Equipment categories a "Complex" (continuous, one-implement circuit)
  // can reasonably be built from — bodyweight is deliberately excluded
  // here since it's mixed in separately, not the anchor implement.
  var COMPLEX_EQUIPMENT_CATEGORIES = ["kettlebell", "sandbag", "dumbbell", "barbell"];

  // Scales a count (movement count, round count) tuned for
  // DURATION_REFERENCE_MINUTES against the actually-selected duration, so
  // a 40-min For Time/Chipper/Complex prescribes more work than a 20-min
  // one instead of just getting a bigger, mostly-unused time cap.
  function scaleForDuration(baseCount, duration, minCount, maxCount) {
    var scaled = Math.round(baseCount * (duration / DURATION_REFERENCE_MINUTES));
    scaled = Math.max(minCount || 1, scaled);
    if (maxCount) scaled = Math.min(scaled, maxCount);
    return scaled;
  }

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
      if (m.disabled) return false;
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

  // Picks a weight for a loaded movement and returns both the formatted
  // string ("24 kg" / "24/24 kg") and enough raw info (the numeric pick +
  // the full weight list it came from) to compute rep dampening below.
  function computeLoad(movement, equipment, intensity, rng) {
    if (!movement.equipment) return null;
    var eq = equipment[movement.equipment];
    if (!eq || typeof eq !== "object" || !eq.weightsKg || eq.weightsKg.length === 0) return null;
    var ownedWeights = eq.weightsKg;
    // Some movements aren't realistic at the top of what you own (cleaning
    // a 90kg sandbag for reps) — cap the pool of weights to choose from.
    if (movement.maxWeightKg != null) {
      var capped = ownedWeights.filter(function (w) {
        return w <= movement.maxWeightKg;
      });
      if (capped.length > 0) ownedWeights = capped;
    }
    var weights = movement.requiresPair ? getPairWeights(ownedWeights) : ownedWeights;
    if (!weights.length) return null;
    var w = pickWeight(weights, intensity, rng);
    if (w == null) return null;
    return {
      raw: w,
      allWeights: weights,
      formatted: movement.requiresPair ? w + "/" + w + " kg" : w + " kg",
    };
  }

  // Like computeLoad, but for a group of movements that must all share one
  // pick (a Complex's continuous flow — you're carrying one bag/bell the
  // whole way through). The tightest maxWeightKg among the group applies
  // to all of them: if any one movement in the flow can't handle the
  // heaviest weight owned, nothing in the flow uses it.
  function computeGroupLoad(movements, equipment, intensity, rng) {
    var anchor = movements.filter(function (m) {
      return m.equipment != null;
    })[0];
    if (!anchor) return null;
    var eq = equipment[anchor.equipment];
    if (!eq || typeof eq !== "object" || !eq.weightsKg || eq.weightsKg.length === 0) return null;

    var groupCap = null;
    movements.forEach(function (m) {
      if (m.equipment === anchor.equipment && m.maxWeightKg != null) {
        groupCap = groupCap == null ? m.maxWeightKg : Math.min(groupCap, m.maxWeightKg);
      }
    });

    var ownedWeights = eq.weightsKg;
    if (groupCap != null) {
      var capped = ownedWeights.filter(function (w) {
        return w <= groupCap;
      });
      if (capped.length > 0) ownedWeights = capped;
    }

    var weights = anchor.requiresPair ? getPairWeights(ownedWeights) : ownedWeights;
    if (!weights.length) return null;
    var w = pickWeight(weights, intensity, rng);
    if (w == null) return null;
    return {
      raw: w,
      allWeights: weights,
      formatted: anchor.requiresPair ? w + "/" + w + " kg" : w + " kg",
      category: anchor.category,
    };
  }

  // A heavy pick (near the top of what's available for that implement)
  // trims the rep target down — nobody's doing 40 unbroken reps at their
  // heaviest sandbag. A light pick gets no reduction.
  function weightDampening(rawWeight, allWeights) {
    if (rawWeight == null || !allWeights || allWeights.length < 2) return 1;
    var min = Math.min.apply(null, allWeights);
    var max = Math.max.apply(null, allWeights);
    if (max === min) return 1;
    var pct = (rawWeight - min) / (max - min);
    return 1 - 0.35 * pct;
  }

  function roundToNearest(val, step) {
    return Math.max(step, Math.round(val / step) * step);
  }

  function niceRound(val, scheme) {
    if (scheme === "sec") {
      return roundToNearest(val, 5);
    }
    if (scheme === "meters") {
      // Rounds to a clean multiple of 5m — matches how most driveways/
      // yards get paced out for carries.
      return roundToNearest(val, 5);
    }
    // reps & cals: always an even number, and a clean multiple of 10 once
    // we're into chipper-sized totals.
    return roundToNearest(val, val > 40 ? 10 : 2);
  }

  // Scales a movement's baseline range for the given format + intensity
  // (and, for loaded movements, how heavy the picked weight is — see
  // weightDampening). Returns null for formats with no prescribed amount
  // (e.g. Tabata).
  function scaleAmount(movement, format, intensity, rng, dampening) {
    if (format.repMultiplier == null) return null;
    var mult = format.repMultiplier * (INTENSITY_MULTIPLIER[intensity] || 1) * (dampening || 1);
    var lo = movement.base[0] * mult;
    var hi = movement.base[1] * mult;
    var val = rng.int(Math.round(lo), Math.round(hi));
    val = Math.max(1, val);
    return niceRound(val, movement.scheme);
  }

  // -----------------------------------------------------------------
  // Format + movement selection
  // -----------------------------------------------------------------

  // Weighted pick (see FORMAT_WEIGHTS) that excludes yesterday's format
  // when possible, so the same shape doesn't show up two days running.
  function selectFormat(rng, lastFormatId) {
    var ids = Object.keys(FORMATS);
    var candidates = ids.filter(function (id) {
      return id !== lastFormatId;
    });
    if (candidates.length === 0) candidates = ids;

    var pool = [];
    candidates.forEach(function (id) {
      // An explicit weight of 0 (e.g. tabata) must stay 0 — only a truly
      // missing entry falls back to 1, so `|| 1` here would be a bug.
      var hasWeight = FORMAT_WEIGHTS && Object.prototype.hasOwnProperty.call(FORMAT_WEIGHTS, id);
      var weight = hasWeight ? FORMAT_WEIGHTS[id] : 1;
      for (var i = 0; i < weight; i++) pool.push(id);
    });
    return FORMATS[rng.pick(pool)];
  }

  // Picks which equipment category a Complex should be built around (you
  // physically can't swap implements mid-flow), preferring whichever
  // category has the most available movements. Returns null if only
  // bodyweight is available, in which case the complex is bodyweight-only.
  function pickComplexEquipmentCategory(pool, rng) {
    var counts = {};
    pool.forEach(function (m) {
      if (COMPLEX_EQUIPMENT_CATEGORIES.indexOf(m.category) !== -1) {
        counts[m.category] = (counts[m.category] || 0) + 1;
      }
    });
    var available = Object.keys(counts).filter(function (cat) {
      return counts[cat] >= 3; // need enough movements to build a circuit
    });
    if (available.length === 0) return null;
    return rng.pick(available);
  }

  // Builds the movement pool for a Complex: mostly one implement (so the
  // same bell/bag carries the whole flow), with a small chance of mixing
  // in one bodyweight movement (a push-up, a swing-adjacent cardio beat).
  // When unilateralOnly is set, restricts to movements that can actually
  // be done one side at a time (excludes two-handed/paired movements like
  // a front-rack carry or goblet squat). `category` is decided by the
  // caller (via pickComplexEquipmentCategory) so it can also drive the
  // unilateralBothSides decision before movements are picked.
  function buildComplexPool(pool, category, rng, unilateralOnly) {
    if (!category) {
      return pool.filter(function (m) {
        return m.category === "bodyweight";
      });
    }
    var anchored = pool.filter(function (m) {
      return m.category === category;
    });
    if (unilateralOnly) {
      return anchored.filter(function (m) {
        return m.eachSide === true;
      });
    }
    if (rng.chance(0.4)) {
      var bodyweightOptions = pool.filter(function (m) {
        return m.category === "bodyweight" && (m.pattern === "push" || m.pattern === "core" || m.pattern === "cardio");
      });
      if (bodyweightOptions.length > 0) {
        anchored = anchored.concat([rng.pick(bodyweightOptions)]);
      }
    }
    return anchored;
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
        var ftLo = scaleForDuration(range[0], duration, 2, 20);
        var ftHi = scaleForDuration(range[1], duration, ftLo, 24);
        return { rounds: rng.int(ftLo, ftHi), timeCapMinutes: duration };
      }
      case "emom":
        return { totalMinutes: duration };
      case "tabata":
        return { blockMinutes: 4, roundsPerMovement: 8, workSec: 20, restSec: 10 };
      case "interval":
        return {
          rounds: format.rounds,
          onMinutes: rng.pick(format.onMinutesOptions),
          restMinutes: format.restMinutes,
        };
      case "chipper":
        return { timeCapMinutes: duration };
      case "complex": {
        var cRangeRaw = format.roundsRange[intensity] || format.roundsRange.moderate;
        var cLo = scaleForDuration(cRangeRaw[0], duration, 2, 26);
        var cHi = scaleForDuration(cRangeRaw[1], duration, cLo, 30);
        var roundsMin = rng.int(cLo, Math.max(cLo, cHi - 1));
        // ~50% of the time show a single fixed round count, otherwise a
        // small range (mirrors how these actually get written up).
        var roundsMax = rng.chance(0.5) ? roundsMin : Math.min(cHi, roundsMin + rng.int(1, 3));
        return { roundsMin: roundsMin, roundsMax: roundsMax, continuous: true };
      }
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
    if (scheme === "meters") return "m";
    return "reps";
  }

  function movementLine(item) {
    var amountStr = item.amount != null ? item.amount + " " + unitLabel(item.scheme) : "max effort";
    var loadStr = item.load ? " @ " + item.load : "";
    return amountStr + " " + item.name + loadStr;
  }

  var SCORE_LINES = {
    amrap: "Score: rounds + reps completed.",
    for_time: "Score: time to complete.",
    chipper: "Score: time to complete.",
    emom: "Score: reps completed each round (log your worst).",
    tabata: "Score: total reps across all intervals.",
    interval: "Score: reps completed each round.",
  };

  function describeWorkout(w) {
    var lines = [w.formatName + " — " + w.formatDescription, ""];

    if (w.formatId === "amrap") {
      lines.push("AMRAP " + w.meta.timeCapMinutes + " min:");
      w.movements.forEach(function (item) {
        lines.push("  " + movementLine(item));
      });
    } else if (w.formatId === "for_time") {
      lines.push(w.meta.rounds + " rounds for time (cap " + w.meta.timeCapMinutes + " min) — split however you want:");
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
    } else if (w.formatId === "interval") {
      lines.push(
        w.meta.rounds + " rounds: " + w.meta.onMinutes + " min on / " + w.meta.restMinutes + " min off. Each 'on' block is its own AMRAP:"
      );
      w.movements.forEach(function (item) {
        lines.push("  " + movementLine(item));
      });
    } else if (w.formatId === "chipper") {
      lines.push("One trip through, for time (cap " + w.meta.timeCapMinutes + " min):");
      w.movements.forEach(function (item) {
        lines.push("  " + movementLine(item));
      });
    } else if (w.formatId === "complex") {
      var roundsLabel = w.meta.roundsMin === w.meta.roundsMax ? w.meta.roundsMin + " rounds" : w.meta.roundsMin + "–" + w.meta.roundsMax + " rounds";
      if (w.sharedLoad) {
        lines.push(roundsLabel + ", continuous — same " + w.sharedLoad.label + " (" + w.sharedLoad.value + ") the whole way through:");
      } else {
        lines.push(roundsLabel + ", continuous:");
      }
      if (w.meta.unilateralBothSides) {
        lines.push("  Complete everything on one side, unbroken, then repeat on the other side:");
      }
      w.movements.forEach(function (item) {
        var amountStr = item.amount != null ? item.amount + " " + unitLabel(item.scheme) : "max effort";
        var loadStr = !w.sharedLoad && item.load ? " @ " + item.load : "";
        lines.push("  " + amountStr + " " + item.name + loadStr);
      });
      if (w.meta.unilateralBothSides) {
        lines.push("  Then repeat the whole thing on the other side.");
      }
      lines.push("");
      lines.push("Keep the pace sustainable — aim to still look composed in the final round.");
    }

    var scoreLine = SCORE_LINES[w.formatId];
    if (scoreLine) {
      lines.push("");
      lines.push(scoreLine);
    }

    var scaleNotes = [];
    w.movements.forEach(function (item) {
      if (item.scaleNote && scaleNotes.indexOf(item.scaleNote) === -1) {
        scaleNotes.push(item.scaleNote);
      }
    });
    if (scaleNotes.length > 0) {
      lines.push("");
      scaleNotes.forEach(function (note) {
        lines.push("Scale: " + note);
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

    // Complexes flow with one implement, so narrow the pool to a single
    // equipment category (± one bodyweight movement) before picking. The
    // unilateralBothSides call has to happen before movement selection so
    // it can restrict the pool to movements that are actually doable one
    // side at a time (a front-rack carry can't be).
    var complexCategory = null;
    var unilateralBothSides = false;
    if (format.id === "complex") {
      complexCategory = pickComplexEquipmentCategory(pool, rng);
      if (complexCategory === "kettlebell") {
        unilateralBothSides = rng.chance(0.3);
      }
    }
    var workingPool = format.id === "complex" ? buildComplexPool(pool, complexCategory, rng, unilateralBothSides) : pool;
    if (workingPool.length === 0) {
      workingPool = pool;
      unilateralBothSides = false;
    }

    var wantedCount = format.movementCount[intensity] || format.movementCount.moderate;

    // Chipper is "one trip through the list" — the way it gets longer is
    // by having more movements on the list, not more reps of the same few.
    // (For Time/Complex instead scale their round count — see
    // buildFormatMeta — since repeating the same list more times is how
    // those actually get built for a longer session.)
    if (format.id === "chipper") {
      wantedCount = scaleForDuration(wantedCount, duration, 2, 12);
    }

    wantedCount = Math.min(wantedCount, workingPool.length);

    if (format.id === "tabata") {
      var blocks = Math.max(1, Math.floor(duration / 4));
      wantedCount = Math.min(wantedCount, blocks);
    }
    if (format.id === "emom") {
      wantedCount = Math.min(wantedCount, Math.max(1, Math.floor(duration)));
    }

    var chosenMovements = selectMovements(workingPool, wantedCount, rng, recentIds);

    // A Complex uses one bell/bag for the whole flow — pick a single load
    // shared by every movement in that equipment category, rather than a
    // different weight per movement (which you can't do mid-flow).
    var sharedLoad = null;
    var sharedLoadInfo = null;
    if (format.id === "complex") {
      sharedLoadInfo = computeGroupLoad(chosenMovements, equipment, intensity, rng);
      if (sharedLoadInfo) {
        sharedLoad = { label: sharedLoadInfo.category === "sandbag" ? "sandbag" : "bell", value: sharedLoadInfo.formatted };
      }
    }

    var items = chosenMovements.map(function (m) {
      var isAnchoredEquipment = sharedLoad && m.equipment != null;
      var loadInfo = isAnchoredEquipment ? sharedLoadInfo : computeLoad(m, equipment, intensity, rng);
      var dampening = loadInfo ? weightDampening(loadInfo.raw, loadInfo.allWeights) : 1;
      return {
        id: m.id,
        name: m.name,
        scheme: m.scheme,
        amount: scaleAmount(m, format, intensity, rng, dampening),
        load: isAnchoredEquipment ? null : loadInfo ? loadInfo.formatted : null,
        scaleNote: m.scaleNote || null,
      };
    });

    var meta = buildFormatMeta(format, duration, intensity, rng);
    if (format.id === "complex") {
      meta.unilateralBothSides = unilateralBothSides;
    }

    var workout = {
      formatId: format.id,
      formatName: format.name,
      formatDescription: format.description,
      duration: duration,
      intensity: intensity,
      meta: meta,
      movements: items,
      sharedLoad: sharedLoad,
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
    buildComplexPool: buildComplexPool,
    pickComplexEquipmentCategory: pickComplexEquipmentCategory,
  };
});
