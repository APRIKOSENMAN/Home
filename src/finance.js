import { api } from './api.js';
import { slSort, slFilters, updateColClearBtns } from './table-filter.js';

// ── Transaction Log State ────────────────────────
let tlData        = [];
let postedSeeds   = new Set();

// ── Public API ───────────────────────────────────
export async function loadFinance() {
  const data = await api('GET', '/api/user');
  if (data.error) return;

  // Update currency display in tab
  updateCurrencyTabDisplay(data.wallet);

  // Render wallet display
  renderWalletDisplay(data.wallet);

  // Load transaction log
  loadTransactionLog();
}

function renderWalletDisplay(wallet) {
  const container = document.getElementById('wallet-display');
  if (!container) return;

  const currencies = [
    { id: 'gold', icon: '🪙', name: 'Gold', value: wallet.gold },
    { id: 'premium', icon: '💎', name: 'Premium', value: wallet.premium },
    { id: 'gems', icon: '✨', name: 'Edelsteine', value: wallet.gems }
  ];

  container.innerHTML = currencies.map(c => `
    <div class="currency-item">
      <span class="currency-icon">${c.icon}</span>
      <span class="currency-name">${c.name}</span>
      <span class="currency-amount">${c.value.toLocaleString()}</span>
    </div>
  `).join('');
}

export function updateCurrencyTabDisplay(wallet) {
  const currencies = [
    { id: 'gold', icon: '🪙', value: wallet.gold },
    { id: 'premium', icon: '💎', value: wallet.premium },
    { id: 'gems', icon: '✨', value: wallet.gems }
  ];

  const display = currencies
    .filter(c => c.value > 0)
    .map(c => `${c.icon} ${formatCurrency(c.value)}`)
    .join(' ');

  const tabEl = document.querySelector('[href="#finance"]');
  if (tabEl) {
    tabEl.innerHTML = display || 'FINANCE';
  }
}

function formatCurrency(amount) {
  if (amount >= 1000000) return `${(amount / 1000000).toFixed(1)}M`;
  if (amount >= 1000) return `${(amount / 1000).toFixed(1)}K`;
  return amount.toString();
}

// ── Transaction Log ──────────────────────────────
async function loadTransactionLog() {
  const entries = await api('GET', '/api/user/transactions');
  tlData = entries;
  renderTransactionLog();
}

export function sortTransactionLog(col) {
  if (slSort.col === col) {
    slSort.dir = slSort.dir === 'desc' ? 'asc' : 'desc';
  } else {
    slSort.col = col;
    slSort.dir = col === 'createdAt' ? 'desc' : 'asc';
  }
  renderTransactionLog();
}

export function renderTransactionLog(entries) {
  if (Array.isArray(entries)) tlData = entries;
  const container = document.getElementById('finance-log-container');
  if (!container) return;
  if (!tlData.length) {
    container.innerHTML = '<div class="panel-label">TRANSACTION VERLAUF</div><div class="panel"><p>Noch keine Transaktionen.</p></div>';
    return;
  }

  let data = [...tlData].filter(e => {
    for (const [col, f] of Object.entries(slFilters)) {
      let val;
      if (col === 'createdAt') val = new Date(e.createdAt).toLocaleString('de-DE');
      else val = e[col];
      if (f.text && !String(val ?? '').toLowerCase().includes(f.text)) return false;
      if (f.from !== undefined && Number(val) < f.from) return false;
      if (f.to   !== undefined && Number(val) > f.to)   return false;
    }
    return true;
  });

  data.sort((a, b) => {
    const dir = slSort.dir === 'asc' ? 1 : -1;
    if (slSort.col === 'createdAt') return (new Date(a.createdAt) - new Date(b.createdAt)) * dir;
    if (slSort.col === 'action')   return String(a.action).localeCompare(String(b.action)) * dir;
    return ((a[slSort.col] ?? 0) - (b[slSort.col] ?? 0)) * dir;
  });

  container.innerHTML = `
    <div class="panel-label">TRANSACTION VERLAUF</div>
    <div class="panel" style="margin-top:130px">
      <table class="spin-log-table">
        <thead><tr>
          <th><div class="th-inner">
            <span class="sortable" onclick="sortTransactionLog('createdAt')">DATUM ${sortIconHtml('createdAt')}</span>
            <button class="col-filter-btn" onclick="openColFilter('createdAt',this,false,'tl')">&#128269;</button>
            <button class="col-clear-btn hidden" data-col="createdAt" data-table="tl" onclick="clearOneColFilter('createdAt','tl')">&#10005;</button>
          </div></th>
          <th><div class="th-inner">
            <span class="sortable" onclick="sortTransactionLog('action')">AKTION ${sortIconHtml('action')}</span>
            <button class="col-filter-btn" onclick="openColFilter('action',this,false,'tl')">&#128269;</button>
            <button class="col-clear-btn hidden" data-col="action" data-table="tl" onclick="clearOneColFilter('action','tl')">&#10005;</button>
          </div></th>
          <th><div class="th-inner">
            <span class="sortable" onclick="sortTransactionLog('reason')">GRUND ${sortIconHtml('reason')}</span>
            <button class="col-filter-btn" onclick="openColFilter('reason',this,false,'tl')">&#128269;</button>
            <button class="col-clear-btn hidden" data-col="reason" data-table="tl" onclick="clearOneColFilter('reason','tl')">&#10005;</button>
          </div></th>
          <th><div class="th-inner">
            <span class="sortable" onclick="sortTransactionLog('delta')">VERÄNDERUNG ${sortIconHtml('delta')}</span>
            <button class="col-filter-btn" onclick="openColFilter('delta',this,false,'tl')">&#128269;</button>
            <button class="col-clear-btn hidden" data-col="delta" data-table="tl" onclick="clearOneColFilter('delta','tl')">&#10005;</button>
          </div></th>
        </tr></thead>
        <tbody>${data.map(e => {
          const date = new Date(e.createdAt).toLocaleString('de-DE');
          const deltaStr = formatDelta(e.delta);
          return `<tr>
            <td class="col-num">${date}</td>
            <td class="log-action">${e.action}</td>
            <td class="log-reason">${e.reason || '–'}</td>
            <td class="col-num ${deltaStr.cls}">${deltaStr.text}</td>
          </tr>`;
        }).join('')}</tbody>
      </table>
    </div>
  `;

  updateColClearBtns('tl');
}

function sortIconHtml(col) {
  const isActive = slSort.col === col;
  const dir = slSort.dir;
  if (!isActive) return '<span class="sort-icon"></span>';
  return `<span class="sort-icon ${dir}"></span>`;
}

function formatDelta(deltaJson) {
  try {
    const delta = JSON.parse(deltaJson);
    const changes = [];

    for (const [currency, amount] of Object.entries(delta)) {
      if (amount > 0) changes.push(`+${amount} ${getCurrencyIcon(currency)}`);
      else if (amount < 0) changes.push(`${amount} ${getCurrencyIcon(currency)}`);
    }

    if (changes.length === 0) return { text: '–', cls: '' };

    const text = changes.join(', ');
    const cls = changes.some(c => c.startsWith('+')) ? 'log-positive' :
                changes.some(c => c.startsWith('-')) ? 'log-negative' : '';

    return { text, cls };
  } catch {
    return { text: deltaJson, cls: '' };
  }
}

function getCurrencyIcon(currency) {
  const icons = { gold: '🪙', premium: '💎', gems: '✨' };
  return icons[currency] || currency;
}
