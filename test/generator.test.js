/**
 * test/generator.test.js — plain-Node smoke tests for the pure generation
 * logic (no browser/DOM needed). Run with: node test/generator.test.js
 */
var assert = require("assert");
var path = require("path");

var MetconData = require(path.join(__dirname, "..", "js", "data.js"));
var generator = require(path.join(__dirname, "..", "js", "generator.js"));

var DEFAULT_EQUIPMENT = MetconData.DEFAULT_EQUIPMENT;
var passed = 0;

function test(name, fn) {
  fn();
  passed++;
  console.log("  ok - " + name);
}

console.log("generator.test.js");

test("getAvailablePool excludes disabled/off-by-default equipment", function () {
  var pool = generator.getAvailablePool(DEFAULT_EQUIPMENT);
  var ids = pool.map(function (m) {
    return m.id;
  });
  assert.ok(ids.indexOf("kb_swing") !== -1, "kettlebell movement should be available");
  assert.ok(ids.indexOf("sb_squat") !== -1, "sandbag movement should be available");
  assert.ok(ids.indexOf("bike_cal") !== -1, "bike erg movement should be available");
  assert.ok(ids.indexOf("pullups") === -1, "pull-ups should be excluded (no bar owned)");
  assert.ok(ids.indexOf("bb_deadlift") === -1, "barbell should be excluded (not owned)");
});

test("getAvailablePool respects space constraint", function () {
  var eq = JSON.parse(JSON.stringify(DEFAULT_EQUIPMENT));
  eq.space = "small";
  var pool = generator.getAvailablePool(eq);
  var ids = pool.map(function (m) {
    return m.id;
  });
  assert.ok(ids.indexOf("walking_lunges") === -1, "walking lunges needs medium space");
  assert.ok(ids.indexOf("kb_swing") !== -1, "small-space movement should remain available");
});

test("getAvailablePool excludes pair movements when no duplicate weights exist", function () {
  var eq = JSON.parse(JSON.stringify(DEFAULT_EQUIPMENT));
  eq.kettlebells.weightsKg = [16, 20, 24, 28]; // all unique, no pairs
  var pool = generator.getAvailablePool(eq);
  var ids = pool.map(function (m) {
    return m.id;
  });
  assert.ok(ids.indexOf("kb_front_rack_carry") === -1, "pair movement should be excluded without duplicate weights");
});

test("getAvailablePool includes pair movements when duplicate weights exist", function () {
  var pool = generator.getAvailablePool(DEFAULT_EQUIPMENT); // has 2x16, 2x24
  var ids = pool.map(function (m) {
    return m.id;
  });
  assert.ok(ids.indexOf("kb_front_rack_carry") !== -1, "pair movement should be included with duplicate weights");
});

test("getPairWeights finds only weights with >=2 count", function () {
  var pairs = generator.getPairWeights([16, 16, 20, 24, 24, 28]);
  assert.deepStrictEqual(pairs, [16, 24]);
});

test("pickWeight stays within bounds and favors low end for light / high end for hard", function () {
  var rng = require(path.join(__dirname, "..", "js", "rng.js")).createRng("test-seed");
  var weights = [16, 20, 24, 28];
  for (var i = 0; i < 50; i++) {
    var w = generator.pickWeight(weights, "light", rng);
    assert.ok(weights.indexOf(w) !== -1);
  }
  // deterministic seed => deterministic output
  var rngA = require(path.join(__dirname, "..", "js", "rng.js")).createRng("fixed");
  var rngB = require(path.join(__dirname, "..", "js", "rng.js")).createRng("fixed");
  assert.strictEqual(generator.pickWeight(weights, "hard", rngA), generator.pickWeight(weights, "hard", rngB));
});

test("generateWorkout produces a well-formed workout for default equipment", function () {
  var w = generator.generateWorkout({
    equipment: DEFAULT_EQUIPMENT,
    duration: 20,
    intensity: "moderate",
    seed: "2026-08-21",
  });
  assert.ok(w.formatId);
  assert.ok(w.movements.length > 0);
  assert.ok(typeof w.text === "string" && w.text.length > 0);
  w.movements.forEach(function (m) {
    assert.ok(m.name);
    assert.ok(["reps", "cals", "sec", "meters"].indexOf(m.scheme) !== -1);
  });
});

test("generateWorkout is deterministic for a given seed", function () {
  var opts = { equipment: DEFAULT_EQUIPMENT, duration: 20, intensity: "moderate", seed: "same-seed-123" };
  var a = generator.generateWorkout(opts);
  var b = generator.generateWorkout(opts);
  assert.strictEqual(a.text, b.text);
});

test("generateWorkout varies with a different seed", function () {
  var base = { equipment: DEFAULT_EQUIPMENT, duration: 20, intensity: "moderate" };
  var results = [];
  for (var i = 0; i < 8; i++) {
    results.push(generator.generateWorkout(Object.assign({}, base, { seed: "seed-" + i })).text);
  }
  var unique = {};
  results.forEach(function (t) {
    unique[t] = true;
  });
  assert.ok(Object.keys(unique).length > 1, "different seeds should usually produce different workouts");
});

test("generateWorkout avoids repeating yesterday's format when possible", function () {
  var opts = {
    equipment: DEFAULT_EQUIPMENT,
    duration: 20,
    intensity: "moderate",
    seed: "format-avoid-test",
    lastFormatId: "amrap",
  };
  var w = generator.generateWorkout(opts);
  assert.notStrictEqual(w.formatId, "amrap");
});

test("generateWorkout throws a clear error when nothing is available", function () {
  var eq = {
    bodyweight: false,
    bikeErg: false,
    rowErg: false,
    kettlebells: { enabled: false, weightsKg: [] },
    sandbags: { enabled: false, weightsKg: [] },
    barbell: { enabled: false, weightsKg: [] },
    dumbbells: { enabled: false, weightsKg: [] },
    pullupBar: false,
    jumpRope: false,
    plyoBox: false,
    space: "small",
  };
  assert.throws(function () {
    generator.generateWorkout({ equipment: eq, duration: 20, intensity: "moderate", seed: "x" });
  });
});

test("generateWorkout scales EMOM movement count down for short durations", function () {
  var w = generator.generateWorkout({
    equipment: DEFAULT_EQUIPMENT,
    duration: 20,
    intensity: "hard",
    seed: "emom-force-test-" + Math.random(),
    lastFormatId: null,
  });
  // Not asserting the format directly (it's randomly chosen), just that
  // whichever format was picked, movement count respects duration caps.
  if (w.formatId === "emom") {
    assert.ok(w.movements.length <= w.duration);
  }
  if (w.formatId === "tabata") {
    var maxBlocks = Math.max(1, Math.floor(w.duration / 4));
    assert.ok(w.movements.length <= maxBlocks);
  }
});

test("Tabata format has no prescribed amount (max-effort intervals)", function () {
  // Tabata is weighted to 0 (see FORMAT_WEIGHTS) so it no longer comes up
  // through normal random selection — test scaleAmount directly instead.
  var rng = require(path.join(__dirname, "..", "js", "rng.js")).createRng("tabata-direct");
  var movement = { base: [10, 20], scheme: "reps" };
  var amount = generator.scaleAmount(movement, MetconData.FORMATS.tabata, "moderate", rng);
  assert.strictEqual(amount, null);
});

test("Tabata is weighted to 0 and is never selected", function () {
  var rng = require(path.join(__dirname, "..", "js", "rng.js")).createRng("tabata-never");
  for (var i = 0; i < 500; i++) {
    var f = generator.selectFormat(rng, null);
    assert.notStrictEqual(f.id, "tabata");
  }
});

test("Complex format shares one load across every loaded movement", function () {
  var found = false;
  for (var i = 0; i < 300 && !found; i++) {
    var w = generator.generateWorkout({
      equipment: DEFAULT_EQUIPMENT,
      duration: 20,
      intensity: "moderate",
      seed: "complex-shared-" + i,
    });
    if (w.formatId === "complex" && w.sharedLoad) {
      found = true;
      w.movements.forEach(function (m) {
        // Individual per-movement load is suppressed in favor of workout.sharedLoad
        assert.strictEqual(m.load, null);
      });
    }
  }
  assert.ok(found, "expected to encounter a complex workout with a shared load within 300 seeds");
});

test("Complex unilateralBothSides only selects movements flagged eachSide", function () {
  var found = false;
  for (var i = 0; i < 3000 && !found; i++) {
    var w = generator.generateWorkout({
      equipment: DEFAULT_EQUIPMENT,
      duration: 20,
      intensity: "hard",
      seed: "complex-uni-" + i,
    });
    if (w.formatId === "complex" && w.meta.unilateralBothSides) {
      found = true;
      w.movements.forEach(function (item) {
        var def = MetconData.MOVEMENTS.filter(function (m) {
          return m.id === item.id;
        })[0];
        assert.strictEqual(def.eachSide, true, item.name + " should be eachSide-capable in a unilateral complex");
      });
    }
  }
  assert.ok(found, "expected to encounter a unilateral complex within 3000 seeds");
});

test("Heavier picked weight reduces the rep target (weightDampening)", function () {
  var weights = [16, 20, 24, 28];
  var rng = require(path.join(__dirname, "..", "js", "rng.js")).createRng("fixed-dampening");
  var movement = { base: [10, 20], scheme: "reps" };
  var format = { repMultiplier: 1 };
  var lightVal = generator.scaleAmount(movement, format, "moderate", require(path.join(__dirname, "..", "js", "rng.js")).createRng("d1"), 1);
  var heavyVal = generator.scaleAmount(movement, format, "moderate", require(path.join(__dirname, "..", "js", "rng.js")).createRng("d1"), 0.65);
  assert.ok(heavyVal < lightVal, "a dampening factor below 1 should reduce the scaled amount");
});

test("selectFormat respects FORMAT_WEIGHTS direction (complex/for_time favored over emom/tabata)", function () {
  var rng = require(path.join(__dirname, "..", "js", "rng.js")).createRng("weights-check");
  var counts = {};
  for (var i = 0; i < 4000; i++) {
    var f = generator.selectFormat(rng, null);
    counts[f.id] = (counts[f.id] || 0) + 1;
  }
  assert.ok(counts.for_time > counts.emom, "for_time should be picked more often than emom");
  assert.ok(counts.complex > (counts.tabata || 0), "complex should be picked more often than tabata");
  assert.strictEqual(counts.tabata, undefined, "tabata is weighted to 0 and should never appear");
});

test("Reps and cals are always rounded to an even number", function () {
  var rng = require(path.join(__dirname, "..", "js", "rng.js")).createRng("even-check");
  for (var i = 0; i < 500; i++) {
    var w = generator.generateWorkout({
      equipment: DEFAULT_EQUIPMENT,
      duration: 20,
      intensity: ["light", "moderate", "hard"][i % 3],
      seed: "even-" + i,
    });
    w.movements.forEach(function (m) {
      if (m.amount != null && (m.scheme === "reps" || m.scheme === "cals")) {
        assert.strictEqual(m.amount % 2, 0, m.name + " amount " + m.amount + " should be even");
      }
    });
  }
});

test("Carry movements use meters instead of steps", function () {
  var carryIds = ["kb_front_rack_carry", "kb_suitcase_carry", "sb_bear_hug_carry"];
  carryIds.forEach(function (id) {
    var m = MetconData.MOVEMENTS.filter(function (x) {
      return x.id === id;
    })[0];
    assert.strictEqual(m.scheme, "meters");
    assert.ok(m.name.indexOf("(steps)") === -1, m.name + " should not still say (steps)");
  });
});

test("Interval format produces 3 rounds with a 6-7 min on-time and 2 min rest", function () {
  var found = false;
  for (var i = 0; i < 400 && !found; i++) {
    var w = generator.generateWorkout({
      equipment: DEFAULT_EQUIPMENT,
      duration: 20,
      intensity: "moderate",
      seed: "interval-" + i,
    });
    if (w.formatId === "interval") {
      found = true;
      assert.strictEqual(w.meta.rounds, 3);
      assert.ok([6, 7].indexOf(w.meta.onMinutes) !== -1);
      assert.strictEqual(w.meta.restMinutes, 2);
    }
  }
  assert.ok(found, "expected to encounter an interval workout within 400 seeds");
});

test("Push-up/burpee/air-squat chipper volume stays in the calibrated range", function () {
  var byId = {};
  MetconData.MOVEMENTS.forEach(function (m) {
    byId[m.id] = m;
  });
  var rng = require(path.join(__dirname, "..", "js", "rng.js")).createRng("bw-calibration");
  var chipper = MetconData.FORMATS.chipper;

  var pushupHardMax = 0;
  var burpeeHardMax = 0;
  for (var i = 0; i < 500; i++) {
    var pu = generator.scaleAmount(byId.pushups, chipper, "hard", rng);
    var bp = generator.scaleAmount(byId.burpees, chipper, "hard", rng);
    pushupHardMax = Math.max(pushupHardMax, pu);
    burpeeHardMax = Math.max(burpeeHardMax, bp);
  }
  // Push-ups fatigue fast — a hard chipper leg should stay well under 70.
  assert.ok(pushupHardMax <= 55, "push-up hard-chipper max was " + pushupHardMax + ", expected <= 55");
  // Burpees should be able to reach the ~90 mark from the reference sample.
  assert.ok(burpeeHardMax >= 80, "burpee hard-chipper max was " + burpeeHardMax + ", expected >= 80");
});

test("Chipper movement count scales up with duration", function () {
  function chipperMovementCountAt(duration) {
    var counts = [];
    for (var i = 0; i < 60; i++) {
      var w = generator.generateWorkout({
        equipment: DEFAULT_EQUIPMENT,
        duration: duration,
        intensity: "moderate",
        seed: "chipper-scale-" + duration + "-" + i,
      });
      if (w.formatId === "chipper") counts.push(w.movements.length);
    }
    return counts;
  }
  // Chipper is only eligible at 26+ min (FORMAT_DURATION_LIMITS), so both
  // samples need to stay within that window.
  var short = chipperMovementCountAt(26);
  var long = chipperMovementCountAt(32);
  assert.ok(short.length > 0 && long.length > 0, "expected to sample both a 26-min and a 32-min chipper");
  var avg = function (arr) {
    return arr.reduce(function (a, b) {
      return a + b;
    }, 0) / arr.length;
  };
  assert.ok(avg(long) > avg(short), "a 60-min chipper should have more movements than a 10-min one");
});

test("For Time round count scales up with duration", function () {
  function forTimeRoundsAt(duration) {
    var rounds = [];
    for (var i = 0; i < 60; i++) {
      var w = generator.generateWorkout({
        equipment: DEFAULT_EQUIPMENT,
        duration: duration,
        intensity: "moderate",
        seed: "ft-scale-" + duration + "-" + i,
      });
      if (w.formatId === "for_time") rounds.push(w.meta.rounds);
    }
    return rounds;
  }
  // For Time is only eligible up to 20 min (FORMAT_DURATION_LIMITS), so
  // both samples need to stay within that window.
  var short = forTimeRoundsAt(8);
  var long = forTimeRoundsAt(20);
  assert.ok(short.length > 0 && long.length > 0, "expected to sample both an 8-min and a 20-min for_time");
  var avg = function (arr) {
    return arr.reduce(function (a, b) {
      return a + b;
    }, 0) / arr.length;
  };
  assert.ok(avg(long) > avg(short) * 2, "a 60-min for_time should have meaningfully more rounds than a 10-min one");
});

test("Complex round count scales up with duration", function () {
  function complexRoundsAt(duration) {
    var rounds = [];
    for (var i = 0; i < 60; i++) {
      var w = generator.generateWorkout({
        equipment: DEFAULT_EQUIPMENT,
        duration: duration,
        intensity: "moderate",
        seed: "complex-scale-" + duration + "-" + i,
      });
      if (w.formatId === "complex") rounds.push(w.meta.roundsMax);
    }
    return rounds;
  }
  var short = complexRoundsAt(10);
  var long = complexRoundsAt(60);
  assert.ok(short.length > 0 && long.length > 0, "expected to sample both a 10-min and a 60-min complex");
  var avg = function (arr) {
    return arr.reduce(function (a, b) {
      return a + b;
    }, 0) / arr.length;
  };
  assert.ok(avg(long) > avg(short), "a 60-min complex should prescribe more rounds than a 10-min one");
});

test("Disabled movements never appear in the pool or in generated workouts", function () {
  var DISABLED_IDS = [
    "burpee_broad_jump",
    "high_knees",
    "jumping_jacks",
    "shuttle_run",
    "star_jumps",
    "hollow_rock",
    "superman_raise",
    "bear_crawl",
    "crab_walk",
  ];
  var pool = generator.getAvailablePool(DEFAULT_EQUIPMENT);
  var poolIds = pool.map(function (m) {
    return m.id;
  });
  DISABLED_IDS.forEach(function (id) {
    assert.ok(poolIds.indexOf(id) === -1, id + " should be excluded from the available pool");
  });

  for (var i = 0; i < 200; i++) {
    var w = generator.generateWorkout({
      equipment: DEFAULT_EQUIPMENT,
      duration: 20,
      intensity: "moderate",
      seed: "disabled-check-" + i,
    });
    w.movements.forEach(function (m) {
      assert.ok(DISABLED_IDS.indexOf(m.id) === -1, m.id + " should never be generated");
    });
  }
});

test("Sandbag Cleans are capped at 50kg even at hard intensity", function () {
  var byId = {};
  MetconData.MOVEMENTS.forEach(function (m) {
    byId[m.id] = m;
  });
  var sbClean = byId.sb_clean;
  assert.strictEqual(sbClean.maxWeightKg, 50);

  for (var i = 0; i < 200; i++) {
    var w = generator.generateWorkout({
      equipment: DEFAULT_EQUIPMENT,
      duration: 20,
      intensity: "hard",
      seed: "sbclean-cap-" + i,
    });
    var hit = w.movements.filter(function (m) {
      return m.id === "sb_clean";
    })[0];
    if (hit) {
      // Complex suppresses the per-movement load in favor of one shared
      // load for the whole circuit — check that instead when it applies.
      var actual = hit.load != null ? hit.load : w.sharedLoad && w.sharedLoad.value;
      assert.strictEqual(actual, "50 kg", "sandbag cleans should always load 50kg (directly or via sharedLoad), got " + actual);
    }
  }
});

test("Complex sharedLoad respects a per-movement maxWeightKg even when that movement isn't the anchor", function () {
  var byId = {};
  MetconData.MOVEMENTS.forEach(function (m) {
    byId[m.id] = m;
  });
  // Any sandbag complex that happens to include cleans (capped 50kg) must
  // share a 50kg load for the whole circuit, even when cleans aren't the
  // first equipped movement (the "anchor") in the list.
  for (var i = 0; i < 300; i++) {
    var w = generator.generateWorkout({
      equipment: DEFAULT_EQUIPMENT,
      duration: 20,
      intensity: "hard",
      seed: "group-cap-" + i,
    });
    if (w.formatId === "complex" && w.sharedLoad && w.sharedLoad.label === "sandbag") {
      var hasClean = w.movements.some(function (m) {
        return m.id === "sb_clean";
      });
      if (hasClean) {
        assert.strictEqual(w.sharedLoad.value, "50 kg", "a sandbag complex including cleans must share the 50kg load");
      }
    }
  }
});

test("Random ('Any') selection never picks Chipper below 26 min or AMRAP/For Time above 20 min", function () {
  var rng = require(path.join(__dirname, "..", "js", "rng.js")).createRng("eligibility-check");
  for (var i = 0; i < 500; i++) {
    var f = generator.selectFormat(rng, null, 10);
    assert.notStrictEqual(f.id, "chipper", "chipper should never be selected at 10 min");
  }
  for (var i = 0; i < 500; i++) {
    var f2 = generator.selectFormat(rng, null, 32);
    assert.notStrictEqual(f2.id, "amrap", "amrap should never be selected at 32 min");
    assert.notStrictEqual(f2.id, "for_time", "for_time should never be selected at 32 min");
  }
  for (var i = 0; i < 500; i++) {
    var f3 = generator.selectFormat(rng, null, 30);
    assert.notStrictEqual(f3.id, "amrap", "amrap should never be selected at 30 min");
  }
});

test("EMOM remains eligible across the whole 8-32 min range", function () {
  [8, 20, 32].forEach(function (duration) {
    assert.ok(generator.isFormatEligibleForDuration("emom", duration), "emom should be eligible at " + duration + " min");
  });
});

test("isFormatEligibleForDuration skips filtering when duration is omitted", function () {
  assert.strictEqual(generator.isFormatEligibleForDuration("chipper", null), true);
  assert.strictEqual(generator.isFormatEligibleForDuration("chipper", undefined), true);
});

test("forcedFormatId overrides random selection, ignoring the duration-eligibility filter", function () {
  // Chipper is normally ineligible at 10 min, but an explicit user choice
  // should still be honored.
  var w = generator.generateWorkout({
    equipment: DEFAULT_EQUIPMENT,
    duration: 10,
    intensity: "moderate",
    seed: "forced-chipper",
    forcedFormatId: "chipper",
  });
  assert.strictEqual(w.formatId, "chipper");
});

test("forcedFormatId is deterministic and repeats the same format across seeds", function () {
  for (var i = 0; i < 20; i++) {
    var w = generator.generateWorkout({
      equipment: DEFAULT_EQUIPMENT,
      duration: 20,
      intensity: "moderate",
      seed: "forced-emom-" + i,
      forcedFormatId: "emom",
    });
    assert.strictEqual(w.formatId, "emom");
  }
});

console.log(passed + " tests passed");
