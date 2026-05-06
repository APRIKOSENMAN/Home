import { api } from './api.js';
import { lbSort, lbFilters, updateColClearBtns } from './table-filter.js';

let lbData = [];

export async function loadLeaderboard() {
  lbData = await api('GET', '/api/leaderboard');
  renderLeaderboard();
}

export function sortLeaderboard(col) {
  const effectiveCol = col === 'rank' ? 'gold' : col;
  if (lbSort.col === effectiveCol) {
    lbSort.dir = lbSort.dir === 'desc' ? 'asc' : 'desc';
  } else {
    lbSort.col = effectiveCol;
    lbSort.dir = effectiveCol === 'username' ? 'asc' : 'desc';
  }
  renderLeaderboard();
}

export function renderLeaderboard() {
  const tbody = document.getElementById('leaderboard-body');

  const goldRanks = {};
  lbData.forEach(u => {
    goldRanks[u.username] = lbData.filter(x => x.gold > u.gold).length + 1;
  });

  document.querySelectorAll('.sort-icon[data-table="lb"]').forEach(el => {
    const active = el.dataset.col === lbSort.col ||
                   (el.dataset.col === 'rank' && lbSort.col === 'gold');
    el.className = 'sort-icon' + (active ? ` ${lbSort.dir}` : '');
  });

  let data = [...lbData].filter(u => {
    for (const [col, f] of Object.entries(lbFilters)) {
      const val = u[col];
      if (f.text && !String(val).toLowerCase().includes(f.text)) return false;
      if (f.from !== undefined && Number(val) < f.from) return false;
      if (f.to   !== undefined && Number(val) > f.to)   return false;
    }
    return true;
  });

  data.sort((a, b) => {
    const dir = lbSort.dir === 'asc' ? 1 : -1;
    if (lbSort.col === 'username') return a.username.localeCompare(b.username) * dir;
    return ((a[lbSort.col] ?? 0) - (b[lbSort.col] ?? 0)) * dir;
  });

  if (!data.length) {
    tbody.innerHTML = '<tr><td colspan="8" class="no-posts">Keine User gefunden.</td></tr>';
    updateColClearBtns('lb');
    return;
  }

  tbody.innerHTML = data.map(u => `
    <tr>
      <td class="rank">${goldRanks[u.username]}</td>
      <td><a href="#profile/${encodeURIComponent(u.username)}" class="author-link">${u.username}</a></td>
      <td class="col-num">${u.postCount}</td>
      <td class="col-likes">${u.likesReceived}</td>
      <td class="col-dislikes">${u.dislikesReceived}</td>
      <td class="col-gold">${u.gold}</td>
      <td class="col-num">${u.spinCount}</td>
      <td class="col-gold">${u.bestReward > 0 ? '+' + u.bestReward : '–'}</td>
    </tr>
  `).join('');

  updateColClearBtns('lb');
}
