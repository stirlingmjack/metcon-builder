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
    ctrlType: document.getElementById("ctrl-type"),
    generateBtn: document.getElementById("generate-btn"),

    workoutCard: document.getElementById("workout-card"),

    logCompleted: document.getElementById("log-completed"),
    logRx: document.getElementById("log-rx"),
    logScoreRow: document.getElementById("log-score-row"),
    logScore: document.getElementById("log-score"),
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

    updateTypeOptionsAvailability();
    var storedType = settings.type || "";
    var storedOption = els.ctrlType.querySelector('option[value="' + storedType + '"]');
    els.ctrlType.value = storedOption && !storedOption.disabled ? storedType : "";
  }

  // Greys out (disables) Type options that don't fit the current Duration
  // (see FORMAT_DURATION_LIMITS in data.js) — e.g. Chipper is unselectable
  // under 26 min. Falls back the selection to "Any" if the option the user
  // had picked just became invalid.
  function updateTypeOptionsAvailability() {
    var duration = parseInt(els.ctrlDuration.value, 10) || 20;
    var previousValue = els.ctrlType.value;
    Array.prototype.forEach.call(els.ctrlType.options, function (opt) {
      if (!opt.value) return; // "Any" is always selectable
      opt.disabled = !MetconGenerator.isFormatEligibleForDuration(opt.value, duration);
    });
    var currentOption = els.ctrlType.querySelector('option[value="' + previousValue + '"]');
    if (currentOption && currentOption.disabled) {
      els.ctrlType.value = "";
    }
  }

  // Pre-fills the Duration/Intensity/Type controls from a Calendar-tab
  // plan for today, before the first-paint deterministic generation runs
  // — so "auto-apply" just means "the controls already reflect the plan"
  // rather than any special-cased generation path.
  function applyPlanToControls(planMetcon) {
    if (planMetcon.duration) els.ctrlDuration.value = String(planMetcon.duration);
    if (planMetcon.intensity) els.ctrlIntensity.value = planMetcon.intensity;
    updateTypeOptionsAvailability();
    var storedType = planMetcon.type || "";
    var storedOption = els.ctrlType.querySelector('option[value="' + storedType + '"]');
    els.ctrlType.value = storedOption && !storedOption.disabled ? storedType : "";
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
      type: els.ctrlType.value, // "" = Any
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
        forcedFormatId: controls.type || null,
      });
    } catch (e) {
      renderError(e.message);
      return;
    }

    MetconStorage.saveHistoryEntry(todayKey, {
      workout: workout,
      completed: false,
      rx: "rx",
      score: "",
      notes: "",
    });

    renderWorkout(workout);
    renderLogForm(MetconStorage.getEntry(todayKey));
    renderHistory();
  }

  function unitLabel(scheme) {
    if (scheme === "cals") return "cal";
    if (scheme === "sec") return "sec";
    if (scheme === "meters") return "m";
    return "reps";
  }

  function renderError(message) {
    els.workoutCard.innerHTML = '<div class="error-box">' + escapeHtml(message) + "</div>";
  }

  // Shown instead of a generated workout when today is planned as a rest
  // day (see the Calendar tab) — a suggestion, not a lock: Generate still
  // works normally if you change your mind.
  function renderRestDay() {
    els.workoutCard.innerHTML =
      '<div class="rest-day-card">' +
      "<strong>🛌 Rest day planned for today.</strong>" +
      '<p>Hit <span class="rest-day-hint">Generate</span> below if you change your mind.</p>' +
      "</div>";
  }

  var SCORE_LABELS = {
    amrap: "Score: rounds + reps completed.",
    for_time: "Score: time to complete.",
    chipper: "Score: time to complete.",
    emom: "Score: reps completed each round (log your worst).",
    tabata: "Score: total reps across all intervals.",
    interval: "Score: reps completed each round.",
  };

  // Drives the "Score" field in Log Session — label/placeholder per
  // format, keyed the same as SCORE_LABELS. Complex has no entry, which
  // hides the field entirely (it isn't scored, just paced).
  var SCORE_FIELD_LABELS = {
    amrap: { label: "Score (rounds + reps)", placeholder: "e.g. 6 rounds + 14" },
    for_time: { label: "Score (time)", placeholder: "e.g. 18:42" },
    chipper: { label: "Score (time)", placeholder: "e.g. 22:10" },
    emom: { label: "Score (reps, lowest round)", placeholder: "e.g. 12" },
    tabata: { label: "Score (total reps)", placeholder: "e.g. 145" },
    interval: { label: "Score (reps each round)", placeholder: "e.g. 14 / 16 / 15" },
  };

  function renderWorkout(workout) {
    var metaBits = [];
    if (workout.meta.timeCapMinutes != null) metaBits.push(workout.meta.timeCapMinutes + " min");
    if (workout.meta.rounds != null && workout.formatId !== "interval") metaBits.push(workout.meta.rounds + " rounds");
    if (workout.meta.totalMinutes != null) metaBits.push(workout.meta.totalMinutes + " min total");
    if (workout.formatId === "tabata") {
      metaBits.push(workout.movements.length * workout.meta.blockMinutes + " min total");
    }
    if (workout.formatId === "interval") {
      metaBits.push(workout.meta.rounds + " × (" + workout.meta.onMinutes + " min on / " + workout.meta.restMinutes + " min off)");
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
      interval: "Each round is its own AMRAP block — reps below are per round, cycle through the list as many times as you can, then rest.",
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

    var formatId = entry && entry.workout ? entry.workout.formatId : null;
    var fieldInfo = formatId ? SCORE_FIELD_LABELS[formatId] : null;
    if (fieldInfo) {
      els.logScoreRow.classList.remove("hidden");
      els.logScoreRow.firstChild.textContent = fieldInfo.label;
      els.logScore.placeholder = fieldInfo.placeholder;
      els.logScore.value = (entry && entry.score) || "";
    } else {
      els.logScoreRow.classList.add("hidden");
      els.logScore.value = "";
    }
  }

  function saveLog() {
    MetconStorage.saveHistoryEntry(todayKey, {
      completed: els.logCompleted.checked,
      rx: els.logRx.value,
      score: els.logScoreRow.classList.contains("hidden") ? "" : els.logScore.value,
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

  function renderMetconHistoryRow(date, entry) {
    var w = entry.workout;
    if (!w) return "";
    var statusClass = entry.completed ? "history-status done" : "history-status";
    var statusText = entry.completed ? "✓ " + capitalize(entry.rx || "rx") + (entry.score ? " · " + entry.score : "") : "Not logged";
    var notesHtml = entry.notes ? '<div class="history-notes">' + escapeHtml(entry.notes) + "</div>" : "";
    return (
      '<details class="history-item">' +
      "<summary>" +
      '<span class="history-summary-left">' +
      '<span class="history-date">' +
      escapeHtml(date) +
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
  }

  // Ad hoc entries (from the Log Workout tab) live in their own storage
  // list, not this date-keyed history — see MetconStorage's adhoc-*
  // functions — but get merged into this same list for a single combined
  // timeline, tagged so they're easy to tell apart from a generated one.
  function renderAdhocHistoryRow(entry) {
    var lines = (entry.parsed && entry.parsed.lines) || [];
    var unmatched = lines.filter(function (l) {
      return !l.matched;
    }).length;
    var statusText =
      lines.length === 0
        ? "No movements recognized"
        : unmatched === 0
        ? lines.length + " movement" + (lines.length === 1 ? "" : "s") + " recognized"
        : lines.length - unmatched + "/" + lines.length + " movements recognized";
    return (
      '<details class="history-item">' +
      "<summary>" +
      '<span class="history-summary-left">' +
      '<span class="history-date">' +
      escapeHtml(entry.date) +
      "</span>" +
      '<span class="format-badge adhoc-badge">' +
      escapeHtml((entry.parsed && entry.parsed.formatLabel) || "Ad hoc") +
      "</span>" +
      "</span>" +
      '<span class="history-status">' +
      escapeHtml(statusText) +
      "</span>" +
      "</summary>" +
      '<div class="history-body">' +
      escapeHtml((entry.parsed && entry.parsed.summaryText) || "") +
      "</div>" +
      '<div class="history-notes"><em>Original: </em>' +
      escapeHtml(entry.rawText || "") +
      "</div>" +
      '<button class="btn btn-ghost adhoc-delete-btn" type="button" data-id="' +
      escapeHtml(entry.id) +
      '">🗑 Delete</button>' +
      "</details>"
    );
  }

  function renderHistory() {
    var metconRows = MetconStorage.getAllHistorySorted()
      .filter(function (row) {
        return row.entry && row.entry.workout;
      })
      .map(function (row) {
        return { sortKey: row.date + "|" + (row.entry.savedAt || ""), html: renderMetconHistoryRow(row.date, row.entry) };
      });
    var adhocRows = MetconStorage.getAllAdhocHistorySorted().map(function (entry) {
      return { sortKey: entry.date + "|" + (entry.savedAt || ""), html: renderAdhocHistoryRow(entry) };
    });
    var combined = metconRows.concat(adhocRows).sort(function (a, b) {
      return b.sortKey.localeCompare(a.sortKey);
    });

    if (combined.length === 0) {
      els.historyList.innerHTML = '<p class="empty-note">No workouts logged yet.</p>';
      return;
    }

    els.historyList.innerHTML = combined
      .map(function (row) {
        return row.html;
      })
      .join("");

    Array.prototype.forEach.call(els.historyList.querySelectorAll(".adhoc-delete-btn"), function (btn) {
      btn.addEventListener("click", function () {
        MetconStorage.deleteAdhocEntry(btn.getAttribute("data-id"));
        renderHistory();
      });
    });
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

  // Simple two-tab show/hide — content in both tabs renders on page load
  // regardless of which is visible (see strength.js), so switching is
  // just a visibility/aria toggle, nothing to (re)generate on click.
  function initTabs() {
    var tabs = ["metcon", "strength", "progress", "log", "calendar"]
      .map(function (name) {
        return {
          name: name,
          btn: document.getElementById("tab-btn-" + name),
          panel: document.getElementById(name + "-tab-panel"),
        };
      })
      .filter(function (t) {
        return t.btn && t.panel;
      });
    if (tabs.length === 0) return;

    function activate(name) {
      tabs.forEach(function (t) {
        var isActive = t.name === name;
        t.btn.classList.toggle("active", isActive);
        t.btn.setAttribute("aria-selected", String(isActive));
        t.panel.classList.toggle("hidden", !isActive);
      });
      // Data logged on another tab (e.g. a Strength session just saved)
      // may affect this one — let it refresh itself on activation instead
      // of only ever rendering once at page load.
      document.dispatchEvent(new CustomEvent("metcon:tab-activated", { detail: { tab: name } }));
    }

    tabs.forEach(function (t) {
      t.btn.addEventListener("click", function () {
        activate(t.name);
      });
    });
    activate("metcon");
  }

  function init() {
    els.todayLabel.textContent = formatTodayLabel();

    var settings = MetconStorage.loadSettings();
    applySettingsToForm(settings);

    els.settingsToggle.addEventListener("click", function () {
      var isHidden = els.settingsPanel.classList.contains("hidden");
      els.settingsPanel.classList.toggle("hidden");
      els.settingsToggle.setAttribute("aria-expanded", String(isHidden));
    });

    initTabs();
    // An ad hoc entry logged on the Log Workout tab merges into this
    // tab's History — refresh it whenever we're switched back to.
    document.addEventListener("metcon:tab-activated", function (e) {
      if (e.detail && e.detail.tab === "metcon") renderHistory();
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
      // Equipment is shared with the Strength tab's finisher block — let
      // it know to refresh too, same as this tab just did.
      document.dispatchEvent(new CustomEvent("metcon:settings-saved"));
    });

    els.ctrlDuration.addEventListener("change", updateTypeOptionsAvailability);

    els.generateBtn.addEventListener("click", function () {
      // Persist current duration/intensity/type as the new defaults for next visit.
      var settings2 = MetconStorage.loadSettings();
      var controls = currentControls();
      settings2.duration = controls.duration;
      settings2.intensity = controls.intensity;
      settings2.type = controls.type;
      MetconStorage.saveSettings(settings2);
      generateAndSave({ deterministic: false });
    });

    els.logSaveBtn.addEventListener("click", saveLog);

    // First paint: reuse today's workout if one was already generated
    // today (e.g. page reload), otherwise generate a deterministic one
    // seeded from the date so it's stable until explicitly regenerated —
    // unless today was planned (Calendar tab) as a rest day, or with
    // specific Metcon settings to pre-fill before generating.
    var existing = MetconStorage.getEntry(todayKey);
    if (existing && existing.workout) {
      renderWorkout(existing.workout);
      renderLogForm(existing);
    } else {
      var todaysPlan = MetconStorage.getPlan(todayKey);
      if (todaysPlan && todaysPlan.type === "rest") {
        renderRestDay();
      } else {
        if (todaysPlan && todaysPlan.type === "metcon" && todaysPlan.metcon) {
          applyPlanToControls(todaysPlan.metcon);
        }
        generateAndSave({ deterministic: true });
      }
    }

    renderHistory();
  }

  document.addEventListener("DOMContentLoaded", init);
})();
