import { api } from './api.js';
import { t } from './i18n.js';
import { calculateSellPrice, calculateBuyPrice } from '../shared/trade-pricing.js';
import { traderPrefetch } from './trade-prefetch.js';
import { recordBurst, getFullSummary, resetSummary } from './trade-session-summary.js';
import { updateSummaryPopup, clearAllSummaryPopups } from './trade-summary-popup.js';

// ── Session state ──────────────────────────────────
let _session        = null;
let _stocks         = {};
let _inventory      = {};
let _avgBuyPrice    = {};
let _paidQty        = {};
let _gold           = 0;
let _items          = [];
let _config         = null;
let _pending        = [];
let _syncNum        = 0;
let _syncTimer         = null;
let _holdTimer         = null;
let _holdDelayTimer    = null;
let _countdownTimer    = null;
let _balanceCfg        = null;
let _isTradingActive   = false;
let _syncInFlight      = false;
let _syncDebounceTimer = null;
let _needsActivation   = false;

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

  // Try prefetch cache first — consume() is instant if ready, awaits in-flight if loading
  let data = null;
  const prefetchStatus = traderPrefetch.getStatus();
  if (prefetchStatus === 'ready' || prefetchStatus === 'loading') {
    data = await traderPrefetch.consume().catch(() => null);
  }

  if (data && !data.error) {
    // Cache hit: apply immediately, no server call needed
    if (btn) btn.disabled = false;
    _logSummary();
    applySession(data, false); // false: we activate synchronously below
    renderAll();
    // Activate before prime() so the prefetch DELETE doesn't kill this session
    // while it's still status='prefetched'. Session must be 'active' first.
    await api('POST', '/api/trade/session/activate', { session_id: data.session_id }).catch(() => {});
    traderPrefetch.invalidate();
    traderPrefetch.prime();
    return;
  }

  // Fallback: direct API call (prefetch was idle, expired, or failed)
  data = await api('POST', '/api/trade/session/generate');
  if (btn) btn.disabled = false;
  if (data.error) return;
  _logSummary();
  applySession(data, false);
  renderAll();
  traderPrefetch.invalidate(); // clear any stale prefetch data
  traderPrefetch.prime();
}

function applySession(data, fromPrefetch = false) {
  resetSummary();
  clearAllSummaryPopups();
  _session   = { session_id: data.session_id, expires_at: data.expires_at };
  _config    = data.config;
  _items     = data.items;
  _stocks          = {};
  _pending         = [];
  _syncNum         = 0;
  _isTradingActive = false;
  _syncInFlight    = false;
  _needsActivation = fromPrefetch;
  if (_syncDebounceTimer) { clearTimeout(_syncDebounceTimer); _syncDebounceTimer = null; }
  data.items.forEach(item => { _stocks[item.item_type] = item.current_stock; });
  _inventory   = {};
  _avgBuyPrice = {};
  _paidQty     = {};
  (data.player_inventory || []).forEach(i => {
    _inventory[i.itemType]   = i.quantity;
    _avgBuyPrice[i.itemType] = i.avgBuyPrice  ?? 0;
    _paidQty[i.itemType]     = i.paidQuantity ?? 0;
  });
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
  if (_needsActivation) {
    _needsActivation = false;
    api('POST', '/api/trade/session/activate', { session_id: _session.session_id }).catch(() => {});
  }
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

  recordBurst(itemType, direction, 1, price);
  updateGoldDisplays(_gold);
  updateRow(itemType);
  updateSummaryPopup(itemType, item.display_name);
}

// ── Hold-down ──────────────────────────────────────
function startHold(itemType, direction) {
  _isTradingActive = true;
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
  _isTradingActive = false;
  if (_pending.length > 0) scheduleSyncDebounced();
}

function scheduleSyncDebounced() {
  if (_syncDebounceTimer) clearTimeout(_syncDebounceTimer);
  _syncDebounceTimer = setTimeout(() => { _syncDebounceTimer = null; doSync(); }, 150);
}

// ── Background sync ────────────────────────────────
function startSyncTimer() {
  stopSyncTimer();
  const ms = (_balanceCfg?.session?.sync_interval_seconds ?? 2) * 1000;
  _syncTimer = setInterval(() => { if (_pending.length > 0 && !_isTradingActive) doSync(); }, ms);
}

export function stopSyncTimer() {
  if (_syncTimer)         { clearInterval(_syncTimer);        _syncTimer         = null; }
  if (_syncDebounceTimer) { clearTimeout(_syncDebounceTimer); _syncDebounceTimer = null; }
}

async function doSync() {
  if (_syncInFlight || !_session || _pending.length === 0) return;
  _syncInFlight = true;
  const batch = _pending.splice(0);
  _syncNum++;
  try {
    const result = await api('POST', '/api/trade/session/sync', {
      session_id: _session.session_id, sync_number: _syncNum, transactions: batch,
    });
    if (result.expired) { handleExpired(); return; }
    if (result.error)   { _pending.unshift(...batch); return; }
    // Only overwrite optimistic state when the player is not actively trading
    // and no new transactions have queued up while this request was in-flight.
    if (!_isTradingActive && _pending.length === 0) {
      _gold = result.player_gold;
      (result.player_inventory || []).forEach(i => {
        _inventory[i.itemType]   = i.quantity;
        _avgBuyPrice[i.itemType] = i.avgBuyPrice  ?? 0;
        _paidQty[i.itemType]     = i.paidQuantity ?? 0;
      });
      Object.entries(result.session_stocks || {}).forEach(([k, v]) => { _stocks[k] = v; });
      updateGoldDisplays(_gold);
      _items.forEach(item => updateRow(item.item_type));
    }
    if (_pending.length > 0) doSync();
  } catch (_) {
    _pending.unshift(...batch);
  } finally {
    _syncInFlight = false;
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
    statusEl.textContent = `${t('ui.trade.status.active')} ${m}:${String(s).padStart(2, '0')}`;
    statusEl.className   = 'trade-session-status active';
  }
}

function handleExpired() {
  stopSyncTimer();
  stopCountdown();
  _session = null;
  const statusEl = document.getElementById('trade-session-status');
  if (statusEl) { statusEl.textContent = t('ui.trade.status.expired'); statusEl.className = 'trade-session-status'; }
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
function _indicatorColor(pos) {
  // pos=0 → red (left/low stock), pos=0.5 → yellow, pos=1 → green (right/high stock)
  let h, s, l;
  if (pos <= 0.5) {
    const t = pos * 2;
    h = 0  + 55 * t;
    s = 70 + 20 * t;
    l = 42 +  8 * t;
  } else {
    const t = (pos - 0.5) * 2;
    h = 55 + 65 * t;
    s = 90 - 25 * t;
    l = 50 - 20 * t;
  }
  return `hsl(${Math.round(h)},${Math.round(s)}%,${Math.round(l)}%)`;
}

function _indicatorStyle(stock, baseQty) {
  const pos   = Math.max(0, Math.min(1, stock / (2 * baseQty)));
  const color = _indicatorColor(pos);
  return { pos, color };
}

function updateIndicator(itemType, stock, baseQty) {
  const { pos, color } = _indicatorStyle(stock, baseQty);
  const fill  = document.getElementById(`trade-ind-fill-${itemType}`);
  const thumb = document.getElementById(`trade-ind-thumb-${itemType}`);
  if (fill)  { fill.style.width = `${pos * 100}%`; fill.style.backgroundColor = color; }
  if (thumb) { thumb.style.left = `calc(${pos * 100}% - 8px)`; thumb.style.backgroundColor = color; }
}

// ── Render ─────────────────────────────────────────
function renderNoSession() {
  const statusEl = document.getElementById('trade-session-status');
  if (statusEl) { statusEl.textContent = t('ui.trade.status.none'); statusEl.className = 'trade-session-status'; }
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
        <th></th><th>${t('ui.trade.col.item')}</th><th>${t('ui.trade.col.owned')}</th><th>${t('ui.trade.col.sell')}</th><th>${t('ui.trade.col.buy')}</th>
        <th class="stock-th"><div>${t('ui.trade.col.stock')}</div><div class="stock-legend"><span class="legend-low">low</span><div class="legend-grad"></div><span class="legend-high">high</span></div></th>
      </tr></thead>
      <tbody>${_items.map(renderRow).join('')}</tbody>
    </table>
  </div>`;
  attachHoldListeners();
}

function renderRow(item) {
  const stock             = _stocks[item.item_type] ?? 0;
  const owned             = _inventory[item.item_type] ?? 0;
  const avg               = _avgBuyPrice[item.item_type] ?? 0;
  const paid              = _paidQty[item.item_type]     ?? 0;
  const sp                = sellPx(item);
  const bp                = buyPx(item);
  const { pos, color }    = _indicatorStyle(stock, item.base_quantity);
  return `<tr id="trade-row-${item.item_type}">
    <td class="trade-icon">${item.icon}</td>
    <td>${item.display_name}</td>
    <td class="trade-amount"><span id="trade-owned-${item.item_type}">${owned}</span><span class="trade-avg" id="trade-avg-${item.item_type}"${paid <= 0 ? ' style="display:none"' : ''}> ⌀ ${Math.round(avg)} 💰</span></td>
    <td><button class="trade-sell-btn" data-item="${item.item_type}" data-dir="sell"${owned < 1 ? ' disabled' : ''}>${sp} 💰</button></td>
    <td><button class="trade-buy-btn"  data-item="${item.item_type}" data-dir="buy"${stock < 1 || _gold < bp ? ' disabled' : ''}>${bp} 💰</button></td>
    <td class="stock-th trade-amount">
      <div id="trade-stock-${item.item_type}">${stock}</div>
      <div class="trade-indicator">
        <div class="indicator-track"><div class="indicator-fill" id="trade-ind-fill-${item.item_type}" style="width:${pos*100}%;background-color:${color}"></div></div>
        <div class="indicator-thumb" id="trade-ind-thumb-${item.item_type}" style="left:calc(${pos*100}% - 8px);background-color:${color}"></div>
      </div>
    </td>
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
  const avg_el   = document.getElementById(`trade-avg-${itemType}`);
  if (owned_el) owned_el.textContent = owned;
  if (stock_el) stock_el.textContent = stock;
  if (avg_el) {
    const avg  = _avgBuyPrice[itemType] ?? 0;
    const paid = _paidQty[itemType]     ?? 0;
    if (paid > 0) {
      avg_el.textContent    = `⌀ ${Math.round(avg)} 💰`;
      avg_el.style.display  = '';
    } else {
      avg_el.textContent    = '';
      avg_el.style.display  = 'none';
    }
  }

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

function _logSummary() {
  if (!_session) return;
  const full = getFullSummary();
  if (full.length === 0) return;
  const summary = full.map(s => ({
    item_id:  s.item_id,
    net_qty:  s.net_qty,
    net_avg:  s.net_avg !== null ? Math.round(s.net_avg) : null,
    net_gold: Math.round(s.net_gold),
  }));
  fetch('/api/trade/session/log', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ session_id: _session.session_id, summary }),
  }).catch(() => {});
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
