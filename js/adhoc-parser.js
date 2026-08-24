/**
 * adhoc-parser.js — turns freeform "what I did today" text into a
 * structured workout (format guess, rounds/duration, and a per-line
 * movement/amount/weight breakdown), matched against the same movement
 * library the generator draws from. Pure logic, no DOM — same UMD
 * pattern as data.js/generator.js so it's unit-testable in Node.
 *
 * This is intentionally a best-effort heuristic parser, not real NLP: it
 * recognizes common shorthand (5x10, 24kg, "3 rounds", "AMRAP 20",
 * movement names/aliases) and leaves anything it can't confidently place
 * as an unmatched line — still tracked, just not translated.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.MetconAdhocParser = factory();
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var STOPWORDS = ["the", "a", "an", "of", "and", "each", "side", "with"];

  var FORMAT_PATTERNS = [
    { id: "amrap", label: "AMRAP", re: /\bamrap\b/i },
    { id: "emom", label: "EMOM", re: /\bemom\b/i },
    { id: "for_time", label: "For Time", re: /\bfor\s*time\b|\brft\b/i },
    { id: "chipper", label: "Chipper", re: /\bchipper\b/i },
    { id: "tabata", label: "Tabata", re: /\btabata\b/i },
  ];

  // Longer/more specific phrases are tried before shorter/generic ones —
  // see matchMovement, which sorts these by word count before matching.
  // A null value is an explicit "recognized phrase, but no library match".
  var SYNONYMS = {
    "push up": "pushups",
    "push ups": "pushups",
    pushup: "pushups",
    pushups: "pushups",
    "push-up": "pushups",
    "push-ups": "pushups",
    "pull up": "pullups",
    "pull ups": "pullups",
    pullup: "pullups",
    pullups: "pullups",
    "pull-up": "pullups",
    "pull-ups": "pullups",
    "sit up": "situps",
    "sit ups": "situps",
    situp: "situps",
    situps: "situps",
    "v up": "vups",
    "v ups": "vups",
    vup: "vups",
    vups: "vups",
    "double under": "du",
    "double unders": "du",
    dus: "du",
    "single under": "su",
    "single unders": "su",
    "assault bike": "bike_cal",
    "echo bike": "bike_cal",
    "air bike": "bike_cal",
    airbike: "bike_cal",
    "bike erg": "bike_cal",
    "stationary bike": "bike_cal",
    bike: "bike_cal",
    "row erg": "row_cal",
    "erg row": "row_cal",
    rowing: "row_cal",
    "kb row": "kb_row",
    "kb rows": "kb_row",
    "kettlebell row": "kb_row",
    "kettlebell rows": "kb_row",
    row: "row_cal",
    "kb swing": "kb_swing",
    "kb swings": "kb_swing",
    "kettlebell swing": "kb_swing",
    "kettlebell swings": "kb_swing",
    swing: "kb_swing",
    swings: "kb_swing",
    "goblet squat": "kb_goblet_squat",
    "goblet squats": "kb_goblet_squat",
    "turkish get up": "kb_tgu",
    "turkish get ups": "kb_tgu",
    tgu: "kb_tgu",
    tgus: "kb_tgu",
    "toes to bar": "t2b",
    "toes-to-bar": "t2b",
    t2b: "t2b",
    "box jump": "box_jump",
    "box jumps": "box_jump",
    "box step up": "box_step_up",
    "box step ups": "box_step_up",
    "step up": "box_step_up",
    "step ups": "box_step_up",
    thruster: "db_thruster",
    thrusters: "db_thruster",
    snatch: "db_snatch",
    snatches: "db_snatch",
    deadlift: "bb_deadlift",
    deadlifts: "bb_deadlift",
    "farmer carry": "kb_suitcase_carry",
    "farmers carry": "kb_suitcase_carry",
    "farmer's carry": "kb_suitcase_carry",
    "suitcase carry": "kb_suitcase_carry",
    "sandbag carry": "sb_bear_hug_carry",
    "bear hug carry": "sb_bear_hug_carry",
    "sandbag clean": "sb_clean",
    "sandbag cleans": "sb_clean",
    "sandbag squat": "sb_squat",
    "sandbag squats": "sb_squat",
    "sandbag lunge": "sb_lunge",
    "sandbag lunges": "sb_lunge",
    "mountain climber": "mountain_climbers",
    "mountain climbers": "mountain_climbers",
    "air squat": "air_squats",
    "air squats": "air_squats",
    squat: "air_squats",
    squats: "air_squats",
    lunge: "walking_lunges",
    lunges: "walking_lunges",
    plank: "plank_hold",
    "plank hold": "plank_hold",
    burpee: "burpees",
    burpees: "burpees",
    "knee raise": "hanging_knee_raise",
    "knee raises": "hanging_knee_raise",
    "hanging knee raise": "hanging_knee_raise",
    "hanging knee raises": "hanging_knee_raise",
  };
  var SYNONYM_KEYS = Object.keys(SYNONYMS).sort(function (a, b) {
    return b.split(/\s+/).length - a.split(/\s+/).length || b.length - a.length;
  });

  function normalizeWords(text) {
    return text
      .toLowerCase()
      .replace(/[^a-z0-9\s/-]/g, " ")
      .split(/\s+/)
      .filter(Boolean);
  }

  function buildKeywordIndex(movements) {
    return movements.map(function (m) {
      var normalized = m.name.toLowerCase().replace(/\(.*?\)/g, " ");
      var words = normalizeWords(normalized).filter(function (w) {
        return STOPWORDS.indexOf(w) === -1;
      });
      return { id: m.id, words: words };
    });
  }

  // Header phrasing that names a format and/or rounds — "AMRAP 20:",
  // "5 Rounds:", "For Time:", "EMOM 12 min:" — is stripped off the front
  // of a line before movement-line parsing, whether it's the whole line
  // ("AMRAP 20:" on its own) or just a prefix ("EMOM 12 min: 10 burpees").
  var HEADER_PREFIX_RES = [
    /^(\d+\s*(min|mins|minutes)\s+)?(amrap|emom|for\s*time|rft|chipper|tabata)\b\s*(\d+\s*(min|mins|minutes)?)?\s*[:\-]?\s*/i,
    /^\d+\s*rounds?\s*(for\s*time|amrap)?\s*[:\-]?\s*/i,
  ];

  function stripHeaderPrefix(line) {
    var result = line;
    HEADER_PREFIX_RES.forEach(function (re) {
      result = result.replace(re, "");
    });
    return result.trim();
  }

  function parseHeader(fullText) {
    var format = null;
    for (var i = 0; i < FORMAT_PATTERNS.length; i++) {
      if (FORMAT_PATTERNS[i].re.test(fullText)) {
        format = FORMAT_PATTERNS[i];
        break;
      }
    }
    var duration = null;
    var minMatch = fullText.match(/(\d+)\s*(?:min|mins|minutes)\b/i);
    if (minMatch) {
      duration = parseInt(minMatch[1], 10);
    } else if (format && (format.id === "amrap" || format.id === "emom")) {
      // Only AMRAP/EMOM conventionally state "<format> <number>" meaning a
      // duration ("AMRAP 20", "EMOM 12") — for_time/chipper/tabata don't,
      // and the number right after them is more likely the first
      // movement's rep count ("For Time: 10 burpees..."), not a duration.
      // format.re.source may itself contain a top-level "|" (e.g. for_time's
      // "for\s*time|rft") — wrap it so the appended suffix binds to the
      // whole alternation, not just its last branch.
      var afterFormat = fullText.match(new RegExp("(?:" + format.re.source + ")\\s*[:\\-]?\\s*(\\d+)", "i"));
      if (afterFormat) duration = parseInt(afterFormat[1], 10);
    }
    var rounds = null;
    var roundsMatch = fullText.match(/(\d+)\s*rounds?\b/i);
    if (roundsMatch) rounds = parseInt(roundsMatch[1], 10);
    if (!format && rounds) format = { id: "rounds", label: "Rounds" };
    return {
      formatId: format ? format.id : null,
      formatLabel: format ? format.label : null,
      durationMinutes: duration,
      rounds: rounds,
    };
  }

  function splitCommaSegments(line) {
    if (line.indexOf(",") === -1) return [line];
    var parts = line
      .split(",")
      .map(function (p) {
        return p.trim();
      })
      .filter(Boolean);
    var withDigits = parts.filter(function (p) {
      return /\d/.test(p);
    });
    // Only split when every comma-separated part looks like its own
    // movement (has a number) — a sentence with one incidental number
    // ("Ran a quick 5k, felt strong the whole way") should stay whole.
    if (parts.length > 1 && withDigits.length === parts.length) return parts;
    return [line];
  }

  function matchMovement(segment, movements, keywordIndex) {
    for (var i = 0; i < SYNONYM_KEYS.length; i++) {
      var key = SYNONYM_KEYS[i];
      var re = new RegExp("\\b" + key.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&") + "\\b", "i");
      if (re.test(segment)) {
        var id = SYNONYMS[key];
        if (!id) return null;
        var found = movements.filter(function (m) {
          return m.id === id;
        })[0];
        if (found) return found;
      }
    }
    var segWords = normalizeWords(segment);
    var best = null;
    var bestScore = 0;
    keywordIndex.forEach(function (entry) {
      if (entry.words.length === 0) return;
      var score = 0;
      entry.words.forEach(function (w) {
        if (segWords.indexOf(w) !== -1) score++;
      });
      if (score === entry.words.length && score > bestScore) {
        bestScore = score;
        best = entry;
      }
    });
    if (!best) return null;
    return movements.filter(function (m) {
      return m.id === best.id;
    })[0];
  }

  function parseNumbers(segment) {
    var weightMatch = segment.match(/(\d+(?:\.\d+)?)\s*(kgs?|kilograms?|lbs?|pounds?)\b/i);
    var weight = null;
    if (weightMatch) {
      var unitLabel = /^k/i.test(weightMatch[2]) ? "kg" : "lb";
      weight = weightMatch[1] + " " + unitLabel;
    }

    var sxr = segment.match(/(\d+)\s*[x×]\s*(\d+)/i);
    if (sxr) {
      return { sets: parseInt(sxr[1], 10), amount: parseInt(sxr[2], 10), unit: "reps", weight: weight };
    }

    var distMatch = segment.match(/(\d+(?:\.\d+)?)\s*(m|meters|metres)\b/i);
    if (distMatch) return { sets: null, amount: parseFloat(distMatch[1]), unit: "meters", weight: weight };

    var calMatch = segment.match(/(\d+(?:\.\d+)?)\s*(cal|cals|calories)\b/i);
    if (calMatch) return { sets: null, amount: parseFloat(calMatch[1]), unit: "cals", weight: weight };

    var secMatch = segment.match(/(\d+(?:\.\d+)?)\s*(sec|secs|seconds)\b/i);
    if (secMatch) return { sets: null, amount: parseFloat(secMatch[1]), unit: "sec", weight: weight };

    var minMatch = segment.match(/(\d+(?:\.\d+)?)\s*(min|mins|minutes)\b/i);
    if (minMatch) return { sets: null, amount: parseFloat(minMatch[1]), unit: "min", weight: weight };

    var amount = null;
    var numberRe = /\d+(?:\.\d+)?/g;
    var m;
    while ((m = numberRe.exec(segment))) {
      if (weightMatch && m.index >= weightMatch.index && m.index < weightMatch.index + weightMatch[0].length) continue;
      amount = parseFloat(m[0]);
      break;
    }
    return { sets: null, amount: amount, unit: amount != null ? "reps" : null, weight: weight };
  }

  // A plain-text summary of the parsed result — same role as generator.js's
  // workout.text: a readable rendering the DOM layer can just escape and
  // drop into a history entry, no markup-building logic duplicated there.
  function buildSummaryText(header, lines) {
    var headerBits = [];
    if (header.formatLabel) headerBits.push(header.formatLabel);
    if (header.durationMinutes != null) headerBits.push(header.durationMinutes + " min");
    if (header.rounds != null) headerBits.push(header.rounds + " rounds");

    var bodyLines = lines.map(function (l) {
      if (!l.matched) {
        return "  " + l.raw + "  (not recognized — kept as typed)";
      }
      var amountBit = "";
      if (l.sets != null && l.amount != null) {
        amountBit = l.sets + "x" + l.amount;
      } else if (l.amount != null) {
        var unitSuffix =
          l.unit === "sec" ? " sec" : l.unit === "min" ? " min" : l.unit === "meters" ? " m" : l.unit === "cals" ? " cal" : "";
        amountBit = l.amount + unitSuffix;
      }
      if (l.eachSide && amountBit) amountBit += "/side";
      var line = "  " + (amountBit ? amountBit + " " : "") + l.movementName;
      if (l.weight) line += " @ " + l.weight;
      return line;
    });

    var parts = [];
    if (headerBits.length) parts.push(headerBits.join(" · "));
    if (bodyLines.length) parts.push(bodyLines.join("\n"));
    return parts.join("\n") || "(nothing recognized)";
  }

  function parseAdhocWorkout(rawText, movements) {
    var text = String(rawText || "");
    var header = parseHeader(text);
    var keywordIndex = buildKeywordIndex(movements);

    var rawLines = text
      .split(/\r?\n/)
      .map(function (l) {
        return l.trim();
      })
      .filter(Boolean);

    var segments = [];
    rawLines.forEach(function (line) {
      var cleaned = line.replace(/^[-*•]\s*/, "").replace(/^\d+[).]\s+/, "");
      var stripped = stripHeaderPrefix(cleaned);
      if (!stripped) return; // pure header line, fully consumed above
      splitCommaSegments(stripped).forEach(function (p) {
        var trimmed = p.trim();
        if (trimmed) segments.push(trimmed);
      });
    });

    var lines = segments.map(function (seg) {
      var nums = parseNumbers(seg);
      var movement = matchMovement(seg, movements, keywordIndex);
      var eachSide = /\/\s*(side|leg)\b|each side\b/i.test(seg);
      return {
        raw: seg,
        movementId: movement ? movement.id : null,
        movementName: movement ? movement.name : null,
        sets: nums.sets,
        amount: nums.amount,
        unit: nums.unit,
        weight: nums.weight,
        eachSide: eachSide,
        matched: !!movement,
      };
    });

    return {
      formatId: header.formatId,
      formatLabel: header.formatLabel,
      durationMinutes: header.durationMinutes,
      rounds: header.rounds,
      lines: lines,
      summaryText: buildSummaryText(header, lines),
    };
  }

  return {
    parseAdhocWorkout: parseAdhocWorkout,
  };
});
