const _raw = {};

export function recordBurst(item_id, action, quantity, price) {
  if (!_raw[item_id]) {
    _raw[item_id] = { bought_qty: 0, bought_total_gold: 0, sold_qty: 0, sold_total_gold: 0 };
  }
  const r = _raw[item_id];
  if (action === 'buy') {
    r.bought_qty        += quantity;
    r.bought_total_gold += quantity * price;
  } else {
    r.sold_qty        += quantity;
    r.sold_total_gold += quantity * price;
  }
}

export function getSummary(item_id) {
  const r = _raw[item_id];
  if (!r) return null;
  return _compute(item_id, r);
}

function _compute(item_id, r) {
  const net_qty  = r.bought_qty  - r.sold_qty;
  const net_gold = r.sold_total_gold - r.bought_total_gold;
  return { item_id, net_qty, net_gold, net_avg: net_qty !== 0 ? net_gold / net_qty : null };
}

export function getFullSummary() {
  return Object.entries(_raw).map(([item_id, r]) => _compute(item_id, r));
}

export function resetSummary() {
  Object.keys(_raw).forEach(k => delete _raw[k]);
}
