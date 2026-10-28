/*
 * Tally — four-quadrant counter.
 *
 * Counts and the per-click history are stored in localStorage on the
 * device under the key "app-tally-v1". No data ever leaves the device.
 */
(function () {
  "use strict";

  const STORAGE_KEY = "app-tally-v1";
  const QUADRANTS = ["A", "B", "C", "D"];
  const MAX_LOG_PER_QUADRANT = 10000; // most recent clicks kept per quadrant
  const MAX_NAME_LENGTH = 20; // max characters per quadrant name

  const state = {
    counts: { A: 0, B: 0, C: 0, D: 0 },
    names: { A: "", B: "", C: "", D: "" },
    // log[q] is a list of [timestampMs, runningCount] entries, oldest first.
    log: { A: [], B: [], C: [], D: [] },
  };

  /* ---------- Persistence ---------- */

  function freshState() {
    return {
      counts: { A: 0, B: 0, C: 0, D: 0 },
      names: { A: "", B: "", C: "", D: "" },
      log: { A: [], B: [], C: [], D: [] },
    };
  }

  function load() {
    let raw = null;
    try {
      raw = window.localStorage.getItem(STORAGE_KEY);
    } catch (_err) {
      return; // storage unavailable: keep in-memory state
    }
    if (raw === null) return;

    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (_err) {
      return; // corrupted state: start fresh
    }

    const next = freshState();
    let normalized = false;
    for (const q of QUADRANTS) {
      const count = Number((parsed && parsed.counts && parsed.counts[q]) || 0);
      next.counts[q] = Number.isFinite(count) && count >= 0 ? Math.floor(count) : 0;

      // Names are optional and may be absent in older saved state.
      const rawName = parsed && parsed.names && parsed.names[q];
      const name = typeof rawName === "string" ? rawName.trim().slice(0, MAX_NAME_LENGTH) : "";
      if (typeof rawName === "string" && name !== rawName) normalized = true;
      next.names[q] = name;

      const entries = parsed && parsed.log && parsed.log[q];
      if (Array.isArray(entries)) {
        for (const entry of entries) {
          if (
            Array.isArray(entry) &&
            entry.length === 2 &&
            Number.isFinite(entry[0]) &&
            Number.isFinite(entry[1])
          ) {
            next.log[q].push([entry[0], entry[1]]);
          } else {
            normalized = true; // dropped a malformed entry
          }
        }
        if (next.log[q].length > MAX_LOG_PER_QUADRANT) {
          next.log[q] = next.log[q].slice(next.log[q].length - MAX_LOG_PER_QUADRANT);
          normalized = true; // dropped entries past the cap
        }
      }
    }
    state.counts = next.counts;
    state.names = next.names;
    state.log = next.log;
    if (normalized) save(); // persist the trimmed/validated state
  }

  function save() {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (_err) {
      // Storage unavailable (private mode) or full: keep working in-memory.
    }
  }

  /* ---------- Actions ---------- */

  function increment(q) {
    state.counts[q] += 1;
    state.log[q].push([Date.now(), state.counts[q]]);
    if (state.log[q].length > MAX_LOG_PER_QUADRANT) {
      state.log[q] = state.log[q].slice(state.log[q].length - MAX_LOG_PER_QUADRANT);
    }
    save();
    render();
  }

  function decrement(q) {
    if (state.counts[q] <= 0) return;
    state.counts[q] -= 1;
    if (state.log[q].length > 0) {
      state.log[q].pop(); // undo the most recent click for this quadrant
    }
    save();
    render();
  }

  function resetAll() {
    const confirmed = window.confirm(
      "Reset all four counters to zero?\nThis also clears the click history saved on this device. Quadrant names are kept."
    );
    if (!confirmed) return;
    const fresh = freshState();
    state.counts = fresh.counts;
    state.log = fresh.log;
    // state.names intentionally preserved: reset clears tallies, not labels.
    save();
    render();
  }

  /* ---------- CSV report ---------- */

  const pad2 = (n) => String(n).padStart(2, "0");

  // Device-local date as M/D/YYYY (e.g., 10/27/2026).
  function toLocalDate(ts) {
    const d = new Date(ts);
    return d.getMonth() + 1 + "/" + pad2(d.getDate()) + "/" + d.getFullYear();
  }

  // Device-local time in 24-hour format as HH:MM:SS (e.g., 20:30:11).
  function toLocalTime(ts) {
    const d = new Date(ts);
    return pad2(d.getHours()) + ":" + pad2(d.getMinutes()) + ":" + pad2(d.getSeconds());
  }

  function csvCell(value) {
    const s = String(value);
    return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }

  function buildCsv() {
    const clicks = [];
    for (const q of QUADRANTS) {
      for (const [ts, count] of state.log[q]) {
        clicks.push({ q, ts, count });
      }
    }
    clicks.sort(
      (a, b) => a.ts - b.ts || QUADRANTS.indexOf(a.q) - QUADRANTS.indexOf(b.q)
    );

    const lines = ["quadrant,quadrant_name,date_local,time_local,running_count"];
    for (const c of clicks) {
      lines.push([c.q, state.names[c.q], toLocalDate(c.ts), toLocalTime(c.ts), c.count].map(csvCell).join(","));
    }
    lines.push("");
    lines.push("quadrant,quadrant_name,final_count");
    for (const q of QUADRANTS) {
      lines.push([q, state.names[q], state.counts[q]].map(csvCell).join(","));
    }
    return lines.join("\r\n") + "\r\n";
  }

  function reportFilename() {
    const d = new Date();
    const pad = (n) => String(n).padStart(2, "0");
    const stamp =
      d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()) +
      "-" + pad(d.getHours()) + pad(d.getMinutes());
    return "tally-report-" + stamp + ".csv";
  }

  let reportModal = null;
  let reportNote = null;
  let reportText = null;
  let reportCopyBtn = null;
  let reportDoneBtn = null;
  let lastFocused = null;

  function tryDownloadCsv(csv) {
    try {
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = reportFilename();
      document.body.appendChild(a);
      a.click();
      a.remove();
      // Revoke late: some browsers (especially in-app ones) start the
      // download asynchronously, and revoking too early cancels it.
      window.setTimeout(() => URL.revokeObjectURL(url), 60000);
      return true;
    } catch (_err) {
      return false; // some in-app browsers lack blob object URL support
    }
  }

  function openReportModal(csv, downloaded) {
    reportText.value = csv;
    reportNote.textContent = downloaded
      ? "The CSV file was downloaded. If you don't see it, use Copy CSV or Save CSV below."
      : "Your browser didn't start a download — tap Copy CSV or Save CSV below.";
    reportModal.hidden = false;
    lastFocused = document.activeElement;
    reportDoneBtn.focus();
  }

  function closeReportModal() {
    reportModal.hidden = true;
    if (lastFocused && typeof lastFocused.focus === "function") lastFocused.focus();
    lastFocused = null;
  }

  function legacyCopy(text) {
    reportText.select();
    try { reportText.setSelectionRange(0, text.length); } catch (_err) { /* older browsers */ }
    let ok = false;
    try { ok = document.execCommand("copy"); } catch (_err) { ok = false; }
    return ok;
  }

  function setCopyFeedback(ok) {
    reportCopyBtn.textContent = ok ? "Copied!" : "Copy failed";
    window.setTimeout(() => { reportCopyBtn.textContent = "Copy CSV"; }, 2000);
  }

  function copyReportText() {
    const text = reportText.value;
    if (navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
      navigator.clipboard
        .writeText(text)
        .then(() => setCopyFeedback(true))
        .catch(() => setCopyFeedback(legacyCopy(text)));
    } else {
      setCopyFeedback(legacyCopy(text));
    }
  }

  function generateReport() {
    const csv = buildCsv();
    const downloaded = tryDownloadCsv(csv);
    openReportModal(csv, downloaded);
  }

  let settingsModal = null;
  let settingsSaveBtn = null;
  const nameInputs = {};

  function openSettings() {
    for (const q of QUADRANTS) {
      nameInputs[q].value = state.names[q];
    }
    settingsModal.hidden = false;
    lastFocused = document.activeElement;
    settingsSaveBtn.focus();
  }

  function closeSettings() {
    settingsModal.hidden = true;
    if (lastFocused && typeof lastFocused.focus === "function") lastFocused.focus();
    lastFocused = null;
  }

  function saveNames() {
    let changed = false;
    for (const q of QUADRANTS) {
      const value = nameInputs[q].value.trim().slice(0, MAX_NAME_LENGTH);
      if (value !== state.names[q]) {
        state.names[q] = value;
        changed = true;
      }
    }
    if (changed) save();
    render();
    closeSettings();
  }

  /* ---------- Rendering and wiring ---------- */

  const countEls = {};
  const nameEls = {};
  const decrementEls = {};
  let totalEl = null;

  function render() {
    let total = 0;
    for (const q of QUADRANTS) {
      const countEl = countEls[q];
      if (countEl) countEl.textContent = String(state.counts[q]);
      const nameEl = nameEls[q];
      if (nameEl) nameEl.textContent = state.names[q];
      const decEl = decrementEls[q];
      if (decEl) decEl.disabled = state.counts[q] <= 0;
      total += state.counts[q];
    }
    if (totalEl) totalEl.textContent = "Total: " + total;
  }

  function init() {
    load();

    for (const q of QUADRANTS) {
      const tile = document.querySelector('.tile[data-quadrant="' + q + '"]');
      if (!tile) continue;
      countEls[q] = tile.querySelector(".count");
      nameEls[q] = tile.querySelector(".quadrant-name");
      decrementEls[q] = tile.querySelector(".tile-decrement");
      tile.querySelector(".tile-hit").addEventListener("click", () => increment(q));
      decrementEls[q].addEventListener("click", (event) => {
        event.stopPropagation();
        decrement(q);
      });
    }

    totalEl = document.getElementById("total-display");
    settingsModal = document.getElementById("settings-modal");
    settingsSaveBtn = document.getElementById("settings-save-btn");
    for (const q of QUADRANTS) {
      nameInputs[q] = document.getElementById("name-input-" + q.toLowerCase());
    }
    reportModal = document.getElementById("report-modal");
    reportNote = document.getElementById("report-modal-note");
    reportText = document.getElementById("report-text");
    reportCopyBtn = document.getElementById("report-copy-btn");
    reportDoneBtn = document.getElementById("report-done-btn");

    document.getElementById("reset-btn").addEventListener("click", resetAll);
    document.getElementById("report-btn").addEventListener("click", generateReport);
    document.getElementById("report-save-btn").addEventListener("click", () => {
      tryDownloadCsv(reportText.value);
    });
    document.getElementById("settings-btn").addEventListener("click", openSettings);
    document.getElementById("settings-save-btn").addEventListener("click", saveNames);
    document.getElementById("settings-cancel-btn").addEventListener("click", closeSettings);
    if (settingsModal) {
      settingsModal.addEventListener("click", (event) => {
        if (event.target === settingsModal) closeSettings();
      });
    }
    if (reportModal) {
      reportCopyBtn.addEventListener("click", copyReportText);
      reportDoneBtn.addEventListener("click", closeReportModal);
      // Tap on the backdrop (but not the card) closes the modal.
      reportModal.addEventListener("click", (event) => {
        if (event.target === reportModal) closeReportModal();
      });
    }
    document.addEventListener("keydown", (event) => {
      if (event.key !== "Escape") return;
      if (reportModal && !reportModal.hidden) closeReportModal();
      if (settingsModal && !settingsModal.hidden) closeSettings();
    });

    // Cross-tab sync: the "storage" event fires only in *other* tabs, so the
    // tab that made the change has already rendered its own state.
    window.addEventListener("storage", (event) => {
      if (event.key === STORAGE_KEY) {
        load();
        render();
      }
    });

    render();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
