import { getSummary } from './trade-session-summary.js';

export function updateSummaryPopup(item_id, item_name) {
  const s = getSummary(item_id);
  if (!s) return;

  const row = document.getElementById(`trade-row-${item_id}`);
  if (!row) return;

  let popup = document.getElementById(`trade-summary-popup-${item_id}`);
  if (!popup) {
    popup = document.createElement('div');
    popup.id = `trade-summary-popup-${item_id}`;
    popup.className = 'trade-summary-popup';
    document.body.appendChild(popup);
  }

  const rect = row.getBoundingClientRect();
  popup.style.top  = `${rect.top + rect.height / 2}px`;
  popup.style.left = `${rect.right + 8}px`;

  const { net_qty, net_gold, net_avg } = s;
  const goldRounded = Math.round(net_gold);

  let goldStr, goldClass;
  if      (goldRounded > 0) { goldStr = `+${goldRounded}g`;            goldClass = 'summary-pos';  }
  else if (goldRounded < 0) { goldStr = `−${Math.abs(goldRounded)}g`; goldClass = 'summary-neg';  }
  else                       { goldStr = '±0g';                         goldClass = 'summary-zero'; }

  const qtyStr = Math.abs(net_qty) > 0 ? `${Math.abs(net_qty)}x` : '';
  const avgStr = (net_qty !== 0 && net_avg !== null)
    ? ` ⌀${Math.abs(Math.round(net_avg))}g`
    : '';

  popup.innerHTML =
    `<div class="summary-title">Summary  ${item_name}</div>` +
    `<div class="summary-row">${qtyStr}${avgStr} <span class="${goldClass}">${goldStr}</span></div>`;
}

export function clearAllSummaryPopups() {
  document.querySelectorAll('.trade-summary-popup').forEach(el => el.remove());
}
