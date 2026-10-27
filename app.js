// ============================================================
// NSE Option Chain Scanner — app.js
// Layout: date-wise summary table (one row per file)
//         + grand total row at the bottom
//         + per-file detail expandable section
// ============================================================

// ── Column definitions (0-indexed after skipping 2-header rows) ──
// [0]=empty [1]=CALLS_OI [2]=CALLS_CHNG_OI [3]=CALLS_VOLUME [4]=CALLS_IV
// [5]=CALLS_LTP [6]=CALLS_CHNG [7]=CALLS_BID_QTY [8]=CALLS_BID
// [9]=CALLS_ASK [10]=CALLS_ASK_QTY [11]=STRIKE
// [12]=PUTS_BID_QTY [13]=PUTS_BID [14]=PUTS_ASK [15]=PUTS_ASK_QTY
// [16]=PUTS_CHNG [17]=PUTS_LTP [18]=PUTS_IV [19]=PUTS_VOLUME
// [20]=PUTS_CHNG_OI [21]=PUTS_OI [22]=empty

const CALLS_COLS = [
  { idx: 1, key: 'OI' },
  { idx: 2, key: 'CHNG IN OI' },
  { idx: 3, key: 'VOLUME' },
  { idx: 4, key: 'IV' },
  { idx: 5, key: 'LTP' },
  { idx: 6, key: 'CHNG' },
  { idx: 7, key: 'BID QTY' },
  { idx: 8, key: 'BID' },
  { idx: 9, key: 'ASK' },
  { idx: 10, key: 'ASK QTY' },
];
const STRIKE_IDX = 11;
const PUTS_COLS = [
  { idx: 12, key: 'BID QTY' },
  { idx: 13, key: 'BID' },
  { idx: 14, key: 'ASK' },
  { idx: 15, key: 'ASK QTY' },
  { idx: 16, key: 'CHNG' },
  { idx: 17, key: 'LTP' },
  { idx: 18, key: 'IV' },
  { idx: 19, key: 'VOLUME' },
  { idx: 20, key: 'CHNG IN OI' },
  { idx: 21, key: 'OI' },
];

// ── State ──
let allFileResults = [];

// ── DOM refs ──
const uploadZone = document.getElementById('uploadZone');
const fileInput = document.getElementById('fileInput');
const browseBtn = document.getElementById('browseBtn');
const fileChips = document.getElementById('fileChips');
const statsBar = document.getElementById('statsBar');
const summarySection = document.getElementById('summarySection');
const bottomBar = document.getElementById('bottomBar');
const clearBtn = document.getElementById('clearBtn');
const clearBtnBar = document.getElementById('clearBtnBar');

// ─────────────────────────────────────────────
// Extract date from filename
// e.g. "option-chain-ED-NIFTY-27-Oct-2026_5463.csv" → "27 Oct 2026"
// ─────────────────────────────────────────────
function extractDate(filename) {
  // Pattern: digits-MonthName-digits  e.g. 27-Oct-2026
  const m = filename.match(/(\d{1,2})[-_\s]([A-Za-z]{3,9})[-_\s](\d{4})/);
  if (m) return `${m[1]} ${capitalize(m[2])} ${m[3]}`;

  // Pattern: digits-digits-digits (dd-mm-yyyy or yyyy-mm-dd)
  const m2 = filename.match(/(\d{2})[-_](\d{2})[-_](\d{4})/);
  if (m2) {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const mon = months[parseInt(m2[2], 10) - 1] || m2[2];
    return `${m2[1]} ${mon} ${m2[3]}`;
  }

  // Pattern: yyyy-mm-dd
  const m3 = filename.match(/(\d{4})[-_](\d{2})[-_](\d{2})/);
  if (m3) {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const mon = months[parseInt(m3[2], 10) - 1] || m3[2];
    return `${m3[3]} ${mon} ${m3[1]}`;
  }

  return '—';
}

function capitalize(s) {
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}

// ─────────────────────────────────────────────
// Safe numeric parser
// ─────────────────────────────────────────────
function parseNum(raw) {
  if (raw === null || raw === undefined) return 0;
  const s = String(raw).trim();
  if (s === '' || s === '-' || s === '--') return 0;
  const cleaned = s.replace(/,/g, '');
  const n = parseFloat(cleaned);
  return isNaN(n) ? 0 : n;
}

// ─────────────────────────────────────────────
// Number formatters
// ─────────────────────────────────────────────
function fmtCompact(n) {
  if (n === 0) return '-';
  return n.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

function fmtFull(n) {
  if (n === 0) return '0';
  return n.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

function fmtSign(n) {
  if (n === 0) return '-';
  const s = fmtFull(Math.abs(n));
  return n < 0 ? `-${s}` : s;
}

function cellColor(n) {
  if (n > 0) return ' style="color:#16a34a;font-weight:600;"';
  if (n < 0) return ' style="color:#dc2626;font-weight:600;"';
  return '';
}

// ─────────────────────────────────────────────
// Parse CSV with PapaParse
// ─────────────────────────────────────────────
function parseCSV(file) {
  return new Promise((resolve, reject) => {
    Papa.parse(file, {
      skipEmptyLines: true,
      complete(results) {
        const rows = results.data;
        if (rows.length < 3) {
          reject(new Error('File has no data rows.'));
          return;
        }
        resolve(rows.slice(2)); // skip 2-row header
      },
      error(err) { reject(err); }
    });
  });
}

// ─────────────────────────────────────────────
// Calculate column totals from data rows
// ─────────────────────────────────────────────
function calcTotals(dataRows) {
  const calls = Object.fromEntries(CALLS_COLS.map(c => [c.key, 0]));
  const puts = Object.fromEntries(PUTS_COLS.map(c => [c.key, 0]));
  const strikes = [];
  let strikeCount = 0;

  for (const row of dataRows) {
    if (!row || row.length < 12) continue;
    const strike = parseNum(row[STRIKE_IDX]);
    if (strike === 0) continue;
    strikeCount++;

    const cRow = {}, pRow = {};
    for (const col of CALLS_COLS) {
      const v = parseNum(row[col.idx]);
      calls[col.key] += v;
      cRow[col.key] = v;
    }
    for (const col of PUTS_COLS) {
      const v = parseNum(row[col.idx]);
      puts[col.key] += v;
      pRow[col.key] = v;
    }
    strikes.push({ strike, cRow, pRow });
  }

  return { calls, puts, strikes, strikeCount };
}

// ─────────────────────────────────────────────
// Process one file
// ─────────────────────────────────────────────
async function processFile(file) {
  const dataRows = await parseCSV(file);
  const { calls, puts, strikes, strikeCount } = calcTotals(dataRows);
  return {
    name: file.name,
    date: extractDate(file.name),
    strikeCount,
    calls,
    puts,
    strikes,
  };
}

// ─────────────────────────────────────────────
// Escape HTML
// ─────────────────────────────────────────────
function escHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ─────────────────────────────────────────────
// Build the main DATE-WISE SUMMARY TABLE
// Layout: DATE | CALLS (10 cols) | STRIKE (centered) | PUTS (10 cols)
// Matches NSE Option Chain colors and layout exactly
// PCR column removed per user specification
// ─────────────────────────────────────────────
function renderSummaryTable() {
  if (allFileResults.length === 0) {
    summarySection.innerHTML = '';
    return;
  }

  // CALLS columns (left side, cols 1-10)
  const callsHeaderCols = [
    { side: 'calls', key: 'OI' },
    { side: 'calls', key: 'CHNG IN OI' },
    { side: 'calls', key: 'VOLUME' },
    { side: 'calls', key: 'IV' },
    { side: 'calls', key: 'LTP' },
    { side: 'calls', key: 'CHNG' },
    { side: 'calls', key: 'BID QTY' },
    { side: 'calls', key: 'BID' },
    { side: 'calls', key: 'ASK' },
    { side: 'calls', key: 'ASK QTY' },
  ];

  // PUTS columns (right side, cols 12-21)
  const putsHeaderCols = [
    { side: 'puts', key: 'BID QTY' },
    { side: 'puts', key: 'BID' },
    { side: 'puts', key: 'ASK' },
    { side: 'puts', key: 'ASK QTY' },
    { side: 'puts', key: 'CHNG' },
    { side: 'puts', key: 'LTP' },
    { side: 'puts', key: 'IV' },
    { side: 'puts', key: 'VOLUME' },
    { side: 'puts', key: 'CHNG IN OI' },
    { side: 'puts', key: 'OI' },
  ];

  // Grand totals
  const grand = {};
  for (const col of callsHeaderCols) grand['calls_' + col.key] = 0;
  for (const col of putsHeaderCols) grand['puts_' + col.key] = 0;
  for (const r of allFileResults) {
    for (const col of callsHeaderCols) {
      grand['calls_' + col.key] += r.calls[col.key];
    }
    for (const col of putsHeaderCols) {
      grand['puts_' + col.key] += r.puts[col.key];
    }
  }

  // Headers: Strike centered between Calls and Puts, PCR removed
  const headerRow1 = `
    <tr>
      <th rowspan="2" class="th-date">DATE</th>
      <th colspan="${callsHeaderCols.length}" class="th-calls-group">CALLS</th>
      <th rowspan="2" class="th-strike">STRIKE</th>
      <th colspan="${putsHeaderCols.length}" class="th-puts-group">PUTS</th>
    </tr>
    <tr>
      ${callsHeaderCols.map(c => `<th class="th-calls">${c.key}</th>`).join('')}
      ${putsHeaderCols.map(c => `<th class="th-puts">${c.key}</th>`).join('')}
    </tr>`;

  // Data rows — one per file
  const dataRows = allFileResults.map((r, i) => {
    const callsCells = callsHeaderCols.map(col => {
      const v = r.calls[col.key];
      const isChng = col.key === 'CHNG IN OI' || col.key === 'CHNG';
      const isLtp = col.key === 'LTP';
      let cls = 'td-calls';
      if (isLtp) cls += ' td-ltp';
      if (isChng) {
        return `<td class="${cls}"${cellColor(v)}>${fmtSign(v)}</td>`;
      }
      return `<td class="${cls}">${fmtCompact(v)}</td>`;
    }).join('');

    const putsCells = putsHeaderCols.map(col => {
      const v = r.puts[col.key];
      const isChng = col.key === 'CHNG IN OI' || col.key === 'CHNG';
      const isLtp = col.key === 'LTP';
      let cls = 'td-puts';
      if (isLtp) cls += ' td-ltp';
      if (isChng) {
        return `<td class="${cls}"${cellColor(v)}>${fmtSign(v)}</td>`;
      }
      return `<td class="${cls}">${fmtCompact(v)}</td>`;
    }).join('');

    return `
      <tr class="data-row" data-index="${i}">
        <td class="td-date">
          <div class="date-label">${escHtml(r.date)}</div>
          <div class="date-file">${escHtml(r.name)}</div>
        </td>
        ${callsCells}
        <td class="td-strike">${r.strikeCount}</td>
        ${putsCells}
      </tr>`;
  }).join('');

  // Grand TOTAL row
  const callsTotalCells = callsHeaderCols.map(col => {
    const v = grand['calls_' + col.key];
    const isChng = col.key === 'CHNG IN OI' || col.key === 'CHNG';
    const isLtp = col.key === 'LTP';
    let cls = 'td-calls total-cell';
    if (isLtp) cls += ' td-ltp';
    if (isChng) return `<td class="${cls}"${cellColor(v)}>${fmtSign(v)}</td>`;
    return `<td class="${cls}">${fmtCompact(v)}</td>`;
  }).join('');

  const putsTotalCells = putsHeaderCols.map(col => {
    const v = grand['puts_' + col.key];
    const isChng = col.key === 'CHNG IN OI' || col.key === 'CHNG';
    const isLtp = col.key === 'LTP';
    let cls = 'td-puts total-cell';
    if (isLtp) cls += ' td-ltp';
    if (isChng) return `<td class="${cls}"${cellColor(v)}>${fmtSign(v)}</td>`;
    return `<td class="${cls}">${fmtCompact(v)}</td>`;
  }).join('');

  const totalStrikes = allFileResults.reduce((a, r) => a + r.strikeCount, 0);

  summarySection.innerHTML = `
    <div class="summary-card">
      <div class="summary-card-header">
        <span class="summary-icon">📊</span>
        <div class="summary-card-titles">
          <h2 class="summary-title">Date-wise Summary Table</h2>
          <p class="summary-sub">${allFileResults.length} date${allFileResults.length > 1 ? 's' : ''} loaded · Strike centered between Calls &amp; Puts</p>
        </div>
      </div>
      <div class="mobile-scroll-hint">
        <span>↔️ Swipe horizontally to view all columns</span>
      </div>
      <div class="table-wrap">
        <table class="summary-table">
          <thead>${headerRow1}</thead>
          <tbody>
            ${dataRows}
            <tr class="total-row">
              <td class="td-date total-label">TOTAL</td>
              ${callsTotalCells}
              <td class="td-strike total-cell">${totalStrikes}</td>
              ${putsTotalCells}
            </tr>
          </tbody>
        </table>
      </div>
    </div>`;
}

// ─────────────────────────────────────────────
// Stats bar + bottom bar
// ─────────────────────────────────────────────
function updateStats() {
  if (allFileResults.length === 0) {
    statsBar.innerHTML = '';
    statsBar.style.display = 'none';
    bottomBar.classList.remove('visible');
    return;
  }

  const totalStrikes = allFileResults.reduce((a, r) => a + r.strikeCount, 0);
  const totalCallsOI = allFileResults.reduce((a, r) => a + r.calls['OI'], 0);
  const totalPutsOI = allFileResults.reduce((a, r) => a + r.puts['OI'], 0);
  const totalCallsVol = allFileResults.reduce((a, r) => a + r.calls['VOLUME'], 0);
  const totalPutsVol = allFileResults.reduce((a, r) => a + r.puts['VOLUME'], 0);
  const pcr = totalCallsOI > 0 ? (totalPutsOI / totalCallsOI).toFixed(3) : '—';

  statsBar.style.display = 'flex';
  statsBar.innerHTML = `
    <div class="stat-pill files">
      <span>📁</span>
      <div><div class="stat-label">Files</div><div class="stat-value">${allFileResults.length}</div></div>
    </div>
    <div class="stat-pill strikes">
      <span>🎯</span>
      <div><div class="stat-label">Total Strikes</div><div class="stat-value">${totalStrikes}</div></div>
    </div>
    <div class="stat-pill calls">
      <span>📈</span>
      <div><div class="stat-label">CALLS OI</div><div class="stat-value">${fmtCompact(totalCallsOI)}</div></div>
    </div>
    <div class="stat-pill puts">
      <span>📉</span>
      <div><div class="stat-label">PUTS OI</div><div class="stat-value">${fmtCompact(totalPutsOI)}</div></div>
    </div>
    <div class="stat-pill calls">
      <span>🔁</span>
      <div><div class="stat-label">CALLS VOL</div><div class="stat-value">${fmtCompact(totalCallsVol)}</div></div>
    </div>
    <div class="stat-pill puts">
      <span>🔁</span>
      <div><div class="stat-label">PUTS VOL</div><div class="stat-value">${fmtCompact(totalPutsVol)}</div></div>
    </div>
    <div class="stat-pill" style="border-color:rgba(251,191,36,0.3)">
      <span>⚖️</span>
      <div><div class="stat-label">PCR (OI)</div><div class="stat-value" style="color:var(--grand-light)">${pcr}</div></div>
    </div>`;

  bottomBar.classList.add('visible');
  document.getElementById('bbFiles').textContent = allFileResults.length;
  document.getElementById('bbStrikes').textContent = totalStrikes;
  document.getElementById('bbCallsOI').textContent = fmtCompact(totalCallsOI);
  document.getElementById('bbPutsOI').textContent = fmtCompact(totalPutsOI);
  document.getElementById('bbPCR').textContent = pcr;
}

// ─────────────────────────────────────────────
// Empty state
// ─────────────────────────────────────────────
function showEmpty() {
  summarySection.innerHTML = `
    <div class="empty-state">
      <span class="empty-icon">📂</span>
      <h3>No CSV files loaded yet</h3>
    </div>`;
}

// ─────────────────────────────────────────────
// File chip helpers
// ─────────────────────────────────────────────
function addFileChip(name) {
  const chip = document.createElement('div');
  chip.className = 'file-chip';
  chip.dataset.name = name;
  chip.innerHTML = `<span>📄</span>${escHtml(shortName(name, 24))}`;
  fileChips.appendChild(chip);
}

function shortName(name, max = 28) {
  return name.length > max ? name.slice(0, max - 1) + '…' : name;
}

// ─────────────────────────────────────────────
// Handle file upload
// ─────────────────────────────────────────────
async function handleFiles(files) {
  if (!files || files.length === 0) return;
  const csvFiles = Array.from(files).filter(f => f.name.toLowerCase().endsWith('.csv'));

  if (csvFiles.length === 0) {
    showToast('❌ Please upload .csv files only.', 'error');
    return;
  }

  summarySection.innerHTML = `
    <div style="text-align:center;padding:56px 24px">
      <div class="spinner" style="width:36px;height:36px;margin:0 auto 16px"></div>
      <p style="color:var(--text-muted)">Processing ${csvFiles.length} file(s)…</p>
    </div>`;

  const newResults = [];
  const errors = [];

  for (const file of csvFiles) {
    if (allFileResults.find(r => r.name === file.name)) {
      showToast(`⚠️ "${file.name}" already loaded.`, 'warn');
      continue;
    }
    try {
      const result = await processFile(file);
      newResults.push(result);
      addFileChip(file.name);
    } catch (e) {
      errors.push({ name: file.name, msg: e.message });
    }
  }

  allFileResults.push(...newResults);

  // Sort by date string to keep chronological order
  allFileResults.sort((a, b) => a.date.localeCompare(b.date));

  renderSummaryTable();
  // updateStats();

  if (errors.length > 0) {
    errors.forEach(e => {
      const errEl = document.createElement('div');
      errEl.className = 'error-card';
      errEl.innerHTML = `⚠️ <b>${escHtml(e.name)}</b>: ${escHtml(e.msg)}`;
      summarySection.prepend(errEl);
    });
  }

  if (newResults.length > 0) {
    showToast(`✅ Loaded ${newResults.length} file(s)`, 'success');
  }
}

// ─────────────────────────────────────────────
// Clear all
// ─────────────────────────────────────────────
function clearAll() {
  allFileResults = [];
  fileChips.innerHTML = '';
  fileInput.value = '';
  statsBar.innerHTML = '';
  statsBar.style.display = 'none';
  bottomBar.classList.remove('visible');
  showEmpty();
}

// ─────────────────────────────────────────────
// Toast
// ─────────────────────────────────────────────
let toastTimer;
function showToast(msg, type = 'success') {
  let toast = document.getElementById('toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'toast';
    document.body.appendChild(toast);
  }
  const bg = { success: 'rgba(74,222,128,0.15)', error: 'rgba(248,113,113,0.15)', warn: 'rgba(251,191,36,0.15)' };
  const bd = { success: 'rgba(74,222,128,0.4)', error: 'rgba(248,113,113,0.4)', warn: 'rgba(251,191,36,0.4)' };
  toast.style.cssText = `
    position:fixed;bottom:80px;left:50%;transform:translateX(-50%);
    background:${bg[type]};border:1px solid ${bd[type]};
    color:#f1f5f9;padding:10px 20px;border-radius:40px;
    font-size:13px;font-weight:600;z-index:9999;
    backdrop-filter:blur(12px);white-space:nowrap;
    animation:fadeUp 0.3s ease;font-family:Inter,sans-serif;`;
  toast.textContent = msg;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toast.style.opacity = '0'; }, 2800);
}

// ─────────────────────────────────────────────
// Event listeners
// ─────────────────────────────────────────────
browseBtn.addEventListener('click', () => fileInput.click());
uploadZone.addEventListener('click', e => {
  if (!e.target.closest('.upload-btn') && !e.target.closest('.file-chip')) fileInput.click();
});
fileInput.addEventListener('change', () => {
  if (fileInput.files && fileInput.files.length > 0) {
    handleFiles(fileInput.files);
  }

  // Allow selecting the same files again later.
  fileInput.value = '';
});

uploadZone.addEventListener('dragover', e => { e.preventDefault(); uploadZone.classList.add('drag-over'); });
uploadZone.addEventListener('dragleave', () => uploadZone.classList.remove('drag-over'));
uploadZone.addEventListener('drop', e => {
  e.preventDefault();
  uploadZone.classList.remove('drag-over');
  handleFiles(e.dataTransfer.files);
});

clearBtn.addEventListener('click', clearAll);
if (clearBtnBar) clearBtnBar.addEventListener('click', clearAll);

// ─────────────────────────────────────────────
// Init
// ─────────────────────────────────────────────
showEmpty();
statsBar.style.display = 'none';
