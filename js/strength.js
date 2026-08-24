/**
 * strength.js — Strength tab: renders the day's lettered blocks (with
 * supersets grouped), logs weight/reps per set, generates the D-block
 * finisher via MetconGenerator using the same equipment/settings as the
 * Metcon tab, and drives the 8-week "Easy Strength" progression for each
 * day's main lift (WEEK_SCHEMES in strength-data.js) using the stored
 * 1RMs to suggest a weight. Self-contained (own DOMContentLoaded, own
 * small helpers) — only depends on the already-loaded MetconStrengthData
 * / MetconGenerator / MetconStorage globals.
 */
(function () {
  "use strict";

  var PROGRAM = MetconStrengthData.STRENGTH_PROGRAM;
  var MAIN_LIFTS = MetconStrengthData.MAIN_LIFTS;
  var WEEK_SCHEMES = MetconStrengthData.WEEK_SCHEMES;

  var els = {
    daySelect: document.getElementById("strength-day-select"),
    weekSelect: document.getElementById("strength-week-select"),
    maxesGrid: document.getElementById("maxes-grid"),
    blocksContainer: document.getElementById("strength-blocks"),
    logCompleted: document.getElementById("strength-log-completed"),
    logNotes: document.getElementById("strength-log-notes"),
    logSaveBtn: document.getElementById("strength-log-save-btn"),
    logSavedMsg: document.getElementById("strength-log-saved-msg"),
    historyList: document.getElementById("strength-history-list"),
    restNote: document.getElementById("strength-rest-note"),
  };

  if (!els.daySelect) return; // strength tab markup not present — nothing to do

  var todayKey = MetconStorage.todayKey();

  // In-memory record of any generated finisher workouts, keyed by block
  // code (usually just "D"), so Save doesn't have to re-derive them from
  // the DOM.
  var finisherWorkouts = {};

  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function capitalize(s) {
    return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
  }

  function roundToNearest(val, step) {
    return Math.round(val / step) * step;
  }

  function findDay(dayId) {
    return (
      PROGRAM.days.filter(function (d) {
        return d.id === dayId;
      })[0] || PROGRAM.days[0]
    );
  }

  function schemeForWeek(weekNumber) {
    return WEEK_SCHEMES[weekNumber - 1] || WEEK_SCHEMES[0];
  }

  // Groups consecutive blocks that share a `superset` id together, so
  // B1/B2 (and C1/C2) render as one paired unit.
  function groupBlocks(blocks) {
    var groups = [];
    var seen = {};
    blocks.forEach(function (b) {
      if (b.superset) {
        if (seen[b.superset]) {
          seen[b.superset].push(b);
        } else {
          var group = [b];
          seen[b.superset] = group;
          groups.push(group);
        }
      } else {
        groups.push([b]);
      }
    });
    return groups;
  }

  function generateFinisher(block, seedSuffix) {
    var settings = MetconStorage.loadSettings();
    var seed = todayKey + ":" + block.code + (seedSuffix ? ":" + seedSuffix : "");
    return MetconGenerator.generateWorkout({
      equipment: settings.equipment,
      duration: block.finisher.durationMinutes,
      intensity: settings.intensity,
      seed: seed,
      forcedFormatId: block.finisher.format,
    });
  }

  function renderSetRows(block, savedSets, rowSpecs) {
    var rows = "";
    rowSpecs.forEach(function (spec, i) {
      var saved = (savedSets && savedSets[i]) || {};
      rows +=
        '<div class="strength-set-row">' +
        '<span class="set-label">Set ' +
        (i + 1) +
        "</span>" +
        '<input type="text" inputmode="decimal" class="set-weight" data-block="' +
        block.code +
        '" data-set-index="' +
        i +
        '" placeholder="' +
        escapeHtml(spec.weightPlaceholder) +
        '" value="' +
        escapeHtml(saved.weight || "") +
        '" />' +
        '<input type="text" inputmode="numeric" class="set-reps" data-block="' +
        block.code +
        '" data-set-index="' +
        i +
        '" placeholder="' +
        escapeHtml(spec.repsPlaceholder) +
        '" value="' +
        escapeHtml(saved.reps || "") +
        '" />' +
        "</div>";
    });
    return rows;
  }

  // A fixed lift just repeats "kg"/"reps" placeholders `sets` times. A
  // progressesWithWeek lift pulls its set/rep shape and %1RM from the
  // current week's scheme, and — if a 1RM is on file for it — suggests a
  // weight (rounded to the nearest 2.5kg plate).
  function liftBlockHtml(block, savedSets, weekNumber, maxes) {
    var targetText, note, rowSpecs;

    if (block.progressesWithWeek) {
      var scheme = schemeForWeek(weekNumber);
      var oneRepMax = maxes && maxes[block.liftKey];
      var suggested = oneRepMax ? roundToNearest((oneRepMax * scheme.percent) / 100, 2.5) : null;
      targetText = "Week " + scheme.week + " · " + scheme.label + " @ " + scheme.percent + "%" + (suggested ? " (~" + suggested + " kg)" : "");
      note = scheme.isTest
        ? "Easy Strength test week — work up toward a heavy single for the day."
        : "Easy Strength: same 6-10 total reps at high intensity, different shape each week.";
      rowSpecs = scheme.setReps.map(function (reps) {
        return { repsPlaceholder: String(reps), weightPlaceholder: suggested ? suggested + " kg" : "kg" };
      });
    } else {
      targetText = block.sets + " × " + block.reps;
      note = null;
      rowSpecs = [];
      for (var i = 0; i < block.sets; i++) rowSpecs.push({ repsPlaceholder: "reps", weightPlaceholder: "kg" });
    }

    return (
      '<div class="strength-block" data-code="' +
      block.code +
      '">' +
      '<div class="strength-block-header">' +
      '<span class="strength-block-code">' +
      escapeHtml(block.code) +
      "</span>" +
      '<span class="strength-block-name">' +
      escapeHtml(block.name) +
      "</span>" +
      '<span class="strength-block-target">' +
      escapeHtml(targetText) +
      "</span>" +
      "</div>" +
      (note ? '<div class="strength-block-note">' + escapeHtml(note) + "</div>" : "") +
      '<div class="strength-sets">' +
      renderSetRows(block, savedSets, rowSpecs) +
      "</div>" +
      "</div>"
    );
  }

  function finisherBlockHtml(block, workout, savedScore) {
    finisherWorkouts[block.code] = workout;
    var metaBits = [];
    if (workout.meta.timeCapMinutes != null) metaBits.push(workout.meta.timeCapMinutes + " min");
    if (workout.meta.rounds != null) metaBits.push(workout.meta.rounds + " rounds");
    if (workout.meta.totalMinutes != null) metaBits.push(workout.meta.totalMinutes + " min total");
    metaBits.push(capitalize(workout.intensity) + " intensity");

    // Everything after the first two header lines (name + description,
    // already shown via the badge) — reuses the plain-text description
    // MetconGenerator already builds rather than re-implementing the
    // Metcon tab's full rich card.
    var bodyLines = workout.text.split("\n").slice(2).join("\n");

    return (
      '<div class="strength-block strength-finisher" data-code="' +
      block.code +
      '">' +
      '<div class="strength-block-header">' +
      '<span class="strength-block-code">' +
      escapeHtml(block.code) +
      "</span>" +
      '<span class="strength-block-name">' +
      escapeHtml(block.name) +
      "</span>" +
      "</div>" +
      '<div class="workout-card finisher-card">' +
      '<div class="workout-card-header">' +
      '<span class="format-badge">' +
      escapeHtml(workout.formatName) +
      "</span>" +
      '<span class="workout-meta">' +
      escapeHtml(metaBits.join(" · ")) +
      "</span>" +
      "</div>" +
      '<pre class="finisher-text">' +
      escapeHtml(bodyLines) +
      "</pre>" +
      '<div class="card-footer">' +
      '<button class="btn btn-ghost finisher-regenerate-btn" type="button" data-block="' +
      block.code +
      '">🎲 Regenerate</button>' +
      "</div>" +
      "</div>" +
      '<label class="field-row finisher-score-row">' +
      "Score" +
      '<input type="text" class="finisher-score" data-block="' +
      block.code +
      '" placeholder="e.g. 4 rounds + 12" value="' +
      escapeHtml(savedScore || "") +
      '" />' +
      "</label>" +
      "</div>"
    );
  }

  function renderDay(dayId, weekNumber, existingEntry) {
    var day = findDay(dayId);
    var entryMatches = existingEntry && existingEntry.dayId === dayId && existingEntry.weekNumber === weekNumber;
    var savedSets = (entryMatches && existingEntry.sets) || {};
    var savedScores = (entryMatches && existingEntry.finisherScores) || {};
    var savedFinishers = (entryMatches && existingEntry.finishers) || {};
    var maxes = MetconStorage.loadStrengthMaxes();

    finisherWorkouts = {};
    var groups = groupBlocks(day.blocks);

    els.blocksContainer.innerHTML = groups
      .map(function (group) {
        var inner = group
          .map(function (block) {
            if (block.finisher) {
              var workout = savedFinishers[block.code] || generateFinisher(block);
              return finisherBlockHtml(block, workout, savedScores[block.code]);
            }
            return liftBlockHtml(block, savedSets[block.code], weekNumber, maxes);
          })
          .join("");
        if (group.length > 1) {
          return '<div class="superset-group"><div class="superset-label">Superset</div>' + inner + "</div>";
        }
        return inner;
      })
      .join("");
  }

  // Regenerates a single finisher block in place (fresh random reseed),
  // preserving whatever the user already typed into its Score field.
  function regenerateFinisherBlock(container, seedSuffix) {
    var code = container.getAttribute("data-code");
    var day = findDay(els.daySelect.value);
    var block = day.blocks.filter(function (b) {
      return b.code === code;
    })[0];
    if (!block) return;
    var workout = generateFinisher(block, seedSuffix);
    var scoreInput = container.querySelector(".finisher-score");
    var savedScore = scoreInput ? scoreInput.value : "";
    container.outerHTML = finisherBlockHtml(block, workout, savedScore);
    wireRegenerateButtons();
  }

  // Wires every ".finisher-regenerate-btn" currently in the DOM. Safe to
  // call repeatedly — each button is marked once it's wired so a fresh
  // call after a re-render only picks up newly-inserted buttons.
  function wireRegenerateButtons() {
    Array.prototype.forEach.call(els.blocksContainer.querySelectorAll(".finisher-regenerate-btn"), function (btn) {
      if (btn._wired) return;
      btn._wired = true;
      btn.addEventListener("click", function () {
        regenerateFinisherBlock(btn.closest(".strength-block"), Date.now() + ":" + Math.random());
      });
    });
  }

  // Equipment/space lives in the shared Settings panel — when it's saved
  // (from either tab), refresh every finisher block on the currently
  // displayed day so it reflects the new equipment, same as the Metcon
  // tab already does for itself. Logged sets/notes are untouched.
  function refreshFinishersForSettingsChange() {
    Array.prototype.forEach.call(els.blocksContainer.querySelectorAll(".strength-finisher"), function (container) {
      regenerateFinisherBlock(container, "settings-refresh:" + Date.now());
    });
  }

  function currentWeekNumber() {
    return parseInt(els.weekSelect.value, 10) || 1;
  }

  // Re-renders the currently selected day/week from whatever's saved for
  // today (or blank, if nothing matches) — used whenever Day, Week, or a
  // 1RM changes.
  function rerenderCurrentDay() {
    var freshExisting = MetconStorage.getStrengthEntry(todayKey);
    renderDay(els.daySelect.value, currentWeekNumber(), freshExisting);
    wireRegenerateButtons();
  }

  function readEntryFromForm(dayId, weekNumber) {
    var sets = {};
    Array.prototype.forEach.call(els.blocksContainer.querySelectorAll(".strength-block[data-code]"), function (blockEl) {
      var code = blockEl.getAttribute("data-code");
      if (blockEl.classList.contains("strength-finisher")) return;
      var weightInputs = blockEl.querySelectorAll(".set-weight");
      var repInputs = blockEl.querySelectorAll(".set-reps");
      var rows = [];
      for (var i = 0; i < weightInputs.length; i++) {
        rows.push({ weight: weightInputs[i].value, reps: repInputs[i] ? repInputs[i].value : "" });
      }
      sets[code] = rows;
    });

    var finisherScores = {};
    Array.prototype.forEach.call(els.blocksContainer.querySelectorAll(".finisher-score"), function (input) {
      finisherScores[input.getAttribute("data-block")] = input.value;
    });

    return {
      dayId: dayId,
      weekNumber: weekNumber,
      sets: sets,
      finishers: finisherWorkouts,
      finisherScores: finisherScores,
      completed: els.logCompleted.checked,
      notes: els.logNotes.value,
    };
  }

  function populateDaySelect() {
    els.daySelect.innerHTML = PROGRAM.days
      .map(function (d) {
        return '<option value="' + escapeHtml(d.id) + '">' + escapeHtml(d.name) + "</option>";
      })
      .join("");
  }

  function populateWeekSelect() {
    els.weekSelect.innerHTML = WEEK_SCHEMES.map(function (w) {
      return '<option value="' + w.week + '">Week ' + w.week + (w.isTest ? " (Test)" : "") + "</option>";
    }).join("");
  }

  function renderMaxesGrid() {
    var maxes = MetconStorage.loadStrengthMaxes();
    els.maxesGrid.innerHTML = MAIN_LIFTS.map(function (lift) {
      var val = maxes[lift.id];
      return (
        '<label class="field-row">' +
        escapeHtml(lift.label) +
        '<input type="text" inputmode="decimal" class="max-input" data-lift="' +
        lift.id +
        '" placeholder="e.g. 100" value="' +
        (val != null ? escapeHtml(String(val)) : "") +
        '" />' +
        "</label>"
      );
    }).join("");

    Array.prototype.forEach.call(els.maxesGrid.querySelectorAll(".max-input"), function (input) {
      input.addEventListener("change", function () {
        var m = MetconStorage.loadStrengthMaxes();
        var liftKey = input.getAttribute("data-lift");
        var raw = input.value.trim();
        if (raw === "") {
          delete m[liftKey];
        } else {
          var val = parseFloat(raw);
          if (!isNaN(val) && val > 0) m[liftKey] = val;
        }
        MetconStorage.saveStrengthMaxes(m);
        rerenderCurrentDay(); // suggested weights depend on maxes
      });
    });
  }

  function renderHistory() {
    var entries = MetconStorage.getAllStrengthHistorySorted();
    if (entries.length === 0) {
      els.historyList.innerHTML = '<p class="empty-note">No strength sessions logged yet.</p>';
      return;
    }
    els.historyList.innerHTML = entries
      .map(function (row) {
        var entry = row.entry;
        var day = findDay(entry.dayId);
        var statusClass = entry.completed ? "history-status done" : "history-status";
        var statusText = entry.completed ? "✓ Completed" : "Not logged";
        var weekLabel = entry.weekNumber ? "Week " + entry.weekNumber : "";

        var setsSummary = Object.keys(entry.sets || {})
          .map(function (code) {
            var block = day.blocks.filter(function (b) {
              return b.code === code;
            })[0];
            var name = block ? block.name : code;
            var setsText = (entry.sets[code] || [])
              .map(function (s) {
                return s.weight || s.reps ? (s.weight || "-") + "kg × " + (s.reps || "-") : null;
              })
              .filter(Boolean)
              .join(", ");
            return setsText ? escapeHtml(code + " " + name) + ": " + escapeHtml(setsText) : "";
          })
          .filter(Boolean)
          .join("\n");

        var finisherSummary = Object.keys(entry.finisherScores || {})
          .map(function (code) {
            var score = entry.finisherScores[code];
            return score ? escapeHtml(code) + " score: " + escapeHtml(score) : "";
          })
          .filter(Boolean)
          .join("\n");

        var bodyText = [setsSummary, finisherSummary].filter(Boolean).join("\n");
        var notesHtml = entry.notes ? '<div class="history-notes">' + escapeHtml(entry.notes) + "</div>" : "";

        return (
          '<details class="history-item">' +
          "<summary>" +
          '<span class="history-summary-left">' +
          '<span class="history-date">' +
          escapeHtml(row.date) +
          "</span>" +
          '<span class="format-badge">' +
          escapeHtml(day.name) +
          "</span>" +
          (weekLabel ? '<span class="format-badge">' + escapeHtml(weekLabel) + "</span>" : "") +
          "</span>" +
          '<span class="' +
          statusClass +
          '">' +
          escapeHtml(statusText) +
          "</span>" +
          "</summary>" +
          (bodyText ? '<div class="history-body">' + escapeHtml(bodyText) + "</div>" : "") +
          notesHtml +
          "</details>"
        );
      })
      .join("");
  }

  function saveSession() {
    var weekNumber = currentWeekNumber();
    var entry = readEntryFromForm(els.daySelect.value, weekNumber);
    MetconStorage.saveStrengthEntry(todayKey, entry);
    MetconStorage.saveStrengthSettings({ dayId: els.daySelect.value, weekNumber: weekNumber });
    els.logSavedMsg.classList.remove("hidden");
    setTimeout(function () {
      els.logSavedMsg.classList.add("hidden");
    }, 1500);
    renderHistory();
  }

  function init() {
    populateDaySelect();
    populateWeekSelect();
    renderMaxesGrid();

    var existing = MetconStorage.getStrengthEntry(todayKey);
    var strengthSettings = MetconStorage.loadStrengthSettings();
    // A Calendar-tab plan for today only steps in when nothing's been
    // logged for today yet — it never overrides an already-saved session.
    var todaysPlan = MetconStorage.getPlan(todayKey);
    var plannedStrength = !existing && todaysPlan && todaysPlan.type === "strength" && todaysPlan.strength;
    var startingDayId = (existing && existing.dayId) || (plannedStrength && todaysPlan.strength.dayId) || strengthSettings.dayId || PROGRAM.days[0].id;
    if (!findDay(startingDayId)) startingDayId = PROGRAM.days[0].id;
    var startingWeek = (existing && existing.weekNumber) || (plannedStrength && todaysPlan.strength.weekNumber) || strengthSettings.weekNumber || 1;
    if (startingWeek < 1 || startingWeek > WEEK_SCHEMES.length) startingWeek = 1;

    if (els.restNote) {
      var isRestPlanned = !existing && todaysPlan && todaysPlan.type === "rest";
      els.restNote.classList.toggle("hidden", !isRestPlanned);
    }

    els.daySelect.value = startingDayId;
    els.weekSelect.value = String(startingWeek);
    renderDay(startingDayId, startingWeek, existing);
    wireRegenerateButtons();

    if (existing) {
      els.logCompleted.checked = !!existing.completed;
      els.logNotes.value = existing.notes || "";
    }

    function persistDayWeekChoice() {
      MetconStorage.saveStrengthSettings({ dayId: els.daySelect.value, weekNumber: currentWeekNumber() });
    }

    els.daySelect.addEventListener("change", function () {
      rerenderCurrentDay();
      persistDayWeekChoice();
    });
    els.weekSelect.addEventListener("change", function () {
      rerenderCurrentDay();
      persistDayWeekChoice();
    });

    els.logSaveBtn.addEventListener("click", saveSession);

    document.addEventListener("metcon:settings-saved", refreshFinishersForSettingsChange);

    renderHistory();
  }

  document.addEventListener("DOMContentLoaded", init);
})();
