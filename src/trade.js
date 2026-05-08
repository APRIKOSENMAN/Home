import { api } from './api.js';
import { calculateSellPrice, calculateBuyPrice } from '../shared/trade-pricing.js';

// ── Session state ──────────────────────────────────
let _session   = null;
let _stocks    = {};   // { item_type: current_stock } — local optimistic
let _inventory = {};   // { item_type: quantity }     — local optimistic
let _gold      = 0;
let _items     = [];   // item defs with base_price, base_quantity
let _config    = null; // pricing config from server
let _pending   = [];   // transactions pending next sync
let _syncNum   = 0;
let _syncTimer = null;
let _holdTimer = null;
let _balanceCfg = null;

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
  await loadBalanceCfg();
  const data = await api('POST', '/api/trade/session/generate');
  if (data.error) { if (btn) btn.disabled = false; return; }
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

  if (direction === 'sell' && owned < 1)        { stopHold(); return; }
  if (direction === 'buy'  && stock < 1)        { stopHold(); return; }

  const price = direction === 'sell' ? sellPx(item) : buyPx(item);
  if (direction === 'buy' && _gold < price)     { stopHold(); return; }

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
  _holdTimer = setInterval(
    () => executeTrade(itemType, direction),
    _balanceCfg?.session?.fire_rate_ms ?? 50
  );
}

function stopHold() {
  if (_holdTimer) { clearInterval(_holdTimer); _holdTimer = null; }
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

function handleExpired() {
  stopSyncTimer();
  _session = null;
  const statusEl = document.getElementById('trade-session-status');
  if (statusEl) { statusEl.textContent = 'Session abgelaufen'; statusEl.className = 'trade-session-status'; }
  const btn = document.getElementById('trade-gen-btn');
  if (btn) btn.disabled = false;
  document.getElementById('trade-table-container').innerHTML = '';
}

// Called on route navigation away — syncs pending, keeps session open
export function leaveTrade() {
  stopHold();
  stopSyncTimer();
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

// visibilitychange: sync when tab goes hidden
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') leaveTrade();
});

// ── Render ─────────────────────────────────────────
function renderNoSession() {
  updateSessionHeader(false);
  document.getElementById('trade-table-container').innerHTML = '';
}

function renderAll() {
  updateSessionHeader(true);
  renderTable();
  updateGoldDisplays(_gold);
}

function updateSessionHeader(active) {
  const statusEl = document.getElementById('trade-session-status');
  const btn      = document.getElementById('trade-gen-btn');
  if (!statusEl) return;
  if (active && _session) {
    const d = new Date(_session.expires_at);
    statusEl.textContent = `Händler aktiv bis ${d.getHours().toString().padStart(2,'0')}:${d.getMinutes().toString().padStart(2,'0')}`;
    statusEl.className   = 'trade-session-status active';
    if (btn) btn.disabled = true;
  } else {
    statusEl.textContent = 'Kein aktiver Händler';
    statusEl.className   = 'trade-session-status';
    if (btn) btn.disabled = false;
  }
}

function renderTable() {
  const container = document.getElementById('trade-table-container');
  if (!container || !_items.length) return;
  container.innerHTML = `<div class="panel" style="overflow-x:auto;margin-top:.5rem">
    <table class="trade-table" id="trade-item-table">
      <thead><tr>
        <th></th><th>ITEM</th><th>BESITZ</th><th>VORRAT</th>
        <th>VERKAUF</th><th>KAUF</th><th></th><th></th>
      </tr></thead>
      <tbody>${_items.map(renderRow).join('')}</tbody>
    </table>
  </div>`;
  attachHoldListeners();
}

function renderRow(item) {
  const stock  = _stocks[item.item_type] ?? 0;
  const owned  = _inventory[item.item_type] ?? 0;
  const sp     = sellPx(item);
  const bp     = buyPx(item);
  return `<tr id="trade-row-${item.item_type}">
    <td class="trade-icon">${item.icon}</td>
    <td>${item.display_name}</td>
    <td class="trade-amount" id="trade-owned-${item.item_type}">${owned}</td>
    <td class="trade-amount" id="trade-stock-${item.item_type}">${stock}</td>
    <td class="trade-amount" id="trade-spx-${item.item_type}">${sp} 💰</td>
    <td class="trade-amount" id="trade-bpx-${item.item_type}">${bp} 💰</td>
    <td><button class="trade-sell-btn" data-item="${item.item_type}" data-dir="sell"${owned < 1 ? ' disabled' : ''}>VERKAUFEN</button></td>
    <td><button class="trade-buy-btn"  data-item="${item.item_type}" data-dir="buy"${stock < 1 || _gold < bp ? ' disabled' : ''}>KAUFEN</button></td>
  </tr>`;
}

function updateRow(itemType) {
  const item = _items.find(i => i.item_type === itemType);
  if (!item) return;
  const stock = _stocks[itemType] ?? 0;
  const owned = _inventory[itemType] ?? 0;
  const sp    = sellPx(item);
  const bp    = buyPx(item);

  const el = id => document.getElementById(id);
  if (el(`trade-owned-${itemType}`)) el(`trade-owned-${itemType}`).textContent = owned;
  if (el(`trade-stock-${itemType}`)) el(`trade-stock-${itemType}`).textContent = stock;
  if (el(`trade-spx-${itemType}`))   el(`trade-spx-${itemType}`).textContent   = `${sp} 💰`;
  if (el(`trade-bpx-${itemType}`))   el(`trade-bpx-${itemType}`).textContent   = `${bp} 💰`;

  const row = el(`trade-row-${itemType}`);
  if (!row) return;
  const sellBtn = row.querySelector('[data-dir="sell"]');
  const buyBtn  = row.querySelector('[data-dir="buy"]');
  if (sellBtn) sellBtn.disabled = owned < 1;
  if (buyBtn)  buyBtn.disabled  = stock < 1 || _gold < bp;
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
