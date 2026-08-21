/**
 * test/strength-data.test.js — structural sanity checks for the strength
 * program data. Run with: node test/strength-data.test.js
 */
var assert = require("assert");
var path = require("path");

var strengthData = require(path.join(__dirname, "..", "js", "strength-data.js"));
var PROGRAM = strengthData.STRENGTH_PROGRAM;

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

test("a block is either a logged lift (sets+reps) or a finisher, never both/neither", function () {
  PROGRAM.days.forEach(function (day) {
    day.blocks.forEach(function (b) {
      var isLift = b.sets != null && b.reps != null;
      var isFinisher = b.finisher != null;
      assert.notStrictEqual(isLift, isFinisher, "block " + b.code + " in " + day.id + " must be exactly one of lift/finisher");
      if (isLift) {
        assert.ok(typeof b.sets === "number" && b.sets > 0, b.code + " sets should be a positive number");
      }
    });
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
