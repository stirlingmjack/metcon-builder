/**
 * strength.js — Strength tab: renders the day's lettered blocks (with
 * supersets grouped), logs weight/reps per set, and generates the D-block
 * finisher via MetconGenerator using the same equipment/settings as the
 * Metcon tab. Self-contained (own DOMContentLoaded, own small helpers) —
 * only depends on the already-loaded MetconStrengthData / MetconGenerator
 * / MetconStorage globals.
 */
(function () {
  "use strict";

  var PROGRAM = MetconStrengthData.STRENGTH_PROGRAM;

  var els = {
    daySelect: document.getElementById("strength-day-select"),
    blocksContainer: document.getElementById("strength-blocks"),
    logCompleted: document.getElementById("strength-log-completed"),
    logNotes: document.getElementById("strength-log-notes"),
    logSaveBtn: document.getElementById("strength-log-save-btn"),
    logSavedMsg: document.getElementById("strength-log-saved-msg"),
    historyList: document.getElementById("strength-history-list"),
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

  function findDay(dayId) {
    return (
      PROGRAM.days.filter(function (d) {
        return d.id === dayId;
      })[0] || PROGRAM.days[0]
    );
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

  function targetLabel(block) {
    return block.sets + " × " + block.reps;
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

  function liftBlockHtml(block, savedSets) {
    var rows = "";
    for (var i = 0; i < block.sets; i++) {
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
        '" placeholder="kg" value="' +
        escapeHtml(saved.weight || "") +
        '" />' +
        '<input type="text" inputmode="numeric" class="set-reps" data-block="' +
        block.code +
        '" data-set-index="' +
        i +
        '" placeholder="reps" value="' +
        escapeHtml(saved.reps || "") +
        '" />' +
        "</div>";
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
      escapeHtml(targetLabel(block)) +
      "</span>" +
      "</div>" +
      '<div class="strength-sets">' +
      rows +
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

  function renderDay(dayId, existingEntry) {
    var day = findDay(dayId);
    var entryMatchesDay = existingEntry && existingEntry.dayId === dayId;
    var savedSets = (entryMatchesDay && existingEntry.sets) || {};
    var savedScores = (entryMatchesDay && existingEntry.finisherScores) || {};
    var savedFinishers = (entryMatchesDay && existingEntry.finishers) || {};

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
            return liftBlockHtml(block, savedSets[block.code]);
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

  function readEntryFromForm(dayId) {
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
    var entry = readEntryFromForm(els.daySelect.value);
    MetconStorage.saveStrengthEntry(todayKey, entry);
    MetconStorage.saveStrengthSettings({ dayId: els.daySelect.value });
    els.logSavedMsg.classList.remove("hidden");
    setTimeout(function () {
      els.logSavedMsg.classList.add("hidden");
    }, 1500);
    renderHistory();
  }

  function init() {
    populateDaySelect();

    var existing = MetconStorage.getStrengthEntry(todayKey);
    var strengthSettings = MetconStorage.loadStrengthSettings();
    var startingDayId = (existing && existing.dayId) || strengthSettings.dayId || PROGRAM.days[0].id;
    if (!findDay(startingDayId)) startingDayId = PROGRAM.days[0].id;

    els.daySelect.value = startingDayId;
    renderDay(startingDayId, existing);
    wireRegenerateButtons();

    if (existing) {
      els.logCompleted.checked = !!existing.completed;
      els.logNotes.value = existing.notes || "";
    }

    els.daySelect.addEventListener("change", function () {
      var freshExisting = MetconStorage.getStrengthEntry(todayKey);
      renderDay(els.daySelect.value, freshExisting);
      wireRegenerateButtons();
      MetconStorage.saveStrengthSettings({ dayId: els.daySelect.value });
    });

    els.logSaveBtn.addEventListener("click", saveSession);

    document.addEventListener("metcon:settings-saved", refreshFinishersForSettingsChange);

    renderHistory();
  }

  document.addEventListener("DOMContentLoaded", init);
})();
