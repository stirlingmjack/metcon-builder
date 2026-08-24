/**
 * progress.js — Progress tab: pulls every logged Strength session,
 * extracts each main lift's heaviest logged weight per session, and
 * renders a small inline-SVG line chart per lift (Bench Press / Deadlift
 * / Hack Squat) — one chart per lift rather than one combined chart,
 * since their weight scales aren't comparable. Self-contained (own
 * DOMContentLoaded, own small helpers) — only depends on the
 * already-loaded MetconStrengthData / MetconStorage globals.
 */
(function () {
  "use strict";

  var PROGRAM = MetconStrengthData.STRENGTH_PROGRAM;
  var MAIN_LIFTS = MetconStrengthData.MAIN_LIFTS;

  var container = document.getElementById("progress-lifts");
  if (!container) return; // progress tab markup not present — nothing to do

  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function findDay(dayId) {
    return PROGRAM.days.filter(function (d) {
      return d.id === dayId;
    })[0];
  }

  function formatDateLabel(dateKey) {
    // dateKey is "YYYY-MM-DD" — show as "Aug 24" for compact axis labels.
    var parts = dateKey.split("-").map(Number);
    if (parts.length !== 3) return dateKey;
    var d = new Date(parts[0], parts[1] - 1, parts[2]);
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  }

  // Every logged Strength session, per lift, as an ascending-by-date
  // series of {date, weekNumber, weight} — weight is the heaviest valid
  // number logged that session for that lift's block (schemes prescribe
  // varying reps per set, but "how heavy did this lift go" is the one
  // comparable number across every week's shape).
  function buildLiftSeries(liftKey) {
    var entries = MetconStorage.getAllStrengthHistorySorted(); // newest first
    var points = [];
    entries.forEach(function (row) {
      var day = findDay(row.entry.dayId);
      if (!day) return;
      var block = day.blocks.filter(function (b) {
        return b.progressesWithWeek && b.liftKey === liftKey;
      })[0];
      if (!block) return;
      var sets = (row.entry.sets && row.entry.sets[block.code]) || [];
      var weights = sets
        .map(function (s) {
          return parseFloat(s.weight);
        })
        .filter(function (w) {
          return !isNaN(w) && w > 0;
        });
      if (weights.length === 0) return;
      points.push({
        date: row.date,
        weekNumber: row.entry.weekNumber || null,
        weight: Math.max.apply(null, weights),
      });
    });
    points.reverse(); // oldest first, for a left-to-right chart
    return points;
  }

  // Renders one lift's trend as an inline SVG line chart: thin 2px line,
  // a faint gradient area fill, a faint 3-line grid, >=8px markers with
  // the latest point emphasized, and direct labels on the first/last
  // point only (never a label on every point). A dashed reference line
  // marks the stored 1RM, if any. Native <title> tooltips give the exact
  // date/week/weight on hover — the chart's hover layer.
  function renderChartSvg(points, oneRepMax) {
    var width = 480;
    var height = 170;
    var padding = { top: 22, right: 16, bottom: 24, left: 38 };
    var innerW = width - padding.left - padding.right;
    var innerH = height - padding.top - padding.bottom;

    var weights = points.map(function (p) {
      return p.weight;
    });
    var minW = Math.min.apply(null, weights);
    var maxW = Math.max.apply(null, weights);
    if (oneRepMax) {
      minW = Math.min(minW, oneRepMax);
      maxW = Math.max(maxW, oneRepMax);
    }
    if (minW === maxW) {
      minW -= 10;
      maxW += 10;
    }
    var rangePad = (maxW - minW) * 0.18;
    var yMin = minW - rangePad;
    var yMax = maxW + rangePad;

    function xAt(i) {
      return points.length === 1 ? padding.left + innerW / 2 : padding.left + (i / (points.length - 1)) * innerW;
    }
    function yAt(w) {
      return padding.top + innerH - ((w - yMin) / (yMax - yMin)) * innerH;
    }

    var coords = points.map(function (p, i) {
      return [xAt(i), yAt(p.weight)];
    });

    var polylinePoints = coords
      .map(function (c) {
        return c[0].toFixed(1) + "," + c[1].toFixed(1);
      })
      .join(" ");

    var baselineY = (padding.top + innerH).toFixed(1);
    var areaPath =
      "M" +
      coords
        .map(function (c) {
          return c[0].toFixed(1) + "," + c[1].toFixed(1);
        })
        .join(" L") +
      " L" +
      coords[coords.length - 1][0].toFixed(1) +
      "," +
      baselineY +
      " L" +
      coords[0][0].toFixed(1) +
      "," +
      baselineY +
      " Z";

    var gridWeights = [yMax - rangePad * 0.3, (yMax + yMin) / 2, yMin + rangePad * 0.3];
    var gridSvg = gridWeights
      .map(function (gw) {
        var y = yAt(gw);
        return (
          '<line class="progress-grid-line" x1="' +
          padding.left +
          '" x2="' +
          (width - padding.right) +
          '" y1="' +
          y.toFixed(1) +
          '" y2="' +
          y.toFixed(1) +
          '" />' +
          '<text class="progress-axis-text" x="' +
          (padding.left - 6) +
          '" y="' +
          (y + 3).toFixed(1) +
          '" text-anchor="end">' +
          Math.round(gw) +
          "</text>"
        );
      })
      .join("");

    var oneRmSvg = "";
    if (oneRepMax) {
      var rmY = yAt(oneRepMax).toFixed(1);
      oneRmSvg =
        '<line class="progress-1rm-line" x1="' +
        padding.left +
        '" x2="' +
        (width - padding.right) +
        '" y1="' +
        rmY +
        '" y2="' +
        rmY +
        '" />' +
        '<text class="progress-1rm-label" x="' +
        (width - padding.right) +
        '" y="' +
        (parseFloat(rmY) - 4).toFixed(1) +
        '" text-anchor="end">1RM</text>';
    }

    var pointsSvg = points
      .map(function (p, i) {
        var isLast = i === points.length - 1;
        var isFirst = i === 0;
        var r = isLast ? 6 : 4;
        var cls = isLast ? "progress-point progress-point-emphasis" : "progress-point";
        var title = (p.weekNumber ? "Week " + p.weekNumber + " — " : "") + p.date + ": " + p.weight + " kg";
        var label = "";
        if (isFirst || isLast) {
          var ty = coords[i][1] - 12;
          label =
            '<text class="progress-point-label" x="' +
            coords[i][0].toFixed(1) +
            '" y="' +
            ty.toFixed(1) +
            '" text-anchor="' +
            (isFirst ? "start" : "end") +
            '">' +
            escapeHtml(p.weight + " kg") +
            "</text>";
        }
        return (
          '<circle class="' +
          cls +
          '" cx="' +
          coords[i][0].toFixed(1) +
          '" cy="' +
          coords[i][1].toFixed(1) +
          '" r="' +
          r +
          '"><title>' +
          escapeHtml(title) +
          "</title></circle>" +
          label
        );
      })
      .join("");

    var xLabels =
      '<text class="progress-axis-text" x="' +
      coords[0][0].toFixed(1) +
      '" y="' +
      (height - 4) +
      '" text-anchor="start">' +
      escapeHtml(formatDateLabel(points[0].date)) +
      "</text>" +
      (points.length > 1
        ? '<text class="progress-axis-text" x="' +
          coords[coords.length - 1][0].toFixed(1) +
          '" y="' +
          (height - 4) +
          '" text-anchor="end">' +
          escapeHtml(formatDateLabel(points[points.length - 1].date)) +
          "</text>"
        : "");

    var gradientId = "progressAreaGradient" + Math.random().toString(36).slice(2, 9);

    return (
      '<svg viewBox="0 0 ' +
      width +
      " " +
      height +
      '" class="progress-chart-svg" role="img" aria-label="Weight progress over time">' +
      "<defs><linearGradient id=\"" +
      gradientId +
      '" x1="0" y1="0" x2="0" y2="1">' +
      '<stop offset="0%" stop-color="var(--accent)" stop-opacity="0.28" />' +
      '<stop offset="100%" stop-color="var(--accent)" stop-opacity="0" />' +
      "</linearGradient></defs>" +
      gridSvg +
      oneRmSvg +
      '<path class="progress-area" d="' +
      areaPath +
      '" fill="url(#' +
      gradientId +
      ')" />' +
      '<polyline class="progress-line" points="' +
      polylinePoints +
      '" fill="none" />' +
      pointsSvg +
      xLabels +
      "</svg>"
    );
  }

  function renderTable(points) {
    var rows = points
      .slice()
      .reverse()
      .map(function (p) {
        return (
          "<tr><td>" +
          escapeHtml(p.date) +
          "</td><td>" +
          (p.weekNumber ? "Week " + p.weekNumber : "—") +
          "</td><td>" +
          p.weight +
          " kg</td></tr>"
        );
      })
      .join("");
    return (
      '<details class="progress-table-details">' +
      "<summary>View as table</summary>" +
      '<table class="progress-table"><thead><tr><th>Date</th><th>Week</th><th>Weight</th></tr></thead><tbody>' +
      rows +
      "</tbody></table>" +
      "</details>"
    );
  }

  function renderLiftCard(lift, maxes) {
    var points = buildLiftSeries(lift.id);
    var oneRepMax = maxes[lift.id] || null;

    var body;
    if (points.length === 0) {
      body = '<p class="empty-note">No ' + escapeHtml(lift.label) + " sessions logged yet — log a set in the Strength tab to start tracking.</p>";
    } else {
      var latest = points[points.length - 1];
      var first = points[0];
      var delta = latest.weight - first.weight;
      var deltaText =
        points.length > 1
          ? (delta > 0 ? "+" : "") + delta + " kg since " + (first.weekNumber ? "Week " + first.weekNumber : formatDateLabel(first.date))
          : "First session logged";
      var deltaClass = delta > 0 ? "progress-delta up" : delta < 0 ? "progress-delta down" : "progress-delta";

      body =
        '<div class="progress-stats">' +
        '<span class="progress-latest">' +
        latest.weight +
        " kg</span>" +
        '<span class="' +
        deltaClass +
        '">' +
        escapeHtml(deltaText) +
        "</span>" +
        "</div>" +
        renderChartSvg(points, oneRepMax) +
        renderTable(points);
    }

    return (
      '<section class="panel progress-lift-card">' +
      "<h2>" +
      escapeHtml(lift.label) +
      "</h2>" +
      body +
      "</section>"
    );
  }

  function render() {
    var maxes = MetconStorage.loadStrengthMaxes();
    container.innerHTML = MAIN_LIFTS.map(function (lift) {
      return renderLiftCard(lift, maxes);
    }).join("");
  }

  document.addEventListener("DOMContentLoaded", render);
  document.addEventListener("metcon:tab-activated", function (e) {
    if (e.detail && e.detail.tab === "progress") render();
  });
})();
