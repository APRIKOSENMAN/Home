import { api } from './api.js';
import { getGameData } from './game-data.js';
import { t } from './i18n.js';

const CELL = 24;

let factoryData       = null;
let gameData          = null;
let dragBuildingType  = null;
let activeBuildingId  = null;
let buildingPollTimer = null;

export async function loadFactory() {
  [gameData, factoryData] = await Promise.all([
    getGameData(),
    api('GET', '/api/factory'),
  ]);
  renderFactory();
}

export function renderFactory() {
  renderStoragePanel();
  renderCityGrid();
}

export function renderStoragePanel() {
  const bEl = document.getElementById('storage-buildings');
  const iEl = document.getElementById('storage-items');
  if (bEl) {
    bEl.innerHTML = factoryData.unplaced.length
      ? factoryData.unplaced.map(b => {
          const d = gameData.buildings[b.type]; if (!d) return '';
          return `<div class="storage-building" draggable="true" ondragstart="startBuildingDrag(event,'${b.type}')">
            <span class="sb-icon">${d.icon}</span>
            <span class="sb-info"><b>${t('buildings.' + b.type + '.name')}</b><br><small>${d.width}×${d.height} Felder</small></span>
            <span class="sb-qty">×${b.quantity}</span>
          </div>`;
        }).join('')
      : '<p class="no-posts" style="padding:.6rem">Keine Gebäude</p>';
  }
  if (iEl) {
    iEl.innerHTML = factoryData.items.length
      ? factoryData.items.map(it => {
          const d = gameData.items[it.itemType] || { icon: '📦' };
          return `<div class="storage-item-row"><span>${d.icon} ${t('items.' + it.itemType + '.name')}</span><span class="col-gold">×${it.quantity}</span></div>`;
        }).join('')
      : '<p class="no-posts" style="padding:.4rem .8rem;font-size:.75rem">Leer</p>';
  }
}

export function renderCityGrid() {
  const grid = document.getElementById('city-grid');
  if (!grid) return;
  grid.innerHTML = '';
  for (let row = 0; row < 20; row++) {
    for (let col = 0; col < 20; col++) {
      const cell = document.createElement('div');
      cell.className = 'city-cell';
      cell.dataset.x = col; cell.dataset.y = row;
      cell.addEventListener('dragover',  e  => { e.preventDefault(); highlightDrop(col, row); });
      cell.addEventListener('dragleave', () => clearDropHighlight());
      cell.addEventListener('drop',      e  => { e.preventDefault(); dropBuilding(col, row); });
      grid.appendChild(cell);
    }
  }
  factoryData.buildings.forEach(b => {
    const d = gameData.buildings[b.type]; if (!d) return;
    const el = document.createElement('div');
    el.className = 'placed-building';
    Object.assign(el.style, {
      left: b.x * CELL + 'px', top: b.y * CELL + 'px',
      width: d.width * CELL + 'px', height: d.height * CELL + 'px',
      background: d.color, borderColor: d.borderColor
    });
    el.innerHTML = `<span class="pb-icon">${d.icon}</span>`;
    if (b.jobId) {
      const dot = document.createElement('span');
      dot.className = b.jobCompleted ? 'job-dot done' : 'job-dot running';
      el.appendChild(dot);
    }
    el.addEventListener('click', () => openBuildingPanel(b.id));
    grid.appendChild(el);
  });
}

export function startBuildingDrag(e, type) {
  dragBuildingType = type;
  e.dataTransfer.effectAllowed = 'move';
}

export function highlightDrop(x, y) {
  clearDropHighlight();
  if (!dragBuildingType) return;
  const d = gameData.buildings[dragBuildingType];
  for (let dy = 0; dy < d.height; dy++)
    for (let dx = 0; dx < d.width; dx++) {
      const c = document.querySelector(`.city-cell[data-x="${x+dx}"][data-y="${y+dy}"]`);
      if (c) c.classList.add('drop-highlight');
    }
}

export function clearDropHighlight() {
  document.querySelectorAll('.city-cell.drop-highlight').forEach(c => c.classList.remove('drop-highlight'));
}

export async function dropBuilding(x, y) {
  clearDropHighlight();
  if (!dragBuildingType) return;
  const type = dragBuildingType;
  dragBuildingType = null;
  const res = await api('POST', '/api/factory/place', { type, x, y });
  if (res.error) return;
  factoryData = await api('GET', '/api/factory');
  renderFactory();
}

export async function openBuildingPanel(id) {
  activeBuildingId = id;
  const data = await api('GET', `/api/factory/building/${id}`);
  if (data.error) return;

  const building = gameData.buildings[data.type];
  const recipe   = gameData.recipes[building.recipe];
  const input    = recipe.inputs[0];
  const output   = recipe.outputs[0];

  const inputItem  = input.type === 'gold'
    ? `${input.qty} 💰 Gold`
    : `${input.qty} ${gameData.items[input.type]?.icon ?? ''} ${t('items.' + input.type + '.name')}`;
  const outputItem = `${output.qty} ${gameData.items[output.item]?.icon ?? ''} ${t('items.' + output.item + '.name')}`;

  let jobHtml = '';
  if (!data.job) {
    jobHtml = `<div class="recipe-row">
        <div class="recipe-slot">📥 ${inputItem}</div>
        <div class="recipe-arrow">→ ${recipe.duration} →</div>
        <div class="recipe-slot">📤 ${outputItem}</div></div>
      <div class="bp-actions">
        <small class="bp-gold">Gold: ${data.gold} 💰</small>
        <button onclick="startRecipe(${id})">&#9654; STARTEN (−${input.qty} Gold)</button>
      </div>`;
  } else if (data.job.completed) {
    jobHtml = `<div class="recipe-row">
        <div class="recipe-slot done">✓ ${inputItem}</div>
        <div class="recipe-arrow">→</div>
        <div class="recipe-slot ready">✅ ${outputItem}</div></div>
      <div class="bp-actions"><button onclick="collectOutput(${id})">&#128230; EINSAMMELN</button></div>`;
  } else {
    const pct = Math.round(data.job.progress * 100);
    const rem = Math.round(data.job.remainingMs / 1000);
    const ts  = rem >= 60 ? `${Math.floor(rem/60)}m ${rem%60}s` : `${rem}s`;
    jobHtml = `<div class="recipe-row">
        <div class="recipe-slot done">✓ ${inputItem}</div>
        <div class="recipe-arrow">→</div>
        <div class="recipe-slot">${outputItem}</div></div>
      <div class="bp-progress-wrap"><div class="bp-progress-bar" style="width:${pct}%"></div></div>
      <div class="bp-progress-label">${pct}% · noch ${ts}</div>
      <div class="bp-actions"><button disabled>&#8987; ${ts}</button></div>`;
  }

  document.getElementById('building-panel-content').innerHTML = `
    <div class="bp-title"><span>${building.icon} ${t('buildings.' + data.type + '.name')}</span>
      <button class="bp-remove" onclick="removeBuilding(${id})" title="Abbauen">&#128465;</button></div>
    ${jobHtml}
    <p class="error" id="bp-error"></p>`;
  document.getElementById('building-panel').classList.remove('hidden');
  if (buildingPollTimer) clearInterval(buildingPollTimer);
  if (data.job && !data.job.completed)
    buildingPollTimer = setInterval(() => openBuildingPanel(id), 5000);
}

export function closeBuildingPanel() {
  if (buildingPollTimer) { clearInterval(buildingPollTimer); buildingPollTimer = null; }
  activeBuildingId = null;
  document.getElementById('building-panel')?.classList.add('hidden');
}

export async function startRecipe(id) {
  const res = await api('POST', `/api/factory/building/${id}/start`);
  const err = document.getElementById('bp-error');
  if (res.error) { err.textContent = res.error; return; }
  err.textContent = '';
  factoryData = await api('GET', '/api/factory');
  renderCityGrid();
  await openBuildingPanel(id);
}

export async function collectOutput(id) {
  const res = await api('POST', `/api/factory/building/${id}/collect`);
  const err = document.getElementById('bp-error');
  if (res.error) { err.textContent = res.error; return; }
  err.textContent = '';
  factoryData.items = res.items;
  renderStoragePanel();
  factoryData = await api('GET', '/api/factory');
  renderCityGrid();
  await openBuildingPanel(id);
  if (buildingPollTimer) { clearInterval(buildingPollTimer); buildingPollTimer = null; }
}

export async function removeBuilding(id) {
  if (!confirm('Gebäude abbauen und in Storage zurückstellen?')) return;
  const res = await api('DELETE', `/api/factory/building/${id}`);
  if (res.error) { document.getElementById('bp-error').textContent = res.error; return; }
  closeBuildingPanel();
  factoryData = await api('GET', '/api/factory');
  renderFactory();
}
