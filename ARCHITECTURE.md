# Architecture Overview

This document serves as a critical, living reference designed to equip agents and engineers with a rapid and comprehensive understanding of the codebase's architecture. Update this document as the codebase evolves.

## 1. Project Structure

```
app-tally/
├── index.html      # Page markup: quadrant tiles, action bar, report modal
├── styles.css      # Mobile-first layout and styling (CSS Grid, custom properties)
├── app.js          # All app logic: counting, persistence, cross-tab sync, CSV export (IIFE, no deps)
├── README.md       # Project overview, usage, CSV format, GitHub Pages deploy steps
└── ARCHITECTURE.md # This document
```

## 2. High-Level System Diagram

```
[User — mobile/desktop browser]
        |  tap quadrant • undo (−) • reset • generate report
        v
[Tally — single-page static app on GitHub Pages]   (no build step, no backend)
        |
        +--> [Browser localStorage "app-tally-v1"]   counts + per-click log, cap 10k/quadrant
        |            (per-device; graceful fallback if unavailable)
        |
        +--> ["storage" event]  cross-tab sync (other tabs re-render on change)
        |
        +--> [CSV file download]  Blob + object URL, with on-screen preview / clipboard copy fallback
```

## 3. Core Components

### 3.1. Frontend

**Name:** Tally Web App

**Description:** Single-page, mobile-first tally counter. A 2×2 grid of four color-coded quadrant tiles (A–D); tapping a tile increments its count, shown under the letter. Each tile has a deliberately small, low-contrast "−" button (top-right corner) that undoes the most recent tap and is disabled at zero. The bottom action bar provides **Reset** (confirmation prompt; zeroes counts and clears history) and **Generate Report** (downloads the CSV and opens a preview modal with Copy CSV / Save CSV / Done).

**Technologies:** Vanilla HTML5, CSS3 (CSS Grid, custom properties, `100dvh`, `env(safe-area-inset-*)`, `clamp()`, system font stack), ES2020+ JavaScript (IIFE, strict mode). No frameworks, no dependencies, no build step.

**Internal structure (app.js):** in-memory `state` (`counts` + `log`) → persistence layer (`load`/`save` with validation, normalization, and cap enforcement) → actions (`increment`, `decrement`, `resetAll`) → CSV layer (`buildCsv`, 24-hour `time_local` / `date_local` columns, Blob download) → render + event wiring (including the `storage`-event cross-tab sync listener).

**Deployment:** GitHub Pages — https://jfletch79.github.io/TallyApp/

### 3.2. Backend Services

None — this is a backend-free, client-only application.

## 4. Data Stores

### 4.1. Browser localStorage (Tally State)

**Name:** Tally state store

**Type:** Browser `localStorage` (per-device, per-browser; no server storage)

**Purpose:** Persists quadrant counts and the full click history across sessions on the user's device, so tallies survive page reloads and browser restarts.

**Key Schemas / Collections:** Single JSON value under key `app-tally-v1`: `counts` (integers per quadrant A–D) and `log` (per-quadrant array of `[timestampMs, runningCount]` pairs, oldest first, capped at the 10,000 most recent entries per quadrant — 40,000 total).

## 5. External Integrations / APIs

None. The app makes no network calls and uses no third-party services; all data stays on the user's device.

## 6. Deployment & Infrastructure

**Cloud Provider:** GitHub (GitHub Pages)

**Key Services Used:** GitHub Pages (static hosting; HTTPS in transit)

**CI/CD Pipeline:** None — deployment is manual: push `index.html`, `styles.css`, `app.js`, `README.md` to `main`, then enable Pages (branch `main`, folder `/ (root)`) in the repo's Settings.

**Monitoring & Logging:** None — client-only app; no server logs or error reporting.

## 7. Security Considerations

**Authentication:** None — single-user app; no accounts or sessions.

**Authorization:** N/A (no multi-user access).

**Data Encryption:** TLS in transit via GitHub Pages HTTPS. Data at rest exists only in the user's own browser `localStorage` on their device; nothing is transmitted or stored server-side.

**Key Security Tools / Practices:** No external dependencies (minimal attack surface); no secrets or personal data in the codebase (verified by scan); storage access wrapped in try/catch so unavailable storage (e.g., private mode) degrades to in-session-only behavior rather than failing.

## 8. Development & Testing Environment

**Local Setup:** Open `index.html` directly in a browser, or `python3 -m http.server 8000` (recommended — cross-tab sync behaves most reliably over HTTP).

**Testing Frameworks:** None committed. Logic is verified with an ad-hoc Node.js harness (stubbed DOM / `localStorage` / Blob) run from outside the repo — 36 checks covering increment, undo, persistence, the 10k cap, cross-tab sync, reset, CSV format, and corrupt-state recovery.

**Code Quality Tools:** None committed — `node --check` for JS syntax validation.

## 9. Future Considerations / Roadmap

- Editable quadrant subtitles — short labels under each A–D letter — are planned but not started (the only known future work; no other planned changes or architectural technical debt).

## 10. Project Identification

**Project Name:** Tally

**Repository URL:** https://github.com/jfletch79/TallyApp

**Primary Contact / Team:** jfletch79 (solo)

**Date of Last Update:** 2026-10-28

## 11. Glossary / Acronyms

| Term | Definition |
|------|-----------|
| Quadrant | One of the four tally tiles, labeled A, B, C, or D. |
| Effective click | A recorded click that has not been undone via the per-quadrant "−" button; only effective clicks appear in the CSV report. |
| Running count | A quadrant's total after a given click, stored per click and exported as the `running_count` CSV column. |
| `app-tally-v1` | The `localStorage` key holding the persisted state (counts + click log). |
| Cross-tab sync | Updating other open tabs of the app when one tab changes state, via the browser `storage` event. |
