# 📊 Excel Scanner App — Project Plan
## (Updated for NSE Option Chain CSV Format)

---

## Overview

A **personal, mobile-friendly, single-page web app** that runs entirely in the browser (no server, no deployment, no backend). You open the `index.html` file locally on your phone or PC, upload one or more NSE Option Chain CSV files, and instantly see:

- **CALLS side** column-wise totals (OI, CHNG IN OI, VOLUME, IV, LTP, CHNG, BID QTY, BID, ASK, ASK QTY)
- **PUTS side** column-wise totals (same columns mirrored)
- **STRIKE-wise** totals row (one row per strike price)
- **Combined grand total** across all uploaded CSV files

---

## About the CSV Format

The NSE Option Chain CSV has a **complex multi-row header** structure:

```
Row 1:  CALLS, NO TEXT, PUTS           ← Section labels (3 groups)
Row 2:  NO TEXT, OI, CHNG IN OI, VOLUME, IV, LTP, CHNG, BID QTY, BID, ASK, ASK QTY,
        STRIKE,
        BID QTY, BID, ASK, ASK QTY, CHNG, LTP, IV, VOLUME, CHNG IN OI, OI, NO TEXT
        ← Actual column headers (23 columns total)
Row 3+: Data rows — one row per STRIKE price
```

### Column Mapping (23 columns total):

| # | Column Name | Side |
|---|---|---|
| 1 | (empty) | — |
| 2 | OI | CALLS |
| 3 | CHNG IN OI | CALLS |
| 4 | VOLUME | CALLS |
| 5 | IV | CALLS |
| 6 | LTP | CALLS |
| 7 | CHNG | CALLS |
| 8 | BID QTY | CALLS |
| 9 | BID | CALLS |
| 10 | ASK | CALLS |
| 11 | ASK QTY | CALLS |
| 12 | **STRIKE** | CENTRE |
| 13 | BID QTY | PUTS |
| 14 | BID | PUTS |
| 15 | ASK | PUTS |
| 16 | ASK QTY | PUTS |
| 17 | CHNG | PUTS |
| 18 | LTP | PUTS |
| 19 | IV | PUTS |
| 20 | VOLUME | PUTS |
| 21 | CHNG IN OI | PUTS |
| 22 | OI | PUTS |
| 23 | (empty) | — |

### Data Quirks to Handle:
- Values like `"2,632.85"` — comma-formatted numbers inside quotes → must strip commas before parsing
- Values like `"-2,982"` — negative comma-formatted numbers
- Values like `-` → means zero / not available → treat as 0
- Empty cells → treat as 0
- Numbers are already numeric in some cells, strings with commas in others

---

## Goals

| Goal | Details |
|---|---|
| ✅ Upload CSV files | Supports `.csv` files via file picker |
| ✅ Parse complex header | Skip rows 1–2, use row 2 as column headers |
| ✅ Strip comma-formatted numbers | "2,632.85" → 2632.85 |
| ✅ Treat "-" and blanks as 0 | Safe numeric parsing |
| ✅ CALLS column totals | Sum each CALLS numeric column |
| ✅ PUTS column totals | Sum each PUTS numeric column |
| ✅ Strike-wise display | Show one row per STRIKE with both sides |
| ✅ Per-file results | Each file gets its own result section |
| ✅ Combined grand total | All files merged and totalled together |
| ✅ Mobile-friendly UI | Responsive, touch-optimized layout |
| ✅ Private & offline | Runs 100% in the browser, no internet needed |

---

## Technology Stack

| Layer | Technology | Reason |
|---|---|---|
| Structure | HTML5 | Simple, universally supported |
| Styling | Vanilla CSS | Full control, no dependencies |
| Logic | Vanilla JavaScript | No build step needed |
| CSV Parsing | Papa Parse (CDN) | Robust CSV parser, handles quoted commas |
| Fonts | Google Fonts (Inter) | Clean, modern typography |

> **No Node.js, no npm, no server required.** Just open `index.html` in any browser.
> Papa Parse CDN is loaded automatically — works offline after first load or can be bundled.

---

## File Structure

```
d:\excelTotal\
│
├── plan.md              ← This file
├── index.html           ← Main app entry point (single file, self-contained)
├── style.css            ← All styling (responsive, dark theme)
└── app.js               ← All JavaScript logic
```

---

## Feature Breakdown

### 1. File Upload
- Drag-and-drop zone + "Browse Files" button
- Accepts multiple `.csv` files at once
- Each file is shown as a labelled card with file name and row count

### 2. CSV Parsing Logic
- Use **Papa Parse** to parse CSV (handles quoted comma-values correctly)
- Skip row 1 (`CALLS, NO TEXT, PUTS`)
- Use row 2 as column headers (prefixed with CALLS_ or PUTS_ for clarity)
- Parse rows 3+ as data
- For each cell: strip quotes, strip commas, convert `-` / empty → 0, parse float

### 3. Per-File Display (for each uploaded CSV)
- **File Summary Card**: filename, total rows (strike prices), date/expiry from filename
- **CALLS Totals Table**: sum of OI, CHNG IN OI, VOLUME, IV, LTP, CHNG, BID QTY, BID, ASK, ASK QTY
- **PUTS Totals Table**: same columns for PUTS side
- **Strike-wise Table**: one row per STRIKE with CALLS totals | STRIKE | PUTS totals

### 4. Grand Total (across all files)
- Merge all per-file CALLS and PUTS totals by column name
- Show a unified grand total table (CALLS side + PUTS side)
- Highlight the grand total row distinctly

### 5. Mobile UX
- Large tap targets
- Sticky header
- Collapsible file sections (tap to expand/collapse)
- Horizontal scroll on tables
- Bottom summary bar showing: Files loaded | Total Strikes | CALLS OI Total | PUTS OI Total

---

## Implementation Phases

### Phase 1 — Foundation
- [x] plan.md created
- [ ] Create `index.html` with semantic structure + Papa Parse CDN
- [ ] Create `style.css` with dark theme, responsive layout

### Phase 2 — CSV Parsing (app.js)
- [ ] File upload handler (drag-and-drop + input)
- [ ] Papa Parse integration
- [ ] Header detection (skip row 1, use row 2)
- [ ] Safe numeric parser: strip commas, treat `-` as 0
- [ ] CALLS column identifier (cols 2–11)
- [ ] PUTS column identifier (cols 13–22)
- [ ] STRIKE column identifier (col 12)

### Phase 3 — Calculation Engine (app.js)
- [ ] Column-wise sum for CALLS (per file)
- [ ] Column-wise sum for PUTS (per file)
- [ ] Strike-wise row builder
- [ ] Grand total aggregator (sums across all files per column)

### Phase 4 — UI Rendering (app.js)
- [ ] Per-file result card renderer
- [ ] CALLS totals table renderer
- [ ] PUTS totals table renderer
- [ ] Strike-wise table renderer
- [ ] Grand total section renderer
- [ ] Bottom stats bar

### Phase 5 — Polish
- [ ] Collapsible file sections
- [ ] "Clear All" button
- [ ] Color coding: CALLS (green tones), PUTS (red tones), STRIKE (neutral)
- [ ] Animations (fade-in cards)
- [ ] Mobile responsiveness final pass

---

## How to Use (End User Guide)

1. **Open** `d:\excelTotal\index.html` in Chrome/Edge/Safari on your phone or PC
2. **Tap** "Upload CSV Files" or drag files onto the drop zone
3. **Select** one or more `option-chain-*.csv` files
4. **View** per-file sections:
   - CALLS column totals
   - PUTS column totals
   - Strike-wise breakdown
5. **Scroll down** to see the Combined Grand Total
6. **Tap** any file header to collapse/expand
7. **Tap** "Clear All" to reset

> 📱 **Mobile Tip:** Transfer `index.html` to your phone via USB, WhatsApp, or email. Open it in Chrome or Safari.

---

## Edge Cases Handled

| Edge Case | Handling |
|---|---|
| `"2,632.85"` quoted comma-numbers | Strip commas → parse as float |
| `"-2,982"` negative comma-numbers | Strip commas → parse as negative float |
| `-` (dash) values | Treated as 0 |
| Empty cells | Treated as 0 |
| Multiple files with same columns | Grand total sums all correctly |
| File not a valid CSV | Error card shown |
| Empty file | Warning card shown |

---

## Out of Scope

- Backend / server
- Database storage
- User accounts / login
- Google Play Store / App Store publishing
- Public hosting / deployment
- Editing data or saving back to CSV

---

## Android APK Delivery Options (Offline, No Play Store)

| Method | When to use | Steps |
|---|---|---|
| **1. Instant Zip Packager** | Fastest (2 mins, zero tools needed) | Upload `OptionChainScanner-App.zip` to WebIntoApp.com → click Make App → download `.apk` |
| **2. Native Android Project** | If you have Android Studio | Open `d:\excelTotal\android` in Android Studio → Build → Build APK |
| **3. GitHub Actions** | Automated CI/CD | Push to GitHub → download `.apk` from Actions artifacts |

---

*Plan updated: 2026-10-26 | Standalone Offline Android APK configured*
