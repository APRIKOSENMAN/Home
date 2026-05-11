import { api } from './api.js';

let _gold = 0;
let _pollTimer = null;

export function setGold(value) {
  _gold = value;
  for (const id of ['nav-gold', 'wheel-gold', 'trade-gold']) {
    const el = document.getElementById(id);
    if (el) el.textContent = `${_gold} 💰`;
  }
}

export function getGold() { return _gold; }

export async function fetchGold() {
  const data = await api('GET', '/api/gold');
  if (!data.error && data.gold != null) setGold(data.gold);
}

export function startGoldPolling() {
  fetchGold();
  _pollTimer = setInterval(fetchGold, 30000);
}

export function stopGoldPolling() {
  if (_pollTimer) { clearInterval(_pollTimer); _pollTimer = null; }
}
