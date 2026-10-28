// ============================================================
// Multi-Format Option Chain Scanner — app.js
// Supports NSE (NIFTY), BSE (SENSEX), and other option chain formats.
// Columns, headers, and totals are dynamically generated from CSV structure.
// ============================================================

// ── State ──
let allFileResults = [];
let activeFormatFilter = 'ALL';

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
// Supports:
// 1) "option-chain-ED-NIFTY-27-Oct-2026_5463.csv" → "27 Oct 2026"
// 2) "IO_OptionChain_SENSEX_27102026_115843_1598.csv" → "27 Oct 2026"
// 3) "27-10-2026" or "2026-10-27"
// ─────────────────────────────────────────────
function extractDate(filename) {
  // Pattern 1: digits-MonthName-digits  e.g. 27-Oct-2026 or 27_Oct_2026
  const m1 = filename.match(/(\d{1,2})[-_\s]([A-Za-z]{3,9})[-_\s](\d{4})/);
  if (m1) return `${m1[1]} ${capitalize(m1[2])} ${m1[3]}`;

  // Pattern 2: digits-digits-digits (dd-mm-yyyy or dd_mm_yyyy)
  const m2 = filename.match(/(\d{2})[-_](\d{2})[-_](\d{4})/);
  if (m2) {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const mon = months[parseInt(m2[2], 10) - 1] || m2[2];
    return `${m2[1]} ${mon} ${m2[3]}`;
  }

  // Pattern 3: yyyy-mm-dd or yyyy_mm_dd
  const m3 = filename.match(/(\d{4})[-_](\d{2})[-_](\d{2})/);
  if (m3) {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const mon = months[parseInt(m3[2], 10) - 1] || m3[2];
    return `${m3[3]} ${mon} ${m3[1]}`;
  }

  // Pattern 4: ddmmyyyy consecutive (e.g. 27102026 in IO_OptionChain_SENSEX_27102026_115843_1598.csv)
  const m4 = filename.match(/(?:^|[^0-9])(\d{2})(\d{2})(\d{4})(?:[^0-9]|$)/);
  if (m4) {
    const day = parseInt(m4[1], 10);
    const monNum = parseInt(m4[2], 10);
    const year = parseInt(m4[3], 10);
    if (day >= 1 && day <= 31 && monNum >= 1 && monNum <= 12 && year >= 2000 && year <= 2099) {
      const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      return `${m4[1]} ${months[monNum - 1]} ${m4[3]}`;
    }
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
  let s = String(raw).trim();
  if (s === '' || s === '-' || s === '--') return 0;
  s = s.replace(/^["']|["']$/g, '').trim();
  if (s === '' || s === '-' || s === '--') return 0;
  const cleaned = s.replace(/,/g, '').replace(/[₹$€\s]/g, '');
  const n = parseFloat(cleaned);
  return isNaN(n) ? 0 : n;
}

// ─────────────────────────────────────────────
// Number formatters
// ─────────────────────────────────────────────
function fmtCompact(n) {
  if (n === 0 || isNaN(n)) return '-';
  const rounded = Math.round((n + Number.EPSILON) * 100) / 100;
  return rounded.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

function fmtFull(n) {
  if (n === 0 || isNaN(n)) return '0';
  const rounded = Math.round((n + Number.EPSILON) * 100) / 100;
  return rounded.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

function fmtSign(n) {
  if (n === 0 || isNaN(n)) return '-';
  const s = fmtFull(Math.abs(n));
  return n < 0 ? `-${s}` : s;
}

function cellColor(n) {
  if (n > 0) return ' style="font-weight:600;"';
  if (n < 0) return ' style="color:#dc2626;font-weight:600;"';
  return '';
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
// Parse CSV with PapaParse (resolves all rows)
// ─────────────────────────────────────────────
function parseCSV(file) {
  return new Promise((resolve, reject) => {
    Papa.parse(file, {
      skipEmptyLines: true,
      complete(results) {
        const rows = results.data;
        if (rows.length < 3) {
          reject(new Error('File has insufficient data rows.'));
          return;
        }
        resolve(rows);
      },
      error(err) { reject(err); }
    });
  });
}

// ─────────────────────────────────────────────
// Detect Dynamic Structure from Header Rows
// ─────────────────────────────────────────────
function detectStructure(rows) {
  // Check row 1 first (standard for 2-row header option chains), fallback to row 0
  let headerRowIdx = 1;
  let headerRow = rows[1];
  let strikeIdx = headerRow ? headerRow.findIndex(c => /strike/i.test(c)) : -1;

  if (strikeIdx === -1 && rows[0]) {
    headerRowIdx = 0;
    headerRow = rows[0];
    strikeIdx = headerRow.findIndex(c => /strike/i.test(c));
  }

  if (strikeIdx === -1) {
    throw new Error('Could not identify central STRIKE column in CSV.');
  }

  const callsCols = [];
  for (let i = 0; i < strikeIdx; i++) {
    const raw = (headerRow[i] || '').trim();
    if (!raw || /no text|^-$|^\s*$/i.test(raw)) continue;
    callsCols.push({ idx: i, key: raw });
  }

  const putsCols = [];
  for (let i = strikeIdx + 1; i < headerRow.length; i++) {
    const raw = (headerRow[i] || '').trim();
    if (!raw || /no text|^-$|^\s*$/i.test(raw)) continue;
    putsCols.push({ idx: i, key: raw });
  }

  const strikeName = (headerRow[strikeIdx] || 'STRIKE').trim();
  const signature = callsCols.map(c => c.key).join(',') + '::' + putsCols.map(c => c.key).join(',');

  return {
    headerRowIdx,
    strikeIdx,
    strikeName,
    callsCols,
    putsCols,
    signature
  };
}

// ─────────────────────────────────────────────
// Calculate column totals from data rows
// ─────────────────────────────────────────────
function calcTotals(rows, structure) {
  const { headerRowIdx, strikeIdx, callsCols, putsCols } = structure;
  const calls = Object.fromEntries(callsCols.map(c => [c.key, 0]));
  const puts = Object.fromEntries(putsCols.map(c => [c.key, 0]));
  const strikes = [];
  let strikeCount = 0;
  let strikeTotal = 0;

  for (let r = headerRowIdx + 1; r < rows.length; r++) {
    const row = rows[r];
    if (!row || row.length <= strikeIdx) continue;
    const strike = parseNum(row[strikeIdx]);
    if (strike === 0) continue;
    strikeCount++;
    strikeTotal += strike;

    const cRow = {}, pRow = {};
    for (const col of callsCols) {
      const v = parseNum(row[col.idx]);
      calls[col.key] += v;
      cRow[col.key] = v;
    }
    for (const col of putsCols) {
      const v = parseNum(row[col.idx]);
      puts[col.key] += v;
      pRow[col.key] = v;
    }
    strikes.push({ strike, cRow, pRow });
  }

  strikeTotal = Math.round((strikeTotal + Number.EPSILON) * 100) / 100;
  for (const col of callsCols) {
    calls[col.key] = Math.round((calls[col.key] + Number.EPSILON) * 100) / 100;
  }
  for (const col of putsCols) {
    puts[col.key] = Math.round((puts[col.key] + Number.EPSILON) * 100) / 100;
  }

  return { calls, puts, strikes, strikeCount, strikeTotal };
}

// ─────────────────────────────────────────────
// Process one file dynamically
// ─────────────────────────────────────────────
async function processFile(file) {
  const rows = await parseCSV(file);
  const structure = detectStructure(rows);
  const { calls, puts, strikes, strikeCount, strikeTotal } = calcTotals(rows, structure);

  // Friendly format name e.g. "SENSEX", "NIFTY", etc.
  let formatLabel = 'Option Chain';
  if (/sensex/i.test(file.name) || /sensex/i.test(structure.strikeName)) {
    formatLabel = 'SENSEX';
  } else if (/nifty/i.test(file.name) || /nifty/i.test(structure.strikeName)) {
    formatLabel = 'NIFTY';
  } else if (/banknifty/i.test(file.name)) {
    formatLabel = 'BANKNIFTY';
  } else {
    formatLabel = structure.strikeName || 'Option Chain';
  }

  return {
    name: file.name,
    date: extractDate(file.name),
    formatLabel,
    structure,
    strikeCount,
    strikeTotal,
    calls,
    puts,
    strikes
  };
}

// ─────────────────────────────────────────────
// Render single table for a format group
// ─────────────────────────────────────────────
function renderGroupTable(group) {
  const { formatLabel, structure, files } = group;
  const { callsCols, putsCols, strikeName } = structure;

  // Calculate grand totals across all files in this group
  const grand = {};
  for (const c of callsCols) grand['calls_' + c.key] = 0;
  for (const p of putsCols) grand['puts_' + p.key] = 0;
  let totalStrikes = 0;
  let grandStrikeTotal = 0;

  for (const r of files) {
    totalStrikes += (r.strikeCount || 0);
    grandStrikeTotal += (r.strikeTotal || 0);
    for (const c of callsCols) {
      grand['calls_' + c.key] += (r.calls[c.key] || 0);
    }
    for (const p of putsCols) {
      grand['puts_' + p.key] += (r.puts[p.key] || 0);
    }
  }

  grandStrikeTotal = Math.round((grandStrikeTotal + Number.EPSILON) * 100) / 100;
  for (const k in grand) {
    grand[k] = Math.round((grand[k] + Number.EPSILON) * 100) / 100;
  }

  // Headers: Strike centered between Calls and Puts
  const headerRow1 = `
    <tr>
      <th rowspan="2" class="th-date">DATE</th>
      <th colspan="${callsCols.length}" class="th-calls-group">CALLS</th>
      <th rowspan="2" class="th-strike">${escHtml(strikeName)}</th>
      <th colspan="${putsCols.length}" class="th-puts-group">PUTS</th>
    </tr>
    <tr>
      ${callsCols.map(c => `<th class="th-calls">${escHtml(c.key)}</th>`).join('')}
      ${putsCols.map(p => `<th class="th-puts">${escHtml(p.key)}</th>`).join('')}
    </tr>`;

  // Data rows — one per file
  const dataRows = files.map((r, i) => {
    const callsCells = callsCols.map(col => {
      const v = r.calls[col.key] || 0;
      const isChng = /ch(?:an)?g/i.test(col.key);
      const isLtp = /^ltp$/i.test(col.key);
      let cls = 'td-calls';
      if (isLtp) cls += ' td-ltp';
      if (isChng) {
        return `<td class="${cls}"${cellColor(v)}>${fmtSign(v)}</td>`;
      }
      return `<td class="${cls}">${fmtCompact(v)}</td>`;
    }).join('');

    const putsCells = putsCols.map(col => {
      const v = r.puts[col.key] || 0;
      const isChng = /ch(?:an)?g/i.test(col.key);
      const isLtp = /^ltp$/i.test(col.key);
      let cls = 'td-puts';
      if (isLtp) cls += ' td-ltp';
      if (isChng) {
        return `<td class="${cls}"${cellColor(v)}>${fmtSign(v)}</td>`;
      }
      return `<td class="${cls}">${fmtCompact(v)}</td>`;
    }).join('');

    return `
      <tr class="data-row" data-index="${i}">
        <td class="td-date" title="${escHtml(r.name)}">
          <div class="date-label">${escHtml(r.date)}</div>
          <div class="date-file">${escHtml(r.name)}</div>
        </td>
        ${callsCells}
        <td class="td-strike" title="${r.strikeCount} strikes">${fmtCompact(r.strikeTotal)}</td>
        ${putsCells}
      </tr>`;
  }).join('');

  // Combined TOTAL row for this group
  const callsTotalCells = callsCols.map(col => {
    const v = grand['calls_' + col.key] || 0;
    const isChng = /ch(?:an)?g/i.test(col.key);
    const isLtp = /^ltp$/i.test(col.key);
    let cls = 'td-calls total-cell';
    if (isLtp) cls += ' td-ltp';
    if (isChng) return `<td class="${cls}"${cellColor(v)}>${fmtSign(v)}</td>`;
    return `<td class="${cls}">${fmtCompact(v)}</td>`;
  }).join('');

  const putsTotalCells = putsCols.map(col => {
    const v = grand['puts_' + col.key] || 0;
    const isChng = /ch(?:an)?g/i.test(col.key);
    const isLtp = /^ltp$/i.test(col.key);
    let cls = 'td-puts total-cell';
    if (isLtp) cls += ' td-ltp';
    if (isChng) return `<td class="${cls}"${cellColor(v)}>${fmtSign(v)}</td>`;
    return `<td class="${cls}">${fmtCompact(v)}</td>`;
  }).join('');

  return `
    <div class="summary-card" data-format="${escHtml(formatLabel)}">
      <div class="summary-card-header">
        <span class="summary-icon">📊</span>
        <div class="summary-card-titles">
          <h2 class="summary-title">${escHtml(formatLabel)} Date-wise Summary Table</h2>
          <p class="summary-sub">${files.length} date${files.length > 1 ? 's' : ''} loaded · ${escHtml(strikeName)} centered between Calls &amp; Puts</p>
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
              <td class="td-strike total-cell" title="${totalStrikes} total strikes across all dates">${fmtCompact(grandStrikeTotal)}</td>
              ${putsTotalCells}
            </tr>
          </tbody>
        </table>
      </div>
    </div>`;
}

// ─────────────────────────────────────────────
// Format Filter Switcher
// ─────────────────────────────────────────────
window.setFormatFilter = function (filter) {
  activeFormatFilter = filter;
  renderSummaryTable();
};

// ─────────────────────────────────────────────
// Build Date-wise Summary Tables (Multi-Format Support)
// ─────────────────────────────────────────────
function renderSummaryTable() {
  if (allFileResults.length === 0) {
    summarySection.innerHTML = '';
    return;
  }

  // Group files by dynamic structure signature
  const groups = {};
  for (const r of allFileResults) {
    const sig = r.structure.signature;
    if (!groups[sig]) {
      groups[sig] = {
        signature: sig,
        formatLabel: r.formatLabel,
        structure: r.structure,
        files: []
      };
    }
    groups[sig].files.push(r);
  }

  const groupList = Object.values(groups);
  // Sort files within each group chronologically
  groupList.forEach(g => {
    g.files.sort((a, b) => a.date.localeCompare(b.date));
  });

  let html = '';

  // If multiple distinct formats are uploaded, render format filter tabs
  if (groupList.length > 1) {
    html += `
      <div class="format-tabs-wrap">
        <div class="format-tabs">
          <button class="format-tab ${activeFormatFilter === 'ALL' ? 'active' : ''}" onclick="setFormatFilter('ALL')">
            All Formats (${allFileResults.length} files)
          </button>
          ${groupList.map(g => `
            <button class="format-tab ${activeFormatFilter === g.formatLabel ? 'active' : ''}" onclick="setFormatFilter('${escHtml(g.formatLabel)}')">
              ${escHtml(g.formatLabel)} (${g.files.length})
            </button>
          `).join('')}
        </div>
      </div>`;
  }

  const visibleGroups = activeFormatFilter === 'ALL'
    ? groupList
    : groupList.filter(g => g.formatLabel === activeFormatFilter);

  const toRender = visibleGroups.length > 0 ? visibleGroups : groupList;
  html += toRender.map(g => renderGroupTable(g)).join('<div style="height: 24px;"></div>');
  summarySection.innerHTML = html;
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

  renderSummaryTable();

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
  activeFormatFilter = 'ALL';
  fileChips.innerHTML = '';
  fileInput.value = '';
  if (statsBar) {
    statsBar.innerHTML = '';
    statsBar.style.display = 'none';
  }
  if (bottomBar) bottomBar.classList.remove('visible');
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