// Client-side (ES Module). Mirror of shared/trade-pricing.cjs — keep in sync.

export function calculateSellPrice(basePrice, baseQuantity, currentStock, config) {
  const k = baseQuantity * config.k_factor;
  let price = basePrice * (1 + k / (currentStock + k));
  price = Math.max(basePrice * config.min_price_multiplier,
          Math.min(basePrice * config.max_price_multiplier, price));
  return Math.round(price);
}

export function calculateBuyPrice(basePrice, baseQuantity, currentStock, config) {
  return Math.round(calculateSellPrice(basePrice, baseQuantity, currentStock, config) * config.buy_markup);
}

export function updateAvgBuyPrice(oldAvg, oldPaidQty, purchasePrice, purchasedQty) {
  const newPaid = oldPaidQty + purchasedQty;
  if (newPaid === 0) return { newAvg: 0, newPaid: 0 };
  return {
    newAvg:  Math.max(0, (oldAvg * oldPaidQty + purchasePrice * purchasedQty) / newPaid),
    newPaid,
  };
}

export function calculateSessionPrices(items, sessionStocks, config) {
  const prices = {};
  for (const [itemType, item] of Object.entries(items)) {
    if (!item.tradable) continue;
    const stock = sessionStocks[itemType] ?? 0;
    prices[itemType] = {
      sell_price: calculateSellPrice(item.base_price, item.base_quantity, stock, config),
      buy_price:  calculateBuyPrice(item.base_price, item.base_quantity, stock, config),
    };
  }
  return prices;
}
