let cache = null;

function parseDuration(str) {
  if (typeof str === 'number') return str;
  const match = str.match(/^(\d+)(ms|s|m|h)$/);
  if (!match) return 0;
  const units = { ms: 1, s: 1000, m: 60000, h: 3600000 };
  return parseInt(match[1]) * units[match[2]];
}

export async function getGameData() {
  if (cache) return cache;
  const [items, buildings, recipes] = await Promise.all([
    fetch('/data/items.json').then(r => r.json()),
    fetch('/data/buildings.json').then(r => r.json()),
    fetch('/data/recipes.json').then(r => r.json()),
  ]);
  for (const recipe of Object.values(recipes)) {
    recipe.durationMs = parseDuration(recipe.duration);
  }
  cache = { items, buildings, recipes };
  return cache;
}
