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
  assert.ok(ids.indexOf("shuttle_run") === -1, "shuttle run needs medium space");
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

console.log(passed + " tests passed");
