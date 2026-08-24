/**
 * calendar.js — Calendar tab: a classic month grid showing what you did
 * (or planned) each day, and a per-day planner so you can pick ahead of
 * time what you're doing (Metcon/Strength/Rest) for any date. Reads
 * across all three history stores (Metcon, Strength, ad hoc) plus the
 * plan store, but writes only to MetconStorage's plan functions — it
 * never touches history itself. Self-contained (own DOMContentLoaded,
 * own small helpers) — same pattern as the other DOM-wiring files.
 */
(function () {
  "use strict";

  var PROGRAM = MetconStrengthData.STRENGTH_PROGRAM;
  var WEEK_SCHEMES = MetconStrengthData.WEEK_SCHEMES;

  var MONTH_NAMES = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
  ];

  var els = {
    monthLabel: document.getElementById("cal-month-label"),
    grid: document.getElementById("calendar-grid"),
    prevBtn: document.getElementById("cal-prev-btn"),
    nextBtn: document.getElementById("cal-next-btn"),
    detailDateLabel: document.getElementById("cal-detail-date-label"),
    detailHistory: document.getElementById("cal-detail-history"),
    planType: document.getElementById("cal-plan-type"),
    planMetconFields: document.getElementById("cal-plan-metcon-fields"),
    planStrengthFields: document.getElementById("cal-plan-strength-fields"),
    planDuration: document.getElementById("cal-plan-duration"),
    planIntensity: document.getElementById("cal-plan-intensity"),
    planFormat: document.getElementById("cal-plan-format"),
    planDay: document.getElementById("cal-plan-day"),
    planWeek: document.getElementById("cal-plan-week"),
    planSaveBtn: document.getElementById("cal-plan-save-btn"),
    planClearBtn: document.getElementById("cal-plan-clear-btn"),
    planSavedMsg: document.getElementById("cal-plan-saved-msg"),
  };

  if (!els.grid) return; // calendar tab markup not present — nothing to do

  var todayKey = MetconStorage.todayKey();
  var todayDate = new Date();
  var viewYear = todayDate.getFullYear();
  var viewMonth = todayDate.getMonth(); // 0-indexed
  var selectedDate = null;

  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function capitalize(s) {
    return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
  }

  function pad2(n) {
    return String(n).padStart(2, "0");
  }

  function dateKeyFor(y, m, d) {
    return y + "-" + pad2(m + 1) + "-" + pad2(d);
  }

  function findDay(dayId) {
    return PROGRAM.days.filter(function (d) {
      return d.id === dayId;
    })[0];
  }

  function formatDateLabel(dateStr) {
    var parts = dateStr.split("-").map(Number);
    if (parts.length !== 3) return dateStr;
    var d = new Date(parts[0], parts[1] - 1, parts[2]);
    return d.toLocaleDateString(undefined, { weekday: "long", year: "numeric", month: "long", day: "numeric" });
  }

  function populateDaySelect() {
    els.planDay.innerHTML = PROGRAM.days
      .map(function (d) {
        return '<option value="' + escapeHtml(d.id) + '">' + escapeHtml(d.name) + "</option>";
      })
      .join("");
  }

  function populateWeekSelect() {
    els.planWeek.innerHTML = WEEK_SCHEMES.map(function (w) {
      return '<option value="' + w.week + '">Week ' + w.week + " — " + escapeHtml(w.label) + "</option>";
    }).join("");
  }

  // ---------------------------------------------------------------------
  // Month grid
  // ---------------------------------------------------------------------

  function badgesFor(dateStr, maps) {
    var badges = [];
    var metconEntry = maps.metcon[dateStr];
    var strengthEntry = maps.strength[dateStr];
    var adhocList = maps.adhocByDate[dateStr] || [];
    var plan = maps.plans[dateStr];

    if (metconEntry && metconEntry.workout) {
      badges.push({ cls: "cal-dot-metcon", letter: "M", title: "Metcon: " + metconEntry.workout.formatName });
    } else if (plan && plan.type === "metcon") {
      badges.push({ cls: "cal-dot-metcon planned", letter: "M", title: "Planned: Metcon" });
    }

    if (strengthEntry) {
      var day = findDay(strengthEntry.dayId);
      badges.push({ cls: "cal-dot-strength", letter: "S", title: "Strength: " + (day ? day.name : strengthEntry.dayId) });
    } else if (plan && plan.type === "strength") {
      badges.push({ cls: "cal-dot-strength planned", letter: "S", title: "Planned: Strength" });
    }

    if (adhocList.length) {
      badges.push({ cls: "cal-dot-adhoc", letter: "A", title: adhocList.length + " ad hoc log" + (adhocList.length === 1 ? "" : "s") });
    }

    if (plan && plan.type === "rest") {
      badges.push({ cls: "cal-dot-rest", letter: "R", title: "Planned: Rest day" });
    }

    return badges;
  }

  function renderCell(cell, maps) {
    var badges = badgesFor(cell.date, maps);
    var classes = ["calendar-day"];
    if (cell.otherMonth) classes.push("other-month");
    if (cell.date === todayKey) classes.push("today");
    if (cell.date === selectedDate) classes.push("selected");

    var badgesHtml = badges
      .map(function (b) {
        return '<span class="cal-dot ' + b.cls + '" title="' + escapeHtml(b.title) + '">' + b.letter + "</span>";
      })
      .join("");

    return (
      '<button type="button" class="' +
      classes.join(" ") +
      '" data-date="' +
      cell.date +
      '">' +
      '<span class="calendar-day-number">' +
      cell.day +
      "</span>" +
      '<span class="calendar-day-badges">' +
      badgesHtml +
      "</span>" +
      "</button>"
    );
  }

  function renderGrid() {
    var adhocByDate = {};
    MetconStorage.getAllAdhocHistorySorted().forEach(function (entry) {
      (adhocByDate[entry.date] = adhocByDate[entry.date] || []).push(entry);
    });
    var maps = {
      metcon: MetconStorage.loadHistory(),
      strength: MetconStorage.loadStrengthHistory(),
      plans: MetconStorage.loadPlans(),
      adhocByDate: adhocByDate,
    };

    els.monthLabel.textContent = MONTH_NAMES[viewMonth] + " " + viewYear;

    var firstOfMonth = new Date(viewYear, viewMonth, 1);
    var startWeekday = firstOfMonth.getDay(); // 0 = Sunday
    var daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
    var daysInPrevMonth = new Date(viewYear, viewMonth, 0).getDate();
    var prevMonth = viewMonth === 0 ? 11 : viewMonth - 1;
    var prevYear = viewMonth === 0 ? viewYear - 1 : viewYear;
    var nextMonth = viewMonth === 11 ? 0 : viewMonth + 1;
    var nextYear = viewMonth === 11 ? viewYear + 1 : viewYear;

    var cells = [];
    for (var i = startWeekday - 1; i >= 0; i--) {
      var pd = daysInPrevMonth - i;
      cells.push({ date: dateKeyFor(prevYear, prevMonth, pd), day: pd, otherMonth: true });
    }
    for (var d = 1; d <= daysInMonth; d++) {
      cells.push({ date: dateKeyFor(viewYear, viewMonth, d), day: d, otherMonth: false });
    }
    var trailing = 1;
    while (cells.length < 42) {
      cells.push({ date: dateKeyFor(nextYear, nextMonth, trailing), day: trailing, otherMonth: true });
      trailing++;
    }

    els.grid.innerHTML = cells
      .map(function (cell) {
        return renderCell(cell, maps);
      })
      .join("");

    Array.prototype.forEach.call(els.grid.querySelectorAll(".calendar-day"), function (btn) {
      btn.addEventListener("click", function () {
        selectDay(btn.getAttribute("data-date"));
      });
    });
  }

  function goToMonth(deltaMonths) {
    viewMonth += deltaMonths;
    if (viewMonth < 0) {
      viewMonth = 11;
      viewYear--;
    } else if (viewMonth > 11) {
      viewMonth = 0;
      viewYear++;
    }
    renderGrid();
  }

  // ---------------------------------------------------------------------
  // Detail panel: what happened that day + the plan form
  // ---------------------------------------------------------------------

  function renderHistoryForDate(dateStr) {
    var metconEntry = MetconStorage.getEntry(dateStr);
    var strengthEntry = MetconStorage.getStrengthEntry(dateStr);
    var adhocEntries = MetconStorage.getAllAdhocHistorySorted().filter(function (e) {
      return e.date === dateStr;
    });

    var blocks = [];

    if (metconEntry && metconEntry.workout) {
      var w = metconEntry.workout;
      var statusText = metconEntry.completed
        ? "✓ " + capitalize(metconEntry.rx || "rx") + (metconEntry.score ? " · " + metconEntry.score : "")
        : "Not logged";
      blocks.push(
        '<div class="cal-detail-entry">' +
          '<div class="cal-detail-entry-header"><span class="format-badge">' +
          escapeHtml(w.formatName) +
          '</span><span class="history-status">' +
          escapeHtml(statusText) +
          "</span></div>" +
          '<div class="history-body">' +
          escapeHtml(w.text) +
          "</div>" +
          (metconEntry.notes ? '<div class="history-notes">' + escapeHtml(metconEntry.notes) + "</div>" : "") +
          "</div>"
      );
    }

    if (strengthEntry) {
      var day = findDay(strengthEntry.dayId);
      var weekLabel = strengthEntry.weekNumber ? "Week " + strengthEntry.weekNumber : "";
      var statusText2 = strengthEntry.completed ? "✓ Completed" : "Not marked complete";
      blocks.push(
        '<div class="cal-detail-entry">' +
          '<div class="cal-detail-entry-header"><span class="format-badge cal-strength-badge">' +
          escapeHtml((day ? day.name : strengthEntry.dayId) + (weekLabel ? " · " + weekLabel : "")) +
          '</span><span class="history-status">' +
          escapeHtml(statusText2) +
          "</span></div>" +
          (strengthEntry.notes ? '<div class="history-notes">' + escapeHtml(strengthEntry.notes) + "</div>" : "") +
          "</div>"
      );
    }

    adhocEntries.forEach(function (entry) {
      blocks.push(
        '<div class="cal-detail-entry">' +
          '<div class="cal-detail-entry-header"><span class="format-badge adhoc-badge">' +
          escapeHtml((entry.parsed && entry.parsed.formatLabel) || "Ad hoc") +
          "</span></div>" +
          '<div class="history-body">' +
          escapeHtml((entry.parsed && entry.parsed.summaryText) || "") +
          "</div>" +
          "</div>"
      );
    });

    els.detailHistory.innerHTML =
      blocks.length === 0 ? '<p class="empty-note">Nothing logged for this day.</p>' : blocks.join("");
  }

  function togglePlanFields() {
    var type = els.planType.value;
    els.planMetconFields.classList.toggle("hidden", type !== "metcon");
    els.planStrengthFields.classList.toggle("hidden", type !== "strength");
  }

  function renderPlanForm(dateStr) {
    var plan = MetconStorage.getPlan(dateStr);
    els.planType.value = plan ? plan.type : "";
    togglePlanFields();

    if (plan && plan.type === "metcon" && plan.metcon) {
      els.planDuration.value = String(plan.metcon.duration || 20);
      els.planIntensity.value = plan.metcon.intensity || "moderate";
      els.planFormat.value = plan.metcon.type || "";
    } else {
      els.planDuration.value = "20";
      els.planIntensity.value = "moderate";
      els.planFormat.value = "";
    }

    if (plan && plan.type === "strength" && plan.strength) {
      els.planDay.value = plan.strength.dayId;
      els.planWeek.value = String(plan.strength.weekNumber || 1);
    } else {
      els.planDay.value = PROGRAM.days[0].id;
      els.planWeek.value = "1";
    }
  }

  function selectDay(dateStr) {
    selectedDate = dateStr;
    els.detailDateLabel.textContent = formatDateLabel(dateStr) + (dateStr === todayKey ? " (Today)" : "");
    renderHistoryForDate(dateStr);
    renderPlanForm(dateStr);
    els.planSavedMsg.classList.add("hidden"); // stale feedback from whatever day was selected before
    renderGrid();
  }

  function savePlanFromForm() {
    if (!selectedDate) return;
    var type = els.planType.value;
    if (!type) {
      MetconStorage.deletePlan(selectedDate);
    } else {
      var plan = { type: type, metcon: null, strength: null };
      if (type === "metcon") {
        plan.metcon = {
          duration: parseInt(els.planDuration.value, 10) || 20,
          intensity: els.planIntensity.value,
          type: els.planFormat.value,
        };
      } else if (type === "strength") {
        plan.strength = {
          dayId: els.planDay.value,
          weekNumber: parseInt(els.planWeek.value, 10) || 1,
        };
      }
      MetconStorage.savePlan(selectedDate, plan);
    }
    els.planSavedMsg.classList.remove("hidden");
    setTimeout(function () {
      els.planSavedMsg.classList.add("hidden");
    }, 1500);
    renderGrid();
  }

  function clearPlan() {
    if (!selectedDate) return;
    MetconStorage.deletePlan(selectedDate);
    renderPlanForm(selectedDate);
    renderGrid();
  }

  function init() {
    populateDaySelect();
    populateWeekSelect();
    renderGrid();
    selectDay(todayKey);

    els.prevBtn.addEventListener("click", function () {
      goToMonth(-1);
    });
    els.nextBtn.addEventListener("click", function () {
      goToMonth(1);
    });
    els.planType.addEventListener("change", togglePlanFields);
    els.planSaveBtn.addEventListener("click", savePlanFromForm);
    els.planClearBtn.addEventListener("click", clearPlan);
  }

  document.addEventListener("DOMContentLoaded", init);
  // Something logged or planned elsewhere (Metcon/Strength/Log tabs) may
  // affect this month's badges, or the selected day's detail — refresh
  // both whenever we're switched back to.
  document.addEventListener("metcon:tab-activated", function (e) {
    if (!e.detail || e.detail.tab !== "calendar") return;
    renderGrid();
    if (selectedDate) {
      renderHistoryForDate(selectedDate);
      renderPlanForm(selectedDate);
    }
  });
})();
