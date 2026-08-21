/**
 * storage.js — localStorage persistence for settings + workout history.
 * Browser-only (touches `localStorage`), so no Node/UMD export like the
 * other modules — this is wired up directly as a global for app.js.
 */
(function (root) {
  "use strict";

  var SETTINGS_KEY = "metcon.settings.v1";
  var HISTORY_KEY = "metcon.history.v1";
  var STRENGTH_SETTINGS_KEY = "metcon.strengthSettings.v1";
  var STRENGTH_HISTORY_KEY = "metcon.strengthHistory.v1";

  function safeParse(json, fallback) {
    if (!json) return fallback;
    try {
      var parsed = JSON.parse(json);
      return parsed == null ? fallback : parsed;
    } catch (e) {
      console.warn("metcon-builder: failed to parse stored data, using default.", e);
      return fallback;
    }
  }

  function todayKey(date) {
    var d = date || new Date();
    var y = d.getFullYear();
    var m = String(d.getMonth() + 1).padStart(2, "0");
    var day = String(d.getDate()).padStart(2, "0");
    return y + "-" + m + "-" + day;
  }

  // ---- settings -------------------------------------------------------

  function loadSettings() {
    var defaults = {
      equipment: JSON.parse(JSON.stringify(root.MetconData.DEFAULT_EQUIPMENT)),
      duration: 20,
      intensity: "moderate",
      // "" = Any (random, weighted); otherwise a forced format id (e.g. "chipper").
      type: "",
    };
    var stored = safeParse(localStorage.getItem(SETTINGS_KEY), null);
    if (!stored) return defaults;
    // Shallow-merge so new fields added in later versions still get defaults.
    return {
      equipment: Object.assign({}, defaults.equipment, stored.equipment || {}),
      duration: stored.duration || defaults.duration,
      intensity: stored.intensity || defaults.intensity,
      type: stored.type || defaults.type,
    };
  }

  function saveSettings(settings) {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  }

  // ---- history ----------------------------------------------------------
  // History is a map of "YYYY-MM-DD" -> { workout, completed, rx, notes, savedAt }.
  // Generalized over a storage key so the same shape can back both the
  // Metcon history and the Strength history (separate localStorage keys,
  // separate date-keyed maps).

  function loadHistoryFrom(key) {
    return safeParse(localStorage.getItem(key), {});
  }

  function saveHistoryTo(key, history) {
    localStorage.setItem(key, JSON.stringify(history));
  }

  function saveHistoryEntryTo(key, dateKey, entry) {
    var history = loadHistoryFrom(key);
    history[dateKey] = Object.assign({}, history[dateKey], entry, { savedAt: new Date().toISOString() });
    saveHistoryTo(key, history);
    return history[dateKey];
  }

  function getEntryFrom(key, dateKey) {
    var history = loadHistoryFrom(key);
    return history[dateKey] || null;
  }

  function getAllHistorySortedFrom(key) {
    var history = loadHistoryFrom(key);
    return Object.keys(history)
      .sort()
      .reverse()
      .map(function (k) {
        return { date: k, entry: history[k] };
      });
  }

  function loadHistory() {
    return loadHistoryFrom(HISTORY_KEY);
  }

  function saveHistoryEntry(dateKey, entry) {
    return saveHistoryEntryTo(HISTORY_KEY, dateKey, entry);
  }

  function getEntry(dateKey) {
    return getEntryFrom(HISTORY_KEY, dateKey);
  }

  // Returns { dates: [...sorted desc], entries: {...} } for the most recent N days,
  // excluding the given date (usually today, since that's the one being generated).
  function getRecentEntries(excludeDateKey, days) {
    var history = loadHistory();
    var keys = Object.keys(history)
      .filter(function (k) {
        return k !== excludeDateKey;
      })
      .sort()
      .reverse()
      .slice(0, days);
    return keys.map(function (k) {
      return { date: k, entry: history[k] };
    });
  }

  function getRecentMovementIds(excludeDateKey, days) {
    var recent = getRecentEntries(excludeDateKey, days);
    var ids = [];
    recent.forEach(function (r) {
      if (r.entry && r.entry.workout && r.entry.workout.movements) {
        r.entry.workout.movements.forEach(function (m) {
          ids.push(m.id);
        });
      }
    });
    return ids;
  }

  function getLastFormatId(excludeDateKey) {
    var recent = getRecentEntries(excludeDateKey, 1);
    if (recent.length && recent[0].entry && recent[0].entry.workout) {
      return recent[0].entry.workout.formatId;
    }
    return null;
  }

  function getAllHistorySorted() {
    return getAllHistorySortedFrom(HISTORY_KEY);
  }

  // ---- strength settings (currently just "which day was last picked") --

  function loadStrengthSettings() {
    var defaults = { dayId: null };
    var stored = safeParse(localStorage.getItem(STRENGTH_SETTINGS_KEY), null);
    if (!stored) return defaults;
    return { dayId: stored.dayId || defaults.dayId };
  }

  function saveStrengthSettings(settings) {
    localStorage.setItem(STRENGTH_SETTINGS_KEY, JSON.stringify(settings));
  }

  // ---- strength history --------------------------------------------------
  // Same date-keyed shape as the Metcon history, but a separate store:
  // { dayId, finisherWorkout, sets: { blockCode: [{weight, reps}, ...] },
  //   completed, notes, savedAt }

  function saveStrengthEntry(dateKey, entry) {
    return saveHistoryEntryTo(STRENGTH_HISTORY_KEY, dateKey, entry);
  }

  function getStrengthEntry(dateKey) {
    return getEntryFrom(STRENGTH_HISTORY_KEY, dateKey);
  }

  function getAllStrengthHistorySorted() {
    return getAllHistorySortedFrom(STRENGTH_HISTORY_KEY);
  }

  root.MetconStorage = {
    todayKey: todayKey,
    loadSettings: loadSettings,
    saveSettings: saveSettings,
    loadHistory: loadHistory,
    saveHistoryEntry: saveHistoryEntry,
    getEntry: getEntry,
    getRecentEntries: getRecentEntries,
    getRecentMovementIds: getRecentMovementIds,
    getLastFormatId: getLastFormatId,
    getAllHistorySorted: getAllHistorySorted,
    loadStrengthSettings: loadStrengthSettings,
    saveStrengthSettings: saveStrengthSettings,
    saveStrengthEntry: saveStrengthEntry,
    getStrengthEntry: getStrengthEntry,
    getAllStrengthHistorySorted: getAllStrengthHistorySorted,
  };
})(typeof window !== "undefined" ? window : this);
