import { getGameData } from './game-data.js';
import { t } from './i18n.js';
import WB from '../shared/wheel-balance.js';

export async function loadWiki() {
  const { items, buildings, recipes, quests } = await getGameData();
  const currencies = await fetch('/data/currencies.json').then(r => r.json()).then(d => d.currencies);
  const container = document.getElementById('wiki-container');
  container.innerHTML =
    // renderWheel() +
    renderCurrencies(currencies) +
    renderItems(items) +
    renderBuildings(buildings) +
    renderRecipes(recipes, items, buildings) +
    renderQuests(quests, items);
}

// ── Wheel EV ──────────────────────────────────────
function jackpotEV() {
  const rounds = WB.jackpot.rounds;

  // Last round repeats → fixed-point: V = p_end / (1 − Σ pᵢ·rᵢ)
  const last = rounds[rounds.length - 1];
  let pEnd = 0, sumPR = 0;
  for (const f of last.fields) {
    if (f.end) pEnd = f.prob;
    else       sumPR += f.prob * f.reward;
  }
  let V = (1 - sumPR) > 0 ? pEnd / (1 - sumPR) : 0;

  // Back-propagate through earlier rounds
  for (let i = rounds.length - 2; i >= 0; i--) {
    let Vn = 0;
    for (const f of rounds[i].fields) Vn += f.end ? f.prob : f.prob * f.reward * V;
    V = Vn;
  }

  return WB.spin_cost * V;
}

function wheelSpinEV() {
  const catExp = WB.categories.reduce((s, c) => s + c.prob * ((c.min + c.max) / 2) * WB.spin_cost, 0);
  return (1 - WB.jackpot.prob) * catExp + WB.jackpot.prob * jackpotEV() - WB.spin_cost;
}

function renderWheel() {
  const jp    = WB.jackpot;
  const jpEV  = jackpotEV();
  const wEV   = wheelSpinEV();
  const hedge = (-wEV / WB.spin_cost * 100).toFixed(1);
  const colors = jp.field_colors;

  const fieldHeaders = jp.rounds[0].fields.map((f, i) =>
    `<th style="color:${colors[i]}">${f.end ? 'CASH OUT' : `Feld ${i + 1}`}</th>`
  ).join('');

  const roundRows = jp.rounds.map((round, idx) =>
    `<tr><td class="col-num">${idx + 1}</td>${
      round.fields.map((f, i) => {
        const pct = (f.prob * 100).toFixed(1);
        return `<td class="col-num" style="color:${colors[i]}">${
          f.end ? `${pct}%` : `×${f.reward}<br><small style="opacity:.7">${pct}%</small>`
        }</td>`;
      }).join('')
    }</tr>`
  ).join('');

  const catRows = WB.categories.map(c => {
    const avg = (c.min + c.max) / 2 * WB.spin_cost;
    return `<tr>
      <td><span style="display:inline-block;width:10px;height:10px;border-radius:2px;background:${c.color};margin-right:5px"></span></td>
      <td class="col-num">${(c.prob * 100).toFixed(0)}%</td>
      <td class="col-num">${c.min === c.max ? `${c.min * WB.spin_cost}` : `${c.min * WB.spin_cost} – ${c.max * WB.spin_cost}`} 💰</td>
      <td class="col-num">${avg.toFixed(2)} 💰</td>
    </tr>`;
  }).join('');

  return `<div class="panel">
    <div class="panel-header">WHEEL OF FORTUNE — EV</div>
    <table class="trade-table" style="margin-bottom:.8rem">
      <thead><tr><th>Kennzahl</th><th>Wert</th></tr></thead>
      <tbody>
        <tr><td>Einsatz pro Spin</td><td class="col-num">${WB.spin_cost} 💰</td></tr>
        <tr><td>Jackpot-Chance</td><td class="col-num">${(jp.prob * 100).toFixed(0)} %</td></tr>
        <tr><td>⌀ Jackpot-Auszahlung</td><td class="col-num">${jpEV.toFixed(2)} 💰</td></tr>
        <tr><td>⌀ Return pro Spin</td><td class="col-num ${wEV < 0 ? 'log-zero' : ''}">${wEV >= 0 ? '+' : ''}${wEV.toFixed(2)} 💰</td></tr>
        <tr><td>House Edge</td><td class="col-num">${hedge} %</td></tr>
      </tbody>
    </table>
    <table class="trade-table" style="margin-bottom:.8rem">
      <thead><tr><th>Kategorie</th><th>Chance</th><th>Reward</th><th>⌀ Reward</th></tr></thead>
      <tbody>${catRows}</tbody>
    </table>
    <table class="trade-table">
      <thead><tr><th>Runde</th>${fieldHeaders}</tr></thead>
      <tbody>${roundRows}</tbody>
    </table>
  </div>`;
}

function renderCurrencies(currencies) {
  const rows = currencies.map(c => {
    const typeText     = c.type === 'soft' ? t('ui.wiki.val.soft') : t('ui.wiki.val.hard');
    const tradeableText = c.tradeable ? t('ui.wiki.val.yes') : t('ui.wiki.val.no');
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
    <div class="panel-header">${t('ui.wiki.currencies')}</div>
    <table class="trade-table">
      <thead><tr><th></th><th>${t('ui.wiki.col.name')}</th><th>${t('ui.wiki.col.type')}</th><th>${t('ui.wiki.col.tradeable')}</th><th>${t('ui.wiki.col.operations')}</th><th>${t('ui.wiki.col.limits')}</th></tr></thead>
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
    <div class="panel-header">${t('ui.wiki.items')}</div>
    <table class="trade-table">
      <thead><tr><th></th><th>${t('ui.wiki.col.name')}</th></tr></thead>
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
    <div class="panel-header">${t('ui.wiki.buildings')}</div>
    <table class="trade-table">
      <thead><tr><th></th><th>${t('ui.wiki.col.name')}</th><th>${t('ui.wiki.col.size')}</th></tr></thead>
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
    <div class="panel-header">${t('ui.wiki.recipes')}</div>
    <table class="trade-table">
      <thead><tr><th>${t('ui.wiki.col.building')}</th><th>${t('ui.wiki.col.inputs')}</th><th>${t('ui.wiki.col.output')}</th><th>${t('ui.wiki.col.duration')}</th></tr></thead>
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
    <div class="panel-header">${t('ui.wiki.quests')}</div>
    <table class="trade-table">
      <thead><tr><th>${t('ui.wiki.col.name')}</th><th>${t('ui.wiki.col.type')}</th><th>${t('ui.wiki.col.task')}</th><th>${t('ui.wiki.col.reward')}</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  </div>`;
}
