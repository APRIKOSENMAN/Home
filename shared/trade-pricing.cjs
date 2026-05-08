// Server-side (CommonJS). Mirror of shared/trade-pricing.js — keep in sync.

function calculateSellPrice(basePrice, baseQuantity, currentStock, config) {
  const k = baseQuantity * config.k_factor;
  let price = basePrice * (1 + k / (currentStock + k));
  price = Math.max(basePrice * config.min_price_multiplier,
          Math.min(basePrice * config.max_price_multiplier, price));
  return Math.round(price);
}

function calculateBuyPrice(basePrice, baseQuantity, currentStock, config) {
  return Math.round(calculateSellPrice(basePrice, baseQuantity, currentStock, config) * config.buy_markup);
}

function calculateSessionPrices(items, sessionStocks, config) {
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

module.exports = { calculateSellPrice, calculateBuyPrice, calculateSessionPrices };
