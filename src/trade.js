import { api } from './api.js';
import { calculateSellPrice, calculateBuyPrice } from '../shared/trade-pricing.js';

// ── Session state ──────────────────────────────────
let _session        = null;
let _stocks         = {};
let _inventory      = {};
let _gold           = 0;
let _items          = [];
let _config         = null;
let _pending        = [];
let _syncNum        = 0;
let _syncTimer      = null;
let _holdTimer      = null;
let _holdDelayTimer = null;
let _countdownTimer = null;
let _balanceCfg     = null;

async function loadBalanceCfg() {
  if (_balanceCfg) return;
  _balanceCfg = await fetch('/trade-balance-public.json').then(r => r.json());
}

export async function loadTrade() {
  await loadBalanceCfg();
  const data = await api('GET', '/api/trade/session/current');
  if (data.error || !data.session_id) { renderNoSession(); return; }
  applySession(data);
  renderAll();
}

export async function tradeGenerateSession() {
  const btn = document.getElementById('trade-gen-btn');
  if (btn) btn.disabled = true;
  stopCountdown();
  await loadBalanceCfg();
  const data = await api('POST', '/api/trade/session/generate');
  if (btn) btn.disabled = false;
  if (data.error) return;
  applySession(data);
  renderAll();
}

function applySession(data) {
  _session   = { session_id: data.session_id, expires_at: data.expires_at };
  _config    = data.config;
  _items     = data.items;
  _stocks    = {};
  _pending   = [];
  _syncNum   = 0;
  data.items.forEach(item => { _stocks[item.item_type] = item.current_stock; });
  _inventory = {};
  (data.player_inventory || []).forEach(i => { _inventory[i.itemType] = i.quantity; });
  _gold = data.player_gold;
  startSyncTimer();
  startCountdown();
}

// ── Price helpers ──────────────────────────────────
function sellPx(item) {
  return calculateSellPrice(item.base_price, item.base_quantity, _stocks[item.item_type] ?? 0, _config);
}
function buyPx(item) {
  return calculateBuyPrice(item.base_price, item.base_quantity, _stocks[item.item_type] ?? 0, _config);
}

// ── Trade execution ────────────────────────────────
function executeTrade(itemType, direction) {
  if (!_session) return;
  const item  = _items.find(i => i.item_type === itemType);
  if (!item) return;
  const stock = _stocks[itemType] ?? 0;
  const owned = _inventory[itemType] ?? 0;

  if (direction === 'sell' && owned < 1)    { stopHold(); return; }
  if (direction === 'buy'  && stock < 1)    { stopHold(); return; }

  const price = direction === 'sell' ? sellPx(item) : buyPx(item);
  if (direction === 'buy' && _gold < price) { stopHold(); return; }

  const stockBefore = stock;
  if (direction === 'sell') {
    _stocks[itemType]    = stock + 1;
    _inventory[itemType] = Math.max(0, owned - 1);
    _gold += price;
  } else {
    _stocks[itemType]    = Math.max(0, stock - 1);
    _inventory[itemType] = owned + 1;
    _gold -= price;
  }

  _pending.push({ item_type: itemType, direction, quantity: 1,
    client_price_per_unit: price, stock_before: stockBefore, stock_after: _stocks[itemType] });

  updateGoldDisplays(_gold);
  updateRow(itemType);
  showLastAction(direction, item.display_name, price);
}

// ── Hold-down ──────────────────────────────────────
function startHold(itemType, direction) {
  executeTrade(itemType, direction);
  _holdDelayTimer = setTimeout(() => {
    _holdTimer = setInterval(
      () => executeTrade(itemType, direction),
      _balanceCfg?.session?.fire_rate_ms ?? 50
    );
  }, 300);
}

function stopHold() {
  if (_holdDelayTimer) { clearTimeout(_holdDelayTimer);  _holdDelayTimer = null; }
  if (_holdTimer)      { clearInterval(_holdTimer);      _holdTimer      = null; }
  if (_pending.length > 0) doSync();
}

// ── Background sync ────────────────────────────────
function startSyncTimer() {
  stopSyncTimer();
  const ms = (_balanceCfg?.session?.sync_interval_seconds ?? 2) * 1000;
  _syncTimer = setInterval(() => { if (_pending.length > 0) doSync(); }, ms);
}

export function stopSyncTimer() {
  if (_syncTimer) { clearInterval(_syncTimer); _syncTimer = null; }
}

async function doSync() {
  if (!_session || _pending.length === 0) return;
  const batch = _pending.splice(0);
  _syncNum++;
  try {
    const result = await api('POST', '/api/trade/session/sync', {
      session_id: _session.session_id, sync_number: _syncNum, transactions: batch,
    });
    if (result.expired) { handleExpired(); return; }
    if (result.error)   { _pending.unshift(...batch); showSyncStatus('error'); return; }
    _gold = result.player_gold;
    (result.player_inventory || []).forEach(i => { _inventory[i.itemType] = i.quantity; });
    Object.entries(result.session_stocks || {}).forEach(([k, v]) => { _stocks[k] = v; });
    updateGoldDisplays(_gold);
    _items.forEach(item => updateRow(item.item_type));
    showSyncStatus('ok');
  } catch (_) {
    _pending.unshift(...batch);
    showSyncStatus('error');
  }
}

// ── Countdown ─────────────────────────────────────
function startCountdown() {
  stopCountdown();
  _countdownTimer = setInterval(tickCountdown, 1000);
  tickCountdown();
}

function stopCountdown() {
  if (_countdownTimer) { clearInterval(_countdownTimer); _countdownTimer = null; }
}

function tickCountdown() {
  if (!_session) { stopCountdown(); return; }
  const remaining = new Date(_session.expires_at) - Date.now();
  if (remaining <= 0) { stopCountdown(); handleExpired(); return; }
  const totalSecs = Math.ceil(remaining / 1000);
  const m = Math.floor(totalSecs / 60);
  const s = totalSecs % 60;
  const statusEl = document.getElementById('trade-session-status');
  if (statusEl) {
    statusEl.textContent = `Händler aktiv ${m}:${String(s).padStart(2, '0')}`;
    statusEl.className   = 'trade-session-status active';
  }
}

function handleExpired() {
  stopSyncTimer();
  stopCountdown();
  _session = null;
  const statusEl = document.getElementById('trade-session-status');
  if (statusEl) { statusEl.textContent = 'Händler abgelaufen'; statusEl.className = 'trade-session-status'; }
  document.getElementById('trade-table-container')?.classList.add('trade-expired');
}

// Called on route navigation away
export function leaveTrade() {
  stopHold();
  stopSyncTimer();
  stopCountdown();
  if (_session && _pending.length > 0) {
    fetch('/api/trade/session/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_id: _session.session_id, sync_number: _syncNum + 1, transactions: _pending }),
      keepalive: true,
    });
    _pending = [];
  }
}

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') leaveTrade();
});

// ── Indicator ──────────────────────────────────────
function _indicatorStyle(stock, baseQty) {
  const pos   = Math.max(0, Math.min(1, stock / (2 * baseQty)));
  const color = pos < 0.35 ? '#dc2626' : pos > 0.65 ? '#1565c0' : '#9ca3af';
  return { pos, color };
}

function updateIndicator(itemType, stock, baseQty) {
  const { pos, color } = _indicatorStyle(stock, baseQty);
  const fill  = document.getElementById(`trade-ind-fill-${itemType}`);
  const thumb = document.getElementById(`trade-ind-thumb-${itemType}`);
  if (!fill || !thumb) return;
  fill.style.width            = `${pos * 100}%`;
  fill.style.backgroundColor  = color;
  thumb.style.left            = `calc(${pos * 100}% - 8px)`;
  thumb.style.backgroundColor = color;
}

// ── Render ─────────────────────────────────────────
function renderNoSession() {
  const statusEl = document.getElementById('trade-session-status');
  if (statusEl) { statusEl.textContent = 'Kein aktiver Händler'; statusEl.className = 'trade-session-status'; }
  document.getElementById('trade-table-container').innerHTML = '';
}

function renderAll() {
  const statusEl = document.getElementById('trade-session-status');
  if (statusEl) statusEl.className = 'trade-session-status active';
  const container = document.getElementById('trade-table-container');
  if (container) container.classList.remove('trade-expired');
  renderTable();
  updateGoldDisplays(_gold);
}

function renderTable() {
  const container = document.getElementById('trade-table-container');
  if (!container || !_items.length) return;
  container.innerHTML = `<div class="panel" style="overflow-x:auto;margin-top:.5rem">
    <table class="trade-table" id="trade-item-table">
      <thead><tr>
        <th></th><th>ITEM</th><th>BESITZ</th><th>VERKAUFEN</th><th></th><th>KAUFEN</th><th>VORRAT</th>
      </tr></thead>
      <tbody>${_items.map(renderRow).join('')}</tbody>
    </table>
  </div>`;
  attachHoldListeners();
}

function renderRow(item) {
  const stock             = _stocks[item.item_type] ?? 0;
  const owned             = _inventory[item.item_type] ?? 0;
  const sp                = sellPx(item);
  const bp                = buyPx(item);
  const { pos, color }    = _indicatorStyle(stock, item.base_quantity);
  return `<tr id="trade-row-${item.item_type}">
    <td class="trade-icon">${item.icon}</td>
    <td>${item.display_name}</td>
    <td class="trade-amount" id="trade-owned-${item.item_type}">${owned}</td>
    <td><button class="trade-sell-btn" data-item="${item.item_type}" data-dir="sell"${owned < 1 ? ' disabled' : ''}>${sp} 💰</button></td>
    <td class="trade-indicator-cell"><div class="trade-indicator">
      <div class="indicator-track"><div class="indicator-fill" id="trade-ind-fill-${item.item_type}" style="width:${pos*100}%;background-color:${color}"></div></div>
      <div class="indicator-thumb" id="trade-ind-thumb-${item.item_type}" style="left:calc(${pos*100}% - 8px);background-color:${color}"></div>
    </div></td>
    <td><button class="trade-buy-btn"  data-item="${item.item_type}" data-dir="buy"${stock < 1 || _gold < bp ? ' disabled' : ''}>${bp} 💰</button></td>
    <td class="trade-amount" id="trade-stock-${item.item_type}">${stock}</td>
  </tr>`;
}

function updateRow(itemType) {
  const item = _items.find(i => i.item_type === itemType);
  if (!item) return;
  const stock = _stocks[itemType] ?? 0;
  const owned = _inventory[itemType] ?? 0;
  const sp    = sellPx(item);
  const bp    = buyPx(item);

  const owned_el = document.getElementById(`trade-owned-${itemType}`);
  const stock_el = document.getElementById(`trade-stock-${itemType}`);
  if (owned_el) owned_el.textContent = owned;
  if (stock_el) stock_el.textContent = stock;

  const row = document.getElementById(`trade-row-${itemType}`);
  if (!row) return;
  const sellBtn = row.querySelector('[data-dir="sell"]');
  const buyBtn  = row.querySelector('[data-dir="buy"]');
  if (sellBtn) { sellBtn.textContent = `${sp} 💰`; sellBtn.disabled = owned < 1; }
  if (buyBtn)  { buyBtn.textContent  = `${bp} 💰`; buyBtn.disabled  = stock < 1 || _gold < bp; }
  updateIndicator(itemType, stock, item.base_quantity);
}

function attachHoldListeners() {
  document.querySelectorAll('#trade-item-table [data-item][data-dir]').forEach(btn => {
    btn.addEventListener('mousedown',   e => { e.preventDefault(); startHold(btn.dataset.item, btn.dataset.dir); });
    btn.addEventListener('touchstart',  e => { e.preventDefault(); startHold(btn.dataset.item, btn.dataset.dir); }, { passive: false });
    btn.addEventListener('mouseup',     () => stopHold());
    btn.addEventListener('mouseleave',  () => stopHold());
    btn.addEventListener('touchend',    () => stopHold());
    btn.addEventListener('touchcancel', () => stopHold());
  });
}

// ── Feedback ──────────────────────────────────────
let _fbTimer = null;
function showLastAction(direction, name, price) {
  const el = document.getElementById('trade-last-action');
  const fb = document.getElementById('trade-feedback');
  if (!el || !fb) return;
  el.textContent = `${direction === 'sell' ? '+' : '-'}${price} 💰  ${name}`;
  fb.classList.remove('hidden');
  if (_fbTimer) clearTimeout(_fbTimer);
  _fbTimer = setTimeout(() => {
    fb.classList.add('hidden');
    el.textContent = '';
    const syncEl = document.getElementById('trade-sync-status');
    if (syncEl) syncEl.textContent = '';
  }, 3000);
}

function showSyncStatus(state) {
  const el = document.getElementById('trade-sync-status');
  if (!el) return;
  el.textContent = state === 'error' ? '⚠ Sync-Fehler' : '';
}

// ── Gold displays (shared across tabs) ────────────
export function updateGoldDisplays(gold) {
  const wheelEl = document.getElementById('wheel-gold');
  const statEl  = document.getElementById('stat-gold');
  const tradeEl = document.getElementById('trade-gold');
  if (wheelEl) wheelEl.textContent = `${gold} 💰`;
  if (statEl)  statEl.textContent  = gold;
  if (tradeEl) tradeEl.textContent = `${gold} 💰`;
}
