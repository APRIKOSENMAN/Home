// Shared sort + filter state for all three tables (lb, pt, sl)
export let lbSort = { col: 'gold', dir: 'desc' };
export let ptSort = { col: 'created_at', dir: 'desc' };
export let slSort = { col: 'spunAt', dir: 'desc' };
export const lbFilters = {};
export const ptFilters = {};
export const slFilters = {};

let activeFilterCol   = null;
let activeFilterTable = null;

// Render callbacks: main.js registers these after importing all render functions
const renderers = {};
export function registerRenderer(table, fn) { renderers[table] = fn; }

export function openColFilter(col, btn, isNumeric, table = 'lb') {
  const dropdown = document.getElementById('lb-col-filter');
  if (activeFilterCol === col && activeFilterTable === table && !dropdown.classList.contains('hidden')) {
    closeColFilter();
    return;
  }
  activeFilterCol   = col;
  activeFilterTable = table;
  dropdown.dataset.col   = col;
  dropdown.dataset.table = table;

  document.getElementById('lbf-range-wrap').style.display = isNumeric ? 'flex' : 'none';
  const filters = _getFilters(table);
  const f = filters[col] || {};
  document.getElementById('lbf-text').value = f.text || '';
  document.getElementById('lbf-from').value = f.from ?? '';
  document.getElementById('lbf-to').value   = f.to   ?? '';

  const rect = btn.getBoundingClientRect();
  dropdown.style.left   = Math.max(4, rect.left - 80) + 'px';
  dropdown.style.top    = 'auto';
  dropdown.style.bottom = (window.innerHeight - rect.top + 4) + 'px';
  dropdown.classList.remove('hidden');

  document.querySelectorAll('.col-filter-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');

  setTimeout(() => {
    (isNumeric ? document.getElementById('lbf-from') : document.getElementById('lbf-text')).focus();
  }, 50);
}

export function closeColFilter() {
  document.getElementById('lb-col-filter').classList.add('hidden');
  document.querySelectorAll('.col-filter-btn').forEach(b => b.classList.remove('active'));
  activeFilterCol   = null;
  activeFilterTable = null;
}

export function applyColFilter() {
  const col   = document.getElementById('lb-col-filter').dataset.col;
  const table = document.getElementById('lb-col-filter').dataset.table || 'lb';
  if (!col) return;
  const text = document.getElementById('lbf-text').value.trim().toLowerCase();
  const from = document.getElementById('lbf-from').value;
  const to   = document.getElementById('lbf-to').value;
  const filters = _getFilters(table);
  if (!text && from === '' && to === '') {
    delete filters[col];
  } else {
    filters[col] = {
      text: text || '',
      from: from !== '' ? parseFloat(from) : undefined,
      to:   to   !== '' ? parseFloat(to)   : undefined,
    };
  }
  updateColClearBtns(table);
  renderers[table]?.();
}

export function clearColFilter() {
  const col   = document.getElementById('lb-col-filter').dataset.col;
  const table = document.getElementById('lb-col-filter').dataset.table || 'lb';
  const filters = _getFilters(table);
  if (col) delete filters[col];
  document.getElementById('lbf-text').value = '';
  document.getElementById('lbf-from').value = '';
  document.getElementById('lbf-to').value   = '';
  closeColFilter();
  updateColClearBtns(table);
  renderers[table]?.();
}

export function clearOneColFilter(col, table = 'lb') {
  const filters = _getFilters(table);
  delete filters[col];
  if (table === 'lb') {
    const effectiveCol = col === 'rank' ? 'gold' : col;
    if (lbSort.col === effectiveCol) lbSort = { col: 'gold', dir: 'desc' };
  } else if (table === 'sl') {
    if (slSort.col === col) slSort = { col: 'spunAt', dir: 'desc' };
  } else {
    if (ptSort.col === col) ptSort = { col: 'created_at', dir: 'desc' };
  }
  updateColClearBtns(table);
  renderers[table]?.();
}

export function updateColClearBtns(table) {
  const filters = _getFilters(table);
  const sort    = table === 'lb' ? lbSort : table === 'sl' ? slSort : ptSort;
  document.querySelectorAll(`.col-clear-btn[data-table="${table}"]`).forEach(btn => {
    const col          = btn.dataset.col;
    const effectiveCol = (table === 'lb' && col === 'rank') ? 'gold' : col;
    const hasFilter    = !!filters[col];
    const isSorted     = sort.col === effectiveCol;
    btn.classList.toggle('hidden', !hasFilter && !isSorted);
  });
}

function _getFilters(table) {
  return table === 'lb' ? lbFilters : table === 'sl' ? slFilters : ptFilters;
}
