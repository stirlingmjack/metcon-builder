/**
 * test/strength-data.test.js — structural sanity checks for the strength
 * program data. Run with: node test/strength-data.test.js
 */
var assert = require("assert");
var path = require("path");

var strengthData = require(path.join(__dirname, "..", "js", "strength-data.js"));
var PROGRAM = strengthData.STRENGTH_PROGRAM;
var MAIN_LIFTS = strengthData.MAIN_LIFTS;
var WEEK_SCHEMES = strengthData.WEEK_SCHEMES;

var passed = 0;
function test(name, fn) {
  fn();
  passed++;
  console.log("  ok - " + name);
}

console.log("strength-data.test.js");

test("program has at least one day, each with a unique id", function () {
  assert.ok(PROGRAM.days.length > 0);
  var ids = PROGRAM.days.map(function (d) {
    return d.id;
  });
  assert.strictEqual(new Set(ids).size, ids.length, "day ids should be unique");
});

test("every block has a code and a name", function () {
  PROGRAM.days.forEach(function (day) {
    day.blocks.forEach(function (b) {
      assert.ok(b.code, "block missing code in " + day.id);
      assert.ok(b.name, "block " + b.code + " missing name in " + day.id);
    });
  });
});

test("a block is exactly one of: fixed lift (sets+reps), finisher, or progressesWithWeek", function () {
  var liftIds = MAIN_LIFTS.map(function (l) {
    return l.id;
  });
  PROGRAM.days.forEach(function (day) {
    day.blocks.forEach(function (b) {
      var isFixedLift = b.sets != null && b.reps != null;
      var isFinisher = b.finisher != null;
      var isProgressive = b.progressesWithWeek === true;
      var kindCount = [isFixedLift, isFinisher, isProgressive].filter(Boolean).length;
      assert.strictEqual(kindCount, 1, "block " + b.code + " in " + day.id + " must be exactly one of fixed-lift/finisher/progressive, got " + kindCount);
      if (isFixedLift) {
        assert.ok(typeof b.sets === "number" && b.sets > 0, b.code + " sets should be a positive number");
      }
      if (isProgressive) {
        assert.ok(liftIds.indexOf(b.liftKey) !== -1, b.code + " in " + day.id + " has an unknown liftKey: " + b.liftKey);
        assert.strictEqual(b.sets, null, b.code + " progressesWithWeek blocks should not also have a fixed sets count");
      }
    });
  });
});

test("every MAIN_LIFTS entry is used by exactly one progressesWithWeek block", function () {
  var usage = {};
  PROGRAM.days.forEach(function (day) {
    day.blocks.forEach(function (b) {
      if (b.progressesWithWeek) usage[b.liftKey] = (usage[b.liftKey] || 0) + 1;
    });
  });
  MAIN_LIFTS.forEach(function (lift) {
    assert.strictEqual(usage[lift.id], 1, lift.id + " should be used by exactly one progressesWithWeek block, used by " + (usage[lift.id] || 0));
  });
});

test("WEEK_SCHEMES has 8 sequential weeks with ascending %1RM, each totaling roughly 6-10 reps (test week may run lower)", function () {
  assert.strictEqual(WEEK_SCHEMES.length, 8);
  WEEK_SCHEMES.forEach(function (w, idx) {
    assert.strictEqual(w.week, idx + 1, "WEEK_SCHEMES should be in week order");
    assert.ok(Array.isArray(w.setReps) && w.setReps.length > 0, "week " + w.week + " needs a non-empty setReps");
    assert.ok(w.percent > 0 && w.percent <= 100, "week " + w.week + " percent should be a sane %1RM");
    var totalReps = w.setReps.reduce(function (a, b) {
      return a + b;
    }, 0);
    if (!w.isTest) {
      assert.ok(totalReps >= 5 && totalReps <= 11, "week " + w.week + " total reps (" + totalReps + ") should be roughly in the 6-10 range");
    }
    if (idx > 0) {
      assert.ok(w.percent >= WEEK_SCHEMES[idx - 1].percent, "percent should not decrease week over week (week " + w.week + ")");
    }
  });
});

test("superset groupings pair up (every superset id appears on 2+ blocks)", function () {
  PROGRAM.days.forEach(function (day) {
    var counts = {};
    day.blocks.forEach(function (b) {
      if (b.superset) counts[b.superset] = (counts[b.superset] || 0) + 1;
    });
    Object.keys(counts).forEach(function (key) {
      assert.ok(counts[key] >= 2, "superset " + key + " in " + day.id + " should have 2+ blocks, has " + counts[key]);
    });
  });
});

test("finisher blocks specify a known format and a positive duration", function () {
  var KNOWN_FORMATS = ["amrap", "for_time", "emom", "chipper", "complex", "interval"];
  PROGRAM.days.forEach(function (day) {
    day.blocks.forEach(function (b) {
      if (b.finisher) {
        assert.ok(KNOWN_FORMATS.indexOf(b.finisher.format) !== -1, b.code + " finisher format should be a known Metcon format");
        assert.ok(b.finisher.durationMinutes > 0, b.code + " finisher duration should be positive");
      }
    });
  });
});

console.log(passed + " tests passed");
