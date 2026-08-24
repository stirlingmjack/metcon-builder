/**
 * adhoc.js — Log Workout tab: a textarea for "what I did today" that gets
 * run through MetconAdhocParser and saved as its own history entry
 * (MetconStorage's ad hoc list, not the date-keyed Metcon/Strength
 * history — you can log more than one ad hoc session on the same day, or
 * backfill an earlier date). Self-contained — own DOMContentLoaded, own
 * small helpers — same pattern as app.js/strength.js/progress.js.
 */
(function () {
  "use strict";

  var els = {
    date: document.getElementById("adhoc-date"),
    text: document.getElementById("adhoc-text"),
    saveBtn: document.getElementById("adhoc-save-btn"),
    savedMsg: document.getElementById("adhoc-saved-msg"),
    validationMsg: document.getElementById("adhoc-validation-msg"),
    list: document.getElementById("adhoc-list"),
  };

  if (!els.saveBtn || !els.list) return; // Log tab markup not present — nothing to do

  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function unmatchedCount(entry) {
    return (entry.parsed.lines || []).filter(function (l) {
      return !l.matched;
    }).length;
  }

  function entryStatusText(entry) {
    var total = (entry.parsed.lines || []).length;
    var unmatched = unmatchedCount(entry);
    if (total === 0) return "No movements recognized";
    if (unmatched === 0) return total + " movement" + (total === 1 ? "" : "s") + " recognized";
    return total - unmatched + "/" + total + " movements recognized";
  }

  function renderList() {
    var entries = MetconStorage.getAllAdhocHistorySorted();
    if (entries.length === 0) {
      els.list.innerHTML = '<p class="empty-note">No ad hoc workouts logged yet.</p>';
      return;
    }

    els.list.innerHTML = entries
      .map(function (entry) {
        var badge = entry.parsed.formatLabel || "Ad hoc";
        return (
          '<details class="history-item">' +
          "<summary>" +
          '<span class="history-summary-left">' +
          '<span class="history-date">' +
          escapeHtml(entry.date) +
          "</span>" +
          '<span class="format-badge adhoc-badge">' +
          escapeHtml(badge) +
          "</span>" +
          "</span>" +
          '<span class="history-status">' +
          escapeHtml(entryStatusText(entry)) +
          "</span>" +
          "</summary>" +
          '<div class="history-body">' +
          escapeHtml(entry.parsed.summaryText) +
          "</div>" +
          '<div class="history-notes"><em>Original: </em>' +
          escapeHtml(entry.rawText) +
          "</div>" +
          '<button class="btn btn-ghost adhoc-delete-btn" type="button" data-id="' +
          escapeHtml(entry.id) +
          '">🗑 Delete</button>' +
          "</details>"
        );
      })
      .join("");

    Array.prototype.forEach.call(els.list.querySelectorAll(".adhoc-delete-btn"), function (btn) {
      btn.addEventListener("click", function () {
        MetconStorage.deleteAdhocEntry(btn.getAttribute("data-id"));
        renderList();
      });
    });
  }

  function saveEntry() {
    var text = els.text.value.trim();
    if (!text) {
      els.validationMsg.textContent = "Type what you did first.";
      els.validationMsg.classList.remove("hidden");
      return;
    }
    els.validationMsg.classList.add("hidden");

    var parsed = MetconAdhocParser.parseAdhocWorkout(text, MetconData.MOVEMENTS);
    MetconStorage.addAdhocEntry({
      date: els.date.value || MetconStorage.todayKey(),
      rawText: text,
      parsed: parsed,
    });

    els.text.value = "";
    els.savedMsg.classList.remove("hidden");
    setTimeout(function () {
      els.savedMsg.classList.add("hidden");
    }, 1500);
    renderList();
  }

  function init() {
    els.date.value = MetconStorage.todayKey();
    els.saveBtn.addEventListener("click", saveEntry);
    renderList();
  }

  document.addEventListener("DOMContentLoaded", init);
  // A delete on this tab, or a fresh entry just saved, should be
  // reflected if the user hops back here later in the same session.
  document.addEventListener("metcon:tab-activated", function (e) {
    if (e.detail && e.detail.tab === "log") renderList();
  });
})();
