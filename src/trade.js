import { api } from './api.js';

let _offers = [];
let _playerItems = {};

export async function loadTrade() {
  const errEl = document.getElementById('trade-error');
  errEl.textContent = '';
  const data = await api('GET', '/api/trade/offers/market_trader');
  if (data.error) { errEl.textContent = data.error; return; }
  _offers = data.offers;
  _playerItems = Object.fromEntries(data.items.map(i => [i.itemType, i.quantity]));
  const nameEl = document.getElementById('trade-trader-name');
  if (nameEl) nameEl.textContent = data.trader.display_name.toUpperCase();
  updateGoldDisplays(data.gold);
  renderTradeTable();
}

export async function tradeBuy(itemType) {
  const errEl = document.getElementById('trade-error');
  errEl.textContent = '';
  const data = await api('POST', '/api/trade/buy', { trader_id: 'market_trader', item_type: itemType, quantity: 1 });
  if (data.error) { errEl.textContent = data.error; return; }
  const offer = _offers.find(o => o.item_type === itemType);
  if (offer) offer.stock -= 1;
  _playerItems = Object.fromEntries(data.items.map(i => [i.itemType, i.quantity]));
  updateGoldDisplays(data.gold);
  renderTradeTable();
}

export async function tradeSell(itemType) {
  const errEl = document.getElementById('trade-error');
  errEl.textContent = '';
  const data = await api('POST', '/api/trade/sell', { trader_id: 'market_trader', item_type: itemType, quantity: 1 });
  if (data.error) { errEl.textContent = data.error; return; }
  const offer = _offers.find(o => o.item_type === itemType);
  if (offer) offer.stock += 1;
  _playerItems = Object.fromEntries(data.items.map(i => [i.itemType, i.quantity]));
  updateGoldDisplays(data.gold);
  renderTradeTable();
}

export function updateGoldDisplays(gold) {
  const wheelEl = document.getElementById('wheel-gold');
  const statEl  = document.getElementById('stat-gold');
  const tradeEl = document.getElementById('trade-gold');
  if (wheelEl) wheelEl.textContent = `${gold} 💰`;
  if (statEl)  statEl.textContent = gold;
  if (tradeEl) tradeEl.textContent = `${gold} 💰`;
}

function renderTradeTable() {
  const container = document.getElementById('trade-table-container');
  if (!container) return;
  if (!_offers.length) {
    container.innerHTML = '<p class="no-posts" style="padding:.8rem">Keine Angebote verfügbar.</p>';
    return;
  }
  container.innerHTML = `<table class="trade-table">
    <thead><tr>
      <th></th><th>ITEM</th><th>VORRAT</th><th>KAUFEN</th><th>VERKAUFEN</th><th>BESITZ</th>
    </tr></thead>
    <tbody>${_offers.map(o => {
      const owned = _playerItems[o.item_type] ?? 0;
      return `<tr>
        <td class="trade-icon">${o.icon}</td>
        <td>${o.display_name}</td>
        <td class="trade-amount">${o.stock}</td>
        <td><button class="trade-buy-btn" onclick="tradeBuy('${o.item_type}')"${o.stock < 1 ? ' disabled' : ''}>${o.buy_price} 💰</button></td>
        <td><button class="trade-sell-btn" onclick="tradeSell('${o.item_type}')"${owned < 1 ? ' disabled' : ''}>${o.sell_price} 💰</button></td>
        <td class="trade-amount">${owned}</td>
      </tr>`;
    }).join('')}</tbody>
  </table>`;
}
