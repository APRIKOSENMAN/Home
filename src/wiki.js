import { getGameData } from './game-data.js';
import { t } from './i18n.js';

export async function loadWiki() {
  const { items, buildings, recipes } = await getGameData();
  const container = document.getElementById('wiki-container');
  container.innerHTML =
    renderItems(items) +
    renderBuildings(buildings) +
    renderRecipes(recipes, items, buildings);
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
