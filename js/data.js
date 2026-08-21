/**
 * data.js — equipment defaults and the movement library.
 *
 * Pure data + no DOM access, so it can be loaded either as a browser
 * <script> (exposes window.MetconData) or required from Node (module.exports),
 * which is what test/generator.test.js does.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.MetconData = factory();
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  // ---------------------------------------------------------------------
  // Equipment
  // ---------------------------------------------------------------------

  // Ships pre-filled with the gear described for this build. Everything
  // here is editable from the Settings panel in the UI and persisted to
  // localStorage, so this is only the first-run default.
  var DEFAULT_EQUIPMENT = {
    bodyweight: true, // always available, not user-toggleable
    bikeErg: true,
    rowErg: true,
    kettlebells: {
      enabled: true,
      // one entry per bell you own, duplicates included (2x16 => two 16s)
      weightsKg: [16, 16, 20, 24, 24, 28],
    },
    sandbags: {
      enabled: true,
      weightsKg: [50, 90],
    },
    // Off by default — not mentioned as owned gear, but left wired up so
    // they're one checkbox away if the home gym grows.
    barbell: { enabled: false, weightsKg: [] },
    dumbbells: { enabled: true, weightsKg: [22.5, 22.5] },
    pullupBar: false,
    jumpRope: true,
    plyoBox: false,
    // 'small' | 'medium' | 'large'
    space: "medium",
  };

  // ---------------------------------------------------------------------
  // Movement library
  // ---------------------------------------------------------------------
  // equipment: key into the equipment config that must be enabled, or
  //   null for bodyweight-only movements.
  // requiresPair: needs two bells of the same weight available at once.
  // space: minimum floor space required ('small' fits anywhere; 'medium'
  //   needs a garage bay/living room; 'large' needs a yard/driveway).
  // pattern: rough movement pattern, used to keep a single workout from
  //   picking three squat-dominant movements in a row.
  // scheme: unit the base range is expressed in — 'reps' | 'cals' | 'sec'.
  // base: a [low, high] "moderate intensity, one round" range. The
  //   generator scales this per format and per selected intensity.

  var MOVEMENTS = [
    // --- Cardio / monostructural ---------------------------------------
    // Erg base ranges run a bit hot on purpose — real chipper/for-time pieces
    // tend to burn through 20-40+ cal a round, not a token 10-16.
    { id: "bike_cal", name: "Bike Erg", category: "erg", equipment: "bikeErg", space: "small", pattern: "cardio", scheme: "cals", base: [20, 35] },
    { id: "row_cal", name: "Row Erg", category: "erg", equipment: "rowErg", space: "small", pattern: "cardio", scheme: "cals", base: [20, 35] },
    // capReps: a hard override for specific formats (map of formatId ->
    // fixed rep count), regardless of intensity/base range. Burpees are
    // capped at 10 in AMRAP/For Time specifically — still scales normally
    // (and much higher) in Chipper.
    { id: "burpees", name: "Burpees", category: "bodyweight", equipment: null, space: "small", pattern: "cardio", scheme: "reps", base: [12, 24], capReps: { amrap: 10, for_time: 10 }, scaleNote: "Scale to step-back burpees (no push-up) if needed." },
    { id: "burpee_broad_jump", name: "Burpee Broad Jumps", category: "bodyweight", equipment: null, space: "medium", pattern: "cardio", scheme: "reps", base: [6, 12], disabled: true },
    { id: "mountain_climbers", name: "Mountain Climbers", category: "bodyweight", equipment: null, space: "small", pattern: "core", scheme: "reps", base: [20, 30] },
    { id: "high_knees", name: "High Knees", category: "bodyweight", equipment: null, space: "small", pattern: "cardio", scheme: "sec", base: [20, 30], disabled: true },
    { id: "jumping_jacks", name: "Jumping Jacks", category: "bodyweight", equipment: null, space: "small", pattern: "cardio", scheme: "reps", base: [20, 30], disabled: true },
    { id: "shuttle_run", name: "Shuttle Runs", category: "bodyweight", equipment: null, space: "medium", pattern: "cardio", scheme: "reps", base: [4, 8], disabled: true },
    { id: "star_jumps", name: "Star Jumps", category: "bodyweight", equipment: null, space: "small", pattern: "cardio", scheme: "reps", base: [12, 20], disabled: true },

    // --- Bodyweight strength / gymnastic --------------------------------
    { id: "pushups", name: "Push-ups", category: "bodyweight", equipment: null, space: "small", pattern: "push", scheme: "reps", base: [8, 13], scaleNote: "Scale to knee push-ups if needed." },
    { id: "air_squats", name: "Air Squats", category: "bodyweight", equipment: null, space: "small", pattern: "squat", scheme: "reps", base: [15, 25] },
    { id: "squat_jumps", name: "Squat Jumps", category: "bodyweight", equipment: null, space: "small", pattern: "squat", scheme: "reps", base: [10, 18] },
    { id: "walking_lunges", name: "Walking Lunges (steps)", category: "bodyweight", equipment: null, space: "medium", pattern: "squat", scheme: "reps", base: [16, 24] },
    { id: "stationary_lunges", name: "Alternating Stationary Lunges", category: "bodyweight", equipment: null, space: "small", pattern: "squat", scheme: "reps", base: [16, 24] },
    { id: "situps", name: "Sit-ups", category: "bodyweight", equipment: null, space: "small", pattern: "core", scheme: "reps", base: [15, 25], capReps: { amrap: 10, for_time: 10 } },
    { id: "vups", name: "V-ups", category: "bodyweight", equipment: null, space: "small", pattern: "core", scheme: "reps", base: [10, 18] },
    { id: "plank_hold", name: "Plank Hold", category: "bodyweight", equipment: null, space: "small", pattern: "core", scheme: "sec", base: [30, 50] },
    { id: "hollow_rock", name: "Hollow Rocks", category: "bodyweight", equipment: null, space: "small", pattern: "core", scheme: "reps", base: [15, 25], disabled: true },
    { id: "superman_raise", name: "Superman Raises", category: "bodyweight", equipment: null, space: "small", pattern: "core", scheme: "reps", base: [12, 20], disabled: true },
    { id: "bear_crawl", name: "Bear Crawl (steps)", category: "bodyweight", equipment: null, space: "medium", pattern: "full", scheme: "reps", base: [16, 24], disabled: true },
    { id: "crab_walk", name: "Crab Walk (steps)", category: "bodyweight", equipment: null, space: "medium", pattern: "full", scheme: "reps", base: [16, 24], disabled: true },

    // --- Kettlebell ------------------------------------------------------
    // Names spell out "(each side)" wherever the rep count is per arm —
    // matches how these get written on a whiteboard, and removes any
    // ambiguity about total-vs-per-side reps.
    { id: "kb_swing", name: "Kettlebell Swings", category: "kettlebell", equipment: "kettlebells", space: "small", pattern: "hinge", scheme: "reps", base: [15, 22] },
    { id: "kb_goblet_squat", name: "KB Goblet Squats", category: "kettlebell", equipment: "kettlebells", space: "small", pattern: "squat", scheme: "reps", base: [12, 18] },
    { id: "kb_front_rack_squat", name: "KB Front Rack Squats (each side)", category: "kettlebell", equipment: "kettlebells", eachSide: true, space: "small", pattern: "squat", scheme: "reps", base: [8, 14] },
    { id: "kb_clean_press", name: "KB Clean & Press (each side)", category: "kettlebell", equipment: "kettlebells", eachSide: true, space: "small", pattern: "push", scheme: "reps", base: [8, 14] },
    { id: "kb_push_press", name: "KB Push Press (each side)", category: "kettlebell", equipment: "kettlebells", eachSide: true, space: "small", pattern: "push", scheme: "reps", base: [8, 14] },
    { id: "kb_snatch", name: "KB Snatch (each side)", category: "kettlebell", equipment: "kettlebells", eachSide: true, space: "small", pattern: "pull", scheme: "reps", base: [10, 16] },
    { id: "kb_thruster", name: "KB Thruster (each side)", category: "kettlebell", equipment: "kettlebells", eachSide: true, space: "small", pattern: "squat", scheme: "reps", base: [10, 16] },
    { id: "kb_suitcase_deadlift", name: "KB Suitcase Deadlifts", category: "kettlebell", equipment: "kettlebells", space: "small", pattern: "hinge", scheme: "reps", base: [12, 18] },
    { id: "kb_reverse_lunge", name: "KB Reverse Lunges (each side)", category: "kettlebell", equipment: "kettlebells", eachSide: true, space: "small", pattern: "squat", scheme: "reps", base: [8, 14] },
    { id: "kb_row", name: "KB Row (each side)", category: "kettlebell", equipment: "kettlebells", eachSide: true, space: "small", pattern: "pull", scheme: "reps", base: [10, 16] },
    { id: "kb_tgu", name: "KB Turkish Get-ups (each side)", category: "kettlebell", equipment: "kettlebells", eachSide: true, space: "small", pattern: "full", scheme: "reps", base: [3, 6] },
    { id: "kb_front_rack_carry", name: "KB Front Rack Carry", category: "kettlebell", equipment: "kettlebells", requiresPair: true, space: "medium", pattern: "carry", scheme: "meters", base: [20, 35] },
    { id: "kb_suitcase_carry", name: "KB Suitcase Carry", category: "kettlebell", equipment: "kettlebells", space: "medium", pattern: "carry", scheme: "meters", base: [20, 35] },
    { id: "kb_halo", name: "KB Halos", category: "kettlebell", equipment: "kettlebells", space: "small", pattern: "core", scheme: "reps", base: [8, 14] },

    // --- Sandbag -----------------------------------------------------
    { id: "sb_squat", name: "Sandbag Squats", category: "sandbag", equipment: "sandbags", space: "small", pattern: "squat", scheme: "reps", base: [10, 16] },
    { id: "sb_lunge", name: "Sandbag Alternating Lunges", category: "sandbag", equipment: "sandbags", space: "medium", pattern: "squat", scheme: "reps", base: [14, 20] },
    // Capped at 50kg — cleaning the 90kg bag for reps isn't realistic.
    { id: "sb_clean", name: "Sandbag Cleans", category: "sandbag", equipment: "sandbags", maxWeightKg: 50, space: "small", pattern: "pull", scheme: "reps", base: [8, 14] },
    { id: "sb_over_shoulder", name: "Sandbag Over-the-Shoulder", category: "sandbag", equipment: "sandbags", space: "small", pattern: "carry", scheme: "reps", base: [8, 14] },
    { id: "sb_bear_hug_carry", name: "Sandbag Bear Hug Carry", category: "sandbag", equipment: "sandbags", space: "medium", pattern: "carry", scheme: "meters", base: [15, 30] },
    { id: "sb_get_up", name: "Sandbag Get-ups (each side)", category: "sandbag", equipment: "sandbags", space: "small", pattern: "full", scheme: "reps", base: [4, 8], disabled: true },

    // --- Optional gear (off by default) --------------------------------
    { id: "pullups", name: "Pull-ups", category: "pullup", equipment: "pullupBar", space: "small", pattern: "pull", scheme: "reps", base: [6, 10], scaleNote: "Scale to banded or ring rows if needed." },
    { id: "t2b", name: "Toes-to-Bar", category: "pullup", equipment: "pullupBar", space: "small", pattern: "core", scheme: "reps", base: [6, 10] },
    { id: "hanging_knee_raise", name: "Hanging Knee Raises", category: "pullup", equipment: "pullupBar", space: "small", pattern: "core", scheme: "reps", base: [8, 14] },
    { id: "du", name: "Double-Unders", category: "jumprope", equipment: "jumpRope", space: "small", pattern: "cardio", scheme: "reps", base: [20, 35] },
    { id: "su", name: "Single-Unders", category: "jumprope", equipment: "jumpRope", space: "small", pattern: "cardio", scheme: "reps", base: [30, 50] },
    { id: "box_jump", name: "Box Jumps", category: "box", equipment: "plyoBox", space: "small", pattern: "squat", scheme: "reps", base: [8, 14], scaleNote: "Scale to step-ups if needed." },
    { id: "box_step_up", name: "Box Step-ups (each side)", category: "box", equipment: "plyoBox", space: "small", pattern: "squat", scheme: "reps", base: [8, 14] },
    { id: "db_thruster", name: "Dumbbell Thrusters", category: "dumbbell", equipment: "dumbbells", requiresPair: true, space: "small", pattern: "squat", scheme: "reps", base: [10, 16] },
    { id: "db_snatch", name: "DB Single-Arm Snatch", category: "dumbbell", equipment: "dumbbells", space: "small", pattern: "pull", scheme: "reps", base: [8, 14] },
    { id: "bb_thruster", name: "Barbell Thrusters", category: "barbell", equipment: "barbell", space: "small", pattern: "squat", scheme: "reps", base: [8, 14] },
    { id: "bb_deadlift", name: "Barbell Deadlifts", category: "barbell", equipment: "barbell", space: "small", pattern: "hinge", scheme: "reps", base: [8, 14] },
  ];

  // ---------------------------------------------------------------------
  // Formats
  // ---------------------------------------------------------------------
  // repMultiplier scales a movement's base range for that format;
  // movementCount[intensity] is how many movements the format picks.

  var FORMATS = {
    amrap: {
      id: "amrap",
      name: "AMRAP",
      description: "As Many Rounds/Reps As Possible",
      repMultiplier: 1,
      movementCount: { light: 2, moderate: 3, hard: 4 },
    },
    for_time: {
      id: "for_time",
      name: "For Time",
      description: "Complete the rounds as fast as possible",
      repMultiplier: 1,
      movementCount: { light: 2, moderate: 3, hard: 4 },
    },
    emom: {
      id: "emom",
      name: "EMOM",
      description: "Every Minute on the Minute",
      repMultiplier: 0.5,
      movementCount: { light: 1, moderate: 2, hard: 3 },
    },
    tabata: {
      id: "tabata",
      name: "Tabata",
      description: "20s work / 10s rest x 8 rounds per movement",
      repMultiplier: null, // max-effort intervals, no prescribed reps
      movementCount: { light: 1, moderate: 2, hard: 3 },
    },
    interval: {
      id: "interval",
      name: "Interval",
      description: "3 rounds: work the block, rest between rounds",
      repMultiplier: 1,
      movementCount: { light: 2, moderate: 3, hard: 3 },
      rounds: 3,
      onMinutesOptions: [6, 7],
      restMinutes: 2,
    },
    chipper: {
      id: "chipper",
      name: "Chipper",
      description: "One trip through the whole list, split the reps however you want",
      repMultiplier: 3,
      movementCount: { light: 2, moderate: 3, hard: 4 },
    },
    complex: {
      id: "complex",
      name: "Complex",
      description: "Continuous flow, minimal rest — hold the same load the whole way through",
      repMultiplier: 0.7,
      movementCount: { light: 3, moderate: 4, hard: 4 },
      // Rounds are prescribed directly (not time-capped) — see buildFormatMeta.
      roundsRange: { light: [4, 6], moderate: [5, 8], hard: [6, 10] },
    },
  };

  // Relative odds each format gets picked (before excluding yesterday's
  // format). Weighted toward for_time/complex/chipper; tabata is at 0
  // (classic short-burst Tabata isn't a fit) in favor of the longer
  // interval format (3 rounds of 6-7 min on / 2 min off).
  var FORMAT_WEIGHTS = {
    amrap: 2,
    for_time: 3,
    emom: 1,
    tabata: 0,
    interval: 2,
    chipper: 2,
    complex: 3,
  };

  var INTENSITY_MULTIPLIER = { light: 0.8, moderate: 1.0, hard: 1.25 };

  var SPACE_RANK = { small: 0, medium: 1, large: 2 };

  // For Time / Chipper / Complex prescribe a fixed amount of *work*
  // (movement count, rounds) rather than being bound by the clock the way
  // AMRAP/EMOM/Interval naturally are. Their movementCount/roundsRange
  // tables were tuned assuming roughly this many minutes; the generator
  // scales that prescribed volume up or down against the selected
  // Duration relative to this reference so a 40-min chipper actually is
  // bigger than a 20-min one, not just a longer time cap on the same work.
  var DURATION_REFERENCE_MINUTES = 20;

  // Which durations a format actually makes sense at — a Chipper needs
  // enough time to hold several movements' worth of volume, while a short
  // AMRAP/For Time stops making sense once the session is long enough
  // that you'd want more variety than one continuous push. Applies both
  // to random ("Any") format selection and to which choices the manual
  // Type picker offers. Formats with no entry here (EMOM, Complex,
  // Interval) are considered fine at any duration.
  var FORMAT_DURATION_LIMITS = {
    chipper: { min: 26 },
    amrap: { max: 20 },
    for_time: { max: 20 },
    emom: { max: 32 },
  };

  return {
    DEFAULT_EQUIPMENT: DEFAULT_EQUIPMENT,
    MOVEMENTS: MOVEMENTS,
    FORMATS: FORMATS,
    FORMAT_WEIGHTS: FORMAT_WEIGHTS,
    FORMAT_DURATION_LIMITS: FORMAT_DURATION_LIMITS,
    INTENSITY_MULTIPLIER: INTENSITY_MULTIPLIER,
    SPACE_RANK: SPACE_RANK,
    DURATION_REFERENCE_MINUTES: DURATION_REFERENCE_MINUTES,
  };
});
