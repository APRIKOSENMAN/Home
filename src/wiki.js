import { getGameData } from './game-data.js';
import { t } from './i18n.js';

export async function loadWiki() {
  const { items, buildings, recipes, quests } = await getGameData();
  const currencies = (await import('../data/currencies.json')).default.currencies;
  const container = document.getElementById('wiki-container');
  container.innerHTML =
    renderCurrencies(currencies) +
    renderItems(items) +
    renderBuildings(buildings) +
    renderRecipes(recipes, items, buildings) +
    renderQuests(quests, items);
}

function renderCurrencies(currencies) {
  const rows = currencies.map(c => {
    const typeText = c.type === 'soft' ? 'Soft' : 'Hard';
    const tradeableText = c.tradeable ? 'Ja' : 'Nein';
    const operationsText = c.operations.join(', ');
    return `<tr>
      <td class="trade-icon">${c.icon}</td>
      <td>${t(c.i18nKey)}</td>
      <td>${typeText}</td>
      <td>${tradeableText}</td>
      <td>${operationsText}</td>
      <td class="trade-amount">${c.min} - ${c.max >= 999999999 ? '∞' : c.max.toLocaleString()}</td>
    </tr>`;
  }).join('');
  return `<div class="panel">
    <div class="panel-header">WÄHRUNGEN</div>
    <table class="trade-table">
      <thead><tr><th></th><th>NAME</th><th>TYP</th><th>TAUSCHBAR</th><th>OPERATIONEN</th><th>GRENZEN</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  </div>`;
}

function renderItems(items) {
  const rows = Object.entries(items).map(([id, def]) => `<tr>
    <td class="trade-icon">${def.icon}</td>
    <td>${t('items.' + id + '.name')}</td>
  </tr>`).join('');
  return `<div class="panel">
    <div class="panel-header">ITEMS</div>
    <table class="trade-table">
      <thead><tr><th></th><th>NAME</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  </div>`;
}

function renderBuildings(buildings) {
  const rows = Object.entries(buildings).map(([id, def]) => `<tr>
    <td class="trade-icon">${def.icon}</td>
    <td>${t('buildings.' + id + '.name')}</td>
    <td class="trade-amount">${def.width}×${def.height}</td>
  </tr>`).join('');
  return `<div class="panel" style="margin-top:.5rem">
    <div class="panel-header">GEBÄUDE</div>
    <table class="trade-table">
      <thead><tr><th></th><th>NAME</th><th>GRÖßE</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  </div>`;
}

function renderRecipes(recipes, items, buildings) {
  const rows = Object.entries(recipes).map(([, r]) => {
    const bName = t('buildings.' + r.building + '.name');
    const inputs = r.inputs.map(inp =>
      inp.type === 'gold'
        ? `${inp.qty} 💰`
        : `${items[inp.type]?.icon ?? ''} ×${inp.qty}`
    ).join(', ');
    const outputs = r.outputs.map(out =>
      `${items[out.item]?.icon ?? ''} ${t('items.' + out.item + '.name')} ×${out.qty}`
    ).join(', ');
    return `<tr>
      <td>${bName}</td>
      <td>${inputs}</td>
      <td>${outputs}</td>
      <td class="trade-amount">${r.duration}</td>
    </tr>`;
  }).join('');
  return `<div class="panel" style="margin-top:.5rem">
    <div class="panel-header">REZEPTE</div>
    <table class="trade-table">
      <thead><tr><th>GEBÄUDE</th><th>ROHSTOFFE</th><th>ERGEBNIS</th><th>DAUER</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  </div>`;
}

function renderQuests(quests, items) {
  function rewardText(reward) {
    if (reward.gold) return `${reward.gold} 💰`;
    if (reward.item) {
      const icon = items[reward.item]?.icon ?? '';
      const name = t('items.' + reward.item + '.name');
      return `${icon} ${name} ×${reward.qty}`;
    }
    return '?';
  }
  const rows = Object.entries(quests).map(([id, q]) => {
    const name = t('quests.' + id + '.name');
    const desc = t('quests.' + id + '.description');
    return `<tr>
      <td>${name}</td>
      <td>${q.type.toUpperCase()}</td>
      <td>${desc}</td>
      <td>${rewardText(q.reward)}</td>
    </tr>`;
  }).join('');
  return `<div class="panel" style="margin-top:.5rem">
    <div class="panel-header">QUESTS</div>
    <table class="trade-table">
      <thead><tr><th>NAME</th><th>TYP</th><th>AUFGABE</th><th>BELOHNUNG</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  </div>`;
}
