/**
 * test/adhoc-parser.test.js — plain-Node smoke tests for the freeform
 * ad hoc workout text parser (no browser/DOM needed).
 * Run with: node test/adhoc-parser.test.js
 */
var assert = require("assert");
var path = require("path");

var MetconData = require(path.join(__dirname, "..", "js", "data.js"));
var parser = require(path.join(__dirname, "..", "js", "adhoc-parser.js"));

var MOVEMENTS = MetconData.MOVEMENTS;
var passed = 0;

function test(name, fn) {
  fn();
  passed++;
  console.log("  ok - " + name);
}

function movementLine(result, movementId) {
  return result.lines.filter(function (l) {
    return l.movementId === movementId;
  })[0];
}

console.log("adhoc-parser.test.js");

test("detects AMRAP format + duration from a header line", function () {
  var result = parser.parseAdhocWorkout("AMRAP 20:\n10 burpees\n15 air squats", MOVEMENTS);
  assert.strictEqual(result.formatId, "amrap");
  assert.strictEqual(result.durationMinutes, 20);
  assert.strictEqual(result.lines.length, 2);
});

test("detects EMOM format + duration even when movements share the header line", function () {
  var result = parser.parseAdhocWorkout("EMOM 12 min: 10 wall balls, 5 burpees", MOVEMENTS);
  assert.strictEqual(result.formatId, "emom");
  assert.strictEqual(result.durationMinutes, 12);
  assert.strictEqual(result.lines.length, 2);
  assert.strictEqual(result.lines[0].raw, "10 wall balls");
  assert.strictEqual(result.lines[1].movementId, "burpees");
});

test("detects For Time + rounds from a combined header", function () {
  var result = parser.parseAdhocWorkout("5 rounds for time: 10 burpees, 20 air squats", MOVEMENTS);
  assert.strictEqual(result.formatId, "for_time");
  assert.strictEqual(result.rounds, 5);
});

test("falls back to a generic 'rounds' format when only a round count is given", function () {
  var result = parser.parseAdhocWorkout("5 rounds:\n10 pushups\n15 situps", MOVEMENTS);
  assert.strictEqual(result.formatId, "rounds");
  assert.strictEqual(result.rounds, 5);
});

test("returns no format guess for plain unstructured text", function () {
  var result = parser.parseAdhocWorkout("Went for a 30 min jog, then stretched", MOVEMENTS);
  assert.strictEqual(result.formatId, null);
  assert.strictEqual(result.durationMinutes, 30);
});

test("matches movements via the official name", function () {
  var result = parser.parseAdhocWorkout("20 Air Squats\n10 Burpees", MOVEMENTS);
  assert.strictEqual(movementLine(result, "air_squats").amount, 20);
  assert.strictEqual(movementLine(result, "burpees").amount, 10);
});

test("matches movements via common slang/aliases", function () {
  var result = parser.parseAdhocWorkout("10 pushups\n15 situps\n5 pullups\nrow 250m\n10 KB swings", MOVEMENTS);
  assert.ok(movementLine(result, "pushups"), "pushups alias should resolve");
  assert.ok(movementLine(result, "situps"), "situps alias should resolve");
  assert.ok(movementLine(result, "pullups"), "pullups alias should resolve");
  assert.strictEqual(movementLine(result, "row_cal").amount, 250);
  assert.strictEqual(movementLine(result, "row_cal").unit, "meters");
  assert.ok(movementLine(result, "kb_swing"), "kb swings alias should resolve");
});

test("prefers a more specific alias over a generic one (kb row vs row erg)", function () {
  var result = parser.parseAdhocWorkout("10 kb rows", MOVEMENTS);
  assert.strictEqual(result.lines[0].movementId, "kb_row");
});

test("parses SxR shorthand into sets + amount", function () {
  var result = parser.parseAdhocWorkout("4x10 pushups", MOVEMENTS);
  assert.strictEqual(result.lines[0].sets, 4);
  assert.strictEqual(result.lines[0].amount, 10);
  assert.strictEqual(result.lines[0].unit, "reps");
});

test("parses a weight and doesn't let it get picked up as the rep count", function () {
  var result = parser.parseAdhocWorkout("15 kb swings 24kg", MOVEMENTS);
  var line = result.lines[0];
  assert.strictEqual(line.amount, 15);
  assert.strictEqual(line.weight, "24 kg");
});

test("flags an each-side / per-leg suffix", function () {
  var result = parser.parseAdhocWorkout("8/leg walking lunges", MOVEMENTS);
  assert.strictEqual(result.lines[0].eachSide, true);
});

test("parses a seconds-based hold", function () {
  var result = parser.parseAdhocWorkout("plank hold 60 sec", MOVEMENTS);
  assert.strictEqual(result.lines[0].movementId, "plank_hold");
  assert.strictEqual(result.lines[0].amount, 60);
  assert.strictEqual(result.lines[0].unit, "sec");
});

test("leaves an unrecognized movement unmatched rather than guessing", function () {
  var result = parser.parseAdhocWorkout("10 wall balls", MOVEMENTS);
  assert.strictEqual(result.lines[0].matched, false);
  assert.strictEqual(result.lines[0].movementId, null);
  assert.strictEqual(result.lines[0].amount, 10);
});

test("splits a single comma-separated line into multiple movements", function () {
  var result = parser.parseAdhocWorkout("10 burpees, 15 kb swings, 20 air squats", MOVEMENTS);
  assert.strictEqual(result.lines.length, 3);
});

test("does not split a single descriptive sentence with an incidental comma", function () {
  var result = parser.parseAdhocWorkout("Ran a quick 5k, felt strong the whole way", MOVEMENTS);
  assert.strictEqual(result.lines.length, 1);
});

test("empty input produces no lines and no format guess", function () {
  var result = parser.parseAdhocWorkout("", MOVEMENTS);
  assert.strictEqual(result.lines.length, 0);
  assert.strictEqual(result.formatId, null);
});

test("strips bullet/numbered-list markers", function () {
  var result = parser.parseAdhocWorkout("- 10 burpees\n2) 15 air squats\n* 5 pullups", MOVEMENTS);
  assert.strictEqual(result.lines.length, 3);
  assert.ok(movementLine(result, "burpees"));
  assert.ok(movementLine(result, "air_squats"));
  assert.ok(movementLine(result, "pullups"));
});

test("summaryText renders a readable header + line list", function () {
  var result = parser.parseAdhocWorkout("AMRAP 20:\n10 burpees\n15 kb swings 24kg", MOVEMENTS);
  assert.ok(result.summaryText.indexOf("AMRAP") !== -1);
  assert.ok(result.summaryText.indexOf("20 min") !== -1);
  assert.ok(result.summaryText.indexOf("Burpees") !== -1);
  assert.ok(result.summaryText.indexOf("Kettlebell Swings") !== -1);
  assert.ok(result.summaryText.indexOf("@ 24 kg") !== -1);
});

test("summaryText flags unmatched lines without duplicating the number", function () {
  var result = parser.parseAdhocWorkout("10 wall balls", MOVEMENTS);
  var occurrences = result.summaryText.split("10").length - 1;
  assert.strictEqual(occurrences, 1);
  assert.ok(result.summaryText.indexOf("not recognized") !== -1);
});

test("For Time never mistakes the first movement's rep count for a duration (no NaN either)", function () {
  var result = parser.parseAdhocWorkout("5 rounds for time:\n10 burpees\n15 air squats", MOVEMENTS);
  assert.strictEqual(result.formatId, "for_time");
  assert.strictEqual(result.durationMinutes, null);
  assert.strictEqual(movementLine(result, "burpees").amount, 10);
  assert.ok(result.summaryText.indexOf("NaN") === -1, "summaryText should never contain NaN");
});

test("an explicit '(15 min cap)' on a For Time is still picked up as the duration", function () {
  var result = parser.parseAdhocWorkout("For Time (15 min cap): 10 burpees", MOVEMENTS);
  assert.strictEqual(result.formatId, "for_time");
  assert.strictEqual(result.durationMinutes, 15);
});

test("a bare 'N min <movement>' line keeps minutes as its own unit instead of converting to seconds", function () {
  var result = parser.parseAdhocWorkout("30 min bike erg easy pace", MOVEMENTS);
  var line = result.lines[0];
  assert.strictEqual(line.movementId, "bike_cal");
  assert.strictEqual(line.amount, 30);
  assert.strictEqual(line.unit, "min");
  assert.ok(result.summaryText.indexOf("30 min Bike Erg") !== -1);
});

console.log(passed + " passed");
