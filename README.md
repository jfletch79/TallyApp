# Tally

A single-page, mobile-first web app that keeps four persistent tallies (quadrants **A**, **B**, **C**, **D**) on your device, and can export the full click history as CSV for graphing.

No build step, no dependencies, no backend — everything runs in the browser and all data stays on the device.

## Features

- Four large, color-coded quadrant tiles: **A** (dusty rose), **B** (sage), **C** (goldenrod), **D** (blue)
- Tap a quadrant to increment its tally; the running count is displayed under the letter, and the running total across all quadrants is shown top-right in the header
- Each quadrant can be given a custom label (up to 20 characters) via the **gear icon** in the action bar; the label is shown on the tile and in CSV exports
- Each quadrant has a discreet **−** button (top-right corner of the tile) that undoes the most recent tap — deliberately small and low-contrast so it can't be hit by accident
- Counts persist across sessions via `localStorage` on the device
- Cross-tab sync: multiple open tabs on the same device stay in sync automatically
- **Reset** zeroes all counters — with a confirmation prompt — and clears the saved click history, but keeps custom quadrant names
- **Generate Report** (bottom right) downloads a CSV of every recorded click, and also shows a preview of the CSV with **Copy CSV** and **Save CSV** buttons — so you always get the data, even in browsers that block file downloads

## Storage and limits

- All data is stored locally in the browser under the key `app-tally-v1`. Nothing is ever uploaded anywhere.
- The click history is capped at the **10,000 most recent clicks per quadrant** (40,000 total across all quadrants). When the cap is reached, the oldest entries are dropped first. That's roughly 100 days of history at 100 taps per day per quadrant.
- Clearing the site's data in your browser (or closing a private/incognito window in browsers that don't persist storage) clears the tallies.
- If `localStorage` is unavailable, the app still works for the current session but counts won't persist.

## CSV report format

The report file is named `tally-report-YYYY-MM-DD-HHMM.csv` and contains two sections.

Section 1 — one row per recorded click, in chronological order:

```csv
quadrant,quadrant_name,date_local,time_local,running_count
A,Meetings,10/27/2026,15:42:11,1
A,Meetings,10/27/2026,15:45:02,2
B,,10/27/2026,16:01:10,1
```

- `quadrant_name` is the custom label (up to 20 characters) set for that quadrant via the gear icon, or empty if the quadrant has no label.
- `date_local` is the **device's local date** (not UTC), formatted as `M/D/YYYY`.
- `time_local` is the **device's local time** (not UTC), in 24-hour format `HH:MM:SS` (e.g., `20:30:11` = 8:30:11 pm) — handy for plotting histograms and line charts directly.
- `running_count` is the quadrant's total after that click, so you can plot the running total over time directly.
- Undoing a tap (−) removes that click from the history, so the report reflects only effective clicks.

Section 2 — final counts per quadrant, after a blank line:

```csv
quadrant,quadrant_name,final_count
A,Meetings,2
B,,1
C,,0
D,,0
```

## Running locally

Option 1 — just open `index.html` in a browser.

Option 2 (recommended, so cross-tab sync works reliably) — serve the folder over HTTP:

```sh
cd app-tally
python3 -m http.server 8000
# then open http://localhost:8000
```

## Deploying to GitHub Pages

1. Create a new GitHub repository (for example, `tally-app`) and push these files:
   `index.html`, `styles.css`, `app.js`, `README.md`.
2. In the repository, go to **Settings → Pages**.
3. Under **Source**, choose **Deploy from a branch**, select the `main` branch and the `/ (root)` folder, then **Save**.
4. After a minute or two the app is live at `https://<your-username>.github.io/tally-app/`.
   (If you instead push to a repo named `<your-username>.github.io`, it serves at `https://<your-username>.github.io/`.)

## Project structure

| File | Purpose |
| --- | --- |
| `index.html` | Page markup (quadrant tiles, action buttons) |
| `styles.css` | Layout and styling (mobile-first) |
| `app.js` | All logic: counting, persistence, cross-tab sync, CSV export — no external dependencies |
