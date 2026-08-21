/**
 * app.js — DOM wiring. Everything here just reads/writes the DOM and
 * delegates the real work to MetconGenerator + MetconStorage.
 */
(function () {
  "use strict";

  var RECENT_DAYS_TO_AVOID = 3;

  var els = {
    todayLabel: document.getElementById("today-label"),
    settingsToggle: document.getElementById("settings-toggle"),
    settingsPanel: document.getElementById("settings-panel"),
    settingsForm: document.getElementById("settings-form"),
    settingsSavedMsg: document.getElementById("settings-saved-msg"),

    eqBike: document.getElementById("eq-bike"),
    eqRow: document.getElementById("eq-row"),
    eqKbEnabled: document.getElementById("eq-kb-enabled"),
    eqKbWeights: document.getElementById("eq-kb-weights"),
    eqSbEnabled: document.getElementById("eq-sb-enabled"),
    eqSbWeights: document.getElementById("eq-sb-weights"),
    eqSpace: document.getElementById("eq-space"),
    eqPullup: document.getElementById("eq-pullup"),
    eqJumprope: document.getElementById("eq-jumprope"),
    eqBox: document.getElementById("eq-box"),
    eqBarbellEnabled: document.getElementById("eq-barbell-enabled"),
    eqBarbellWeights: document.getElementById("eq-barbell-weights"),
    eqDbEnabled: document.getElementById("eq-db-enabled"),
    eqDbWeights: document.getElementById("eq-db-weights"),

    ctrlDuration: document.getElementById("ctrl-duration"),
    ctrlIntensity: document.getElementById("ctrl-intensity"),
    generateBtn: document.getElementById("generate-btn"),

    workoutCard: document.getElementById("workout-card"),

    logCompleted: document.getElementById("log-completed"),
    logRx: document.getElementById("log-rx"),
    logNotes: document.getElementById("log-notes"),
    logSaveBtn: document.getElementById("log-save-btn"),
    logSavedMsg: document.getElementById("log-saved-msg"),

    historyList: document.getElementById("history-list"),
  };

  var todayKey = MetconStorage.todayKey();

  // ---------------------------------------------------------------------
  // Settings <-> form
  // ---------------------------------------------------------------------

  function parseWeights(str) {
    return (str || "")
      .split(",")
      .map(function (s) {
        return parseFloat(s.trim());
      })
      .filter(function (n) {
        return !isNaN(n) && n > 0;
      });
  }

  function applySettingsToForm(settings) {
    var eq = settings.equipment;
    els.eqBike.checked = !!eq.bikeErg;
    els.eqRow.checked = !!eq.rowErg;
    els.eqKbEnabled.checked = !!(eq.kettlebells && eq.kettlebells.enabled);
    els.eqKbWeights.value = eq.kettlebells ? eq.kettlebells.weightsKg.join(", ") : "";
    els.eqSbEnabled.checked = !!(eq.sandbags && eq.sandbags.enabled);
    els.eqSbWeights.value = eq.sandbags ? eq.sandbags.weightsKg.join(", ") : "";
    els.eqSpace.value = eq.space || "medium";
    els.eqPullup.checked = !!eq.pullupBar;
    els.eqJumprope.checked = !!eq.jumpRope;
    els.eqBox.checked = !!eq.plyoBox;
    els.eqBarbellEnabled.checked = !!(eq.barbell && eq.barbell.enabled);
    els.eqBarbellWeights.value = eq.barbell ? eq.barbell.weightsKg.join(", ") : "";
    els.eqDbEnabled.checked = !!(eq.dumbbells && eq.dumbbells.enabled);
    els.eqDbWeights.value = eq.dumbbells ? eq.dumbbells.weightsKg.join(", ") : "";

    els.ctrlDuration.value = String(settings.duration);
    els.ctrlIntensity.value = settings.intensity;
  }

  function readSettingsFromForm() {
    return {
      equipment: {
        bodyweight: true,
        bikeErg: els.eqBike.checked,
        rowErg: els.eqRow.checked,
        kettlebells: { enabled: els.eqKbEnabled.checked, weightsKg: parseWeights(els.eqKbWeights.value) },
        sandbags: { enabled: els.eqSbEnabled.checked, weightsKg: parseWeights(els.eqSbWeights.value) },
        barbell: { enabled: els.eqBarbellEnabled.checked, weightsKg: parseWeights(els.eqBarbellWeights.value) },
        dumbbells: { enabled: els.eqDbEnabled.checked, weightsKg: parseWeights(els.eqDbWeights.value) },
        pullupBar: els.eqPullup.checked,
        jumpRope: els.eqJumprope.checked,
        plyoBox: els.eqBox.checked,
        space: els.eqSpace.value,
      },
      duration: parseInt(els.ctrlDuration.value, 10) || 20,
      intensity: els.ctrlIntensity.value,
    };
  }

  // ---------------------------------------------------------------------
  // Workout generation + rendering
  // ---------------------------------------------------------------------

  function currentControls() {
    return {
      duration: parseInt(els.ctrlDuration.value, 10) || 20,
      intensity: els.ctrlIntensity.value,
    };
  }

  function generateAndSave(opts) {
    var settings = MetconStorage.loadSettings();
    var controls = currentControls();
    var seed = opts && opts.deterministic ? todayKey : todayKey + ":" + Date.now() + ":" + Math.random();

    var recentIds = MetconStorage.getRecentMovementIds(todayKey, RECENT_DAYS_TO_AVOID);
    var lastFormatId = MetconStorage.getLastFormatId(todayKey);

    var workout;
    try {
      workout = MetconGenerator.generateWorkout({
        equipment: settings.equipment,
        duration: controls.duration,
        intensity: controls.intensity,
        seed: seed,
        recentMovementIds: recentIds,
        lastFormatId: lastFormatId,
      });
    } catch (e) {
      renderError(e.message);
      return;
    }

    MetconStorage.saveHistoryEntry(todayKey, {
      workout: workout,
      completed: false,
      rx: "rx",
      notes: "",
    });

    renderWorkout(workout);
    renderLogForm(MetconStorage.getEntry(todayKey));
    renderHistory();
  }

  function unitLabel(scheme) {
    if (scheme === "cals") return "cal";
    if (scheme === "sec") return "sec";
    return "reps";
  }

  function renderError(message) {
    els.workoutCard.innerHTML = '<div class="error-box">' + escapeHtml(message) + "</div>";
  }

  var SCORE_LABELS = {
    amrap: "Score: rounds + reps completed.",
    for_time: "Score: time to complete.",
    chipper: "Score: time to complete.",
    emom: "Score: reps completed each round (log your worst).",
    tabata: "Score: total reps across all intervals.",
  };

  function renderWorkout(workout) {
    var metaBits = [];
    if (workout.meta.timeCapMinutes != null) metaBits.push(workout.meta.timeCapMinutes + " min");
    if (workout.meta.rounds != null) metaBits.push(workout.meta.rounds + " rounds");
    if (workout.meta.totalMinutes != null) metaBits.push(workout.meta.totalMinutes + " min total");
    if (workout.formatId === "tabata") {
      metaBits.push(workout.movements.length * workout.meta.blockMinutes + " min total");
    }
    if (workout.formatId === "complex") {
      metaBits.push(
        workout.meta.roundsMin === workout.meta.roundsMax
          ? workout.meta.roundsMin + " rounds"
          : workout.meta.roundsMin + "–" + workout.meta.roundsMax + " rounds"
      );
      if (workout.sharedLoad) metaBits.push(capitalize(workout.sharedLoad.label) + ": " + workout.sharedLoad.value);
    }
    metaBits.push(capitalize(workout.intensity) + " intensity");

    var formatNotes = {
      amrap: "Reps below are per round — cycle through the list as many times as you can.",
      for_time: "Reps below are per round — complete every round listed, split however you want.",
      emom: "Reps below are the target for that movement's minute — rotate to the next movement each minute, repeating the cycle.",
      tabata: "Score max reps in each 20s interval; rest 10s between.",
      chipper: "Reps below are the total for that movement — one trip through the whole list, split however you want.",
      complex: workout.meta.unilateralBothSides
        ? "Continuous — complete everything on one side, unbroken, then repeat on the other side. Keep the pace sustainable."
        : "Continuous flow, minimal rest, same load the whole way through. Keep the pace sustainable.",
    };
    var formatNote = formatNotes[workout.formatId] || "";

    var itemsHtml = workout.movements
      .map(function (item) {
        var amount = item.amount != null ? item.amount + " " + unitLabel(item.scheme) : "Max effort";
        var load = item.load ? '<span class="movement-load">@ ' + escapeHtml(item.load) + "</span>" : "";
        return (
          "<li><span>" +
          escapeHtml(item.name) +
          load +
          '</span><span class="movement-amount">' +
          escapeHtml(amount) +
          "</span></li>"
        );
      })
      .join("");

    var scoreLine = SCORE_LABELS[workout.formatId];
    var scaleNotes = [];
    workout.movements.forEach(function (item) {
      if (item.scaleNote && scaleNotes.indexOf(item.scaleNote) === -1) scaleNotes.push(item.scaleNote);
    });
    var footerNotesHtml =
      (scoreLine ? '<div class="score-line">' + escapeHtml(scoreLine) + "</div>" : "") +
      (scaleNotes.length
        ? '<div class="scale-notes">' + scaleNotes.map(function (n) { return "Scale: " + escapeHtml(n); }).join("<br>") + "</div>"
        : "");

    els.workoutCard.innerHTML =
      '<div class="workout-card">' +
      '<div class="workout-card-header">' +
      "<div>" +
      '<span class="format-badge">' +
      escapeHtml(workout.formatName) +
      "</span>" +
      '<div class="format-desc">' +
      escapeHtml(workout.formatDescription) +
      "</div>" +
      "</div>" +
      '<div class="workout-meta">' +
      escapeHtml(metaBits.join(" · ")) +
      "</div>" +
      "</div>" +
      (formatNote ? '<div class="format-note">' + escapeHtml(formatNote) + "</div>" : "") +
      '<ul class="movement-list">' +
      itemsHtml +
      "</ul>" +
      (footerNotesHtml ? '<div class="score-footer">' + footerNotesHtml + "</div>" : "") +
      '<div class="card-footer">' +
      '<button class="btn btn-ghost" id="copy-workout-btn" type="button">📋 Copy</button>' +
      "</div>" +
      "</div>";

    var copyBtn = document.getElementById("copy-workout-btn");
    if (copyBtn) {
      copyBtn.addEventListener("click", function () {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(workout.text).then(
            function () {
              copyBtn.textContent = "✓ Copied";
              setTimeout(function () {
                copyBtn.textContent = "📋 Copy";
              }, 1500);
            },
            function () {
              /* clipboard denied — ignore silently, not critical */
            }
          );
        }
      });
    }
  }

  // ---------------------------------------------------------------------
  // Session log form (today)
  // ---------------------------------------------------------------------

  function renderLogForm(entry) {
    els.logCompleted.checked = !!(entry && entry.completed);
    els.logRx.value = (entry && entry.rx) || "rx";
    els.logNotes.value = (entry && entry.notes) || "";
  }

  function saveLog() {
    MetconStorage.saveHistoryEntry(todayKey, {
      completed: els.logCompleted.checked,
      rx: els.logRx.value,
      notes: els.logNotes.value,
    });
    els.logSavedMsg.classList.remove("hidden");
    setTimeout(function () {
      els.logSavedMsg.classList.add("hidden");
    }, 1500);
    renderHistory();
  }

  // ---------------------------------------------------------------------
  // History
  // ---------------------------------------------------------------------

  function renderHistory() {
    var entries = MetconStorage.getAllHistorySorted();
    if (entries.length === 0) {
      els.historyList.innerHTML = '<p class="empty-note">No workouts logged yet.</p>';
      return;
    }

    els.historyList.innerHTML = entries
      .map(function (row) {
        var entry = row.entry;
        var w = entry.workout;
        if (!w) return "";
        var statusClass = entry.completed ? "history-status done" : "history-status";
        var statusText = entry.completed ? "✓ " + capitalize(entry.rx || "rx") : "Not logged";
        var notesHtml = entry.notes ? '<div class="history-notes">' + escapeHtml(entry.notes) + "</div>" : "";
        return (
          "<details class=\"history-item\">" +
          "<summary>" +
          '<span class="history-summary-left">' +
          '<span class="history-date">' +
          escapeHtml(row.date) +
          "</span>" +
          '<span class="format-badge">' +
          escapeHtml(w.formatName) +
          "</span>" +
          "</span>" +
          '<span class="' +
          statusClass +
          '">' +
          escapeHtml(statusText) +
          "</span>" +
          "</summary>" +
          '<div class="history-body">' +
          escapeHtml(w.text) +
          "</div>" +
          notesHtml +
          "</details>"
        );
      })
      .join("");
  }

  // ---------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------

  function capitalize(s) {
    return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
  }

  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function formatTodayLabel() {
    var d = new Date();
    return d.toLocaleDateString(undefined, { weekday: "long", year: "numeric", month: "long", day: "numeric" });
  }

  // ---------------------------------------------------------------------
  // Init
  // ---------------------------------------------------------------------

  function init() {
    els.todayLabel.textContent = formatTodayLabel();

    var settings = MetconStorage.loadSettings();
    applySettingsToForm(settings);

    els.settingsToggle.addEventListener("click", function () {
      var isHidden = els.settingsPanel.classList.contains("hidden");
      els.settingsPanel.classList.toggle("hidden");
      els.settingsToggle.setAttribute("aria-expanded", String(isHidden));
    });

    els.settingsForm.addEventListener("submit", function (e) {
      e.preventDefault();
      var newSettings = readSettingsFromForm();
      MetconStorage.saveSettings(newSettings);
      els.settingsSavedMsg.classList.remove("hidden");
      setTimeout(function () {
        els.settingsSavedMsg.classList.add("hidden");
      }, 2000);
      generateAndSave({ deterministic: false });
    });

    els.generateBtn.addEventListener("click", function () {
      // Persist current duration/intensity as the new defaults for next visit.
      var settings2 = MetconStorage.loadSettings();
      settings2.duration = currentControls().duration;
      settings2.intensity = currentControls().intensity;
      MetconStorage.saveSettings(settings2);
      generateAndSave({ deterministic: false });
    });

    els.logSaveBtn.addEventListener("click", saveLog);

    // First paint: reuse today's workout if one was already generated
    // today (e.g. page reload), otherwise generate a deterministic one
    // seeded from the date so it's stable until explicitly regenerated.
    var existing = MetconStorage.getEntry(todayKey);
    if (existing && existing.workout) {
      renderWorkout(existing.workout);
      renderLogForm(existing);
    } else {
      generateAndSave({ deterministic: true });
    }

    renderHistory();
  }

  document.addEventListener("DOMContentLoaded", init);
})();
