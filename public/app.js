let currentUser       = null;
let refreshInterval   = null;
let lastBoardSnapshot = null;
let boardView         = 'cards';

// Leaderboard state
let lbData    = [];
let lbSort    = { col: 'gold', dir: 'desc' };
let lbFilters = {};

// Posts table state
let ptData    = [];
let ptSort    = { col: 'created_at', dir: 'desc' };
let ptFilters = {};

// Shared filter dropdown state
let activeFilterCol   = null;
let activeFilterTable = null; // 'lb' | 'pt'

// ── API ──────────────────────────────────────────
async function api(method, url, body) {
  const res = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined
  });
  return res.json();
}

// ── Char Counter ──────────────────────────────────
function updateCharCount(el) {
  const wrap  = el.closest('.field-wrap');
  if (!wrap) return;
  const max   = parseInt(el.maxLength);
  const len   = el.value.length;
  const pct   = len / max;
  const counter = wrap.querySelector('.char-count');
  const fill    = wrap.querySelector('.char-fill');
  if (!counter || !fill) return;

  counter.textContent = `${len}/${max}`;
  fill.style.width = (pct * 100) + '%';

  const warn  = pct >= 0.8;
  const limit = pct >= 1;
  counter.className = 'char-count' + (el.tagName === 'TEXTAREA' ? ' char-count-area' : '') + (limit ? ' limit' : warn ? ' warn' : '');
  fill.className    = 'char-fill' + (limit ? ' limit' : warn ? ' warn' : '');
}

function checkPublishable() {
  const title = document.getElementById('post-title');
  const body  = document.getElementById('post-body');
  const btn   = document.getElementById('publish-btn');
  if (!btn) return;
  const ok = title.value.trim().length > 0 && body.value.trim().length > 0
          && title.value.length <= 100 && body.value.length <= 1000;
  btn.disabled = !ok;
  btn.classList.toggle('btn-disabled', !ok);
}

// ── Auth ─────────────────────────────────────────
function showRegister() {
  document.getElementById('login-box').classList.add('hidden');
  document.getElementById('register-box').classList.remove('hidden');
}

function showLogin() {
  document.getElementById('register-box').classList.add('hidden');
  document.getElementById('login-box').classList.remove('hidden');
}

async function register() {
  const { username, password, err } = getRegFields();
  if (!username || !password) { err.textContent = 'Bitte alle Felder ausfüllen.'; return; }
  if (password !== document.getElementById('reg-pass2').value) { err.textContent = 'Passwörter stimmen nicht überein.'; return; }
  const data = await api('POST', '/api/register', { username, password });
  if (data.error) { err.textContent = data.error; return; }
  err.style.color = '#1a7a3a';
  err.textContent = 'Registrierung erfolgreich!';
  setTimeout(() => { err.textContent = ''; err.style.color = ''; showLogin(); }, 1500);
}

async function registerAndLogin() {
  const { username, password, err } = getRegFields();
  if (!username || !password) { err.textContent = 'Bitte alle Felder ausfüllen.'; return; }
  if (password !== document.getElementById('reg-pass2').value) { err.textContent = 'Passwörter stimmen nicht überein.'; return; }
  const reg = await api('POST', '/api/register', { username, password });
  if (reg.error) { err.textContent = reg.error; return; }
  const login = await api('POST', '/api/login', { username, password });
  if (login.error) { err.textContent = login.error; return; }
  currentUser = login.username;
  showApp(login.username);
}

async function quickRegister() {
  const id  = String(Math.floor(10000000 + Math.random() * 90000000));
  const err = document.getElementById('reg-error');
  const reg = await api('POST', '/api/register', { username: id, password: id });
  if (reg.error) { err.textContent = reg.error; return; }
  const login = await api('POST', '/api/login', { username: id, password: id });
  if (login.error) { err.textContent = login.error; return; }
  currentUser = login.username;
  showApp(login.username);
}

function getRegFields() {
  return {
    username: document.getElementById('reg-user').value.trim().toLowerCase(),
    password: document.getElementById('reg-pass').value,
    err:      document.getElementById('reg-error')
  };
}

async function login() {
  const username = document.getElementById('login-user').value.trim().toLowerCase();
  const password = document.getElementById('login-pass').value;
  const err      = document.getElementById('login-error');
  if (!username || !password) { err.textContent = 'Bitte alle Felder ausfüllen.'; return; }
  const data = await api('POST', '/api/login', { username, password });
  if (data.error) { err.textContent = data.error; return; }
  err.textContent = '';
  currentUser = data.username;
  showApp(data.username);
}

async function logout() {
  await api('POST', '/api/logout');
  currentUser = null;
  stopBoardRefresh();
  document.getElementById('app-section').classList.add('hidden');
  document.getElementById('auth-section').classList.remove('hidden');
  document.getElementById('login-user').value = '';
  document.getElementById('login-pass').value = '';
  history.replaceState(null, '', window.location.pathname);
  showLogin();
}

// ── App ──────────────────────────────────────────
function showApp(username) {
  currentUser = username;
  document.getElementById('auth-section').classList.add('hidden');
  document.getElementById('app-section').classList.remove('hidden');
  if (!window.location.hash || window.location.hash === '#') {
    window.location.hash = '#board';
  } else {
    handleRoute();
  }
}

// ── Board ─────────────────────────────────────────
async function submitPost() {
  const title    = document.getElementById('post-title').value.trim();
  const body     = document.getElementById('post-body').value.trim();
  const feedback = document.getElementById('post-feedback');
  if (!title || !body) return;

  const data = await api('POST', '/api/posts', { title, body });
  feedback.classList.remove('hidden', 'success', 'error');

  if (data.error) {
    feedback.textContent = '✗ ' + data.error;
    feedback.classList.add('error');
  } else {
    feedback.textContent = '✓ Beitrag veröffentlicht!';
    feedback.classList.add('success');
    document.getElementById('post-title').value = '';
    document.getElementById('post-body').value  = '';
    document.querySelectorAll('#view-board .field-wrap').forEach(wrap => {
      const input = wrap.querySelector('input, textarea');
      if (input) updateCharCount(input);
    });
    checkPublishable();
    lastBoardSnapshot = null;
    loadBoardPosts();
    setTimeout(() => feedback.classList.add('hidden'), 3000);
  }
}

async function loadBoardPosts() {
  const posts = await api('GET', '/api/posts');
  const snap  = JSON.stringify(posts.map(p => ({ id: p.id, up: p.upvotes, down: p.downvotes, uv: p.userVote })));
  if (snap === lastBoardSnapshot) return;
  lastBoardSnapshot = snap;
  renderPosts(posts, document.getElementById('posts-container'));
  renderPostsTable(posts);
}

function startBoardRefresh() {
  stopBoardRefresh();
  refreshInterval = setInterval(loadBoardPosts, 5000);
}

function stopBoardRefresh() {
  if (refreshInterval) { clearInterval(refreshInterval); refreshInterval = null; }
}

// ── Board View Toggle ─────────────────────────────
function setBoardView(view) {
  boardView = view;
  document.getElementById('posts-container').classList.toggle('hidden', view !== 'cards');
  document.getElementById('posts-table-container').classList.toggle('hidden', view !== 'table');
  document.getElementById('btn-cards').classList.toggle('active', view === 'cards');
  document.getElementById('btn-table').classList.toggle('active', view === 'table');
}

function sortPostsTable(col) {
  if (ptSort.col === col) {
    ptSort.dir = ptSort.dir === 'desc' ? 'asc' : 'desc';
  } else {
    ptSort.col = col;
    ptSort.dir = (col === 'title' || col === 'author') ? 'asc' : 'desc';
  }
  renderPostsTable();
}

function renderPostsTable(posts) {
  if (Array.isArray(posts)) ptData = posts;
  const tbody = document.getElementById('posts-table-body');
  if (!tbody) return;

  // Sort icons
  document.querySelectorAll('.sort-icon[data-table="pt"]').forEach(el => {
    el.className = 'sort-icon' + (el.dataset.col === ptSort.col ? ` ${ptSort.dir}` : '');
  });

  // Filter
  let data = [...ptData].filter(p => {
    for (const [col, f] of Object.entries(ptFilters)) {
      let val;
      if (col === 'created_at') {
        val = new Date(p.created_at || p.createdAt).toLocaleString('de-DE');
      } else {
        val = p[col];
      }
      if (f.text && !String(val ?? '').toLowerCase().includes(f.text)) return false;
      if (f.from !== undefined && Number(val) < f.from) return false;
      if (f.to   !== undefined && Number(val) > f.to)   return false;
    }
    return true;
  });

  // Sort
  data.sort((a, b) => {
    const dir = ptSort.dir === 'asc' ? 1 : -1;
    if (ptSort.col === 'title' || ptSort.col === 'author') {
      return String(a[ptSort.col] ?? '').localeCompare(String(b[ptSort.col] ?? '')) * dir;
    }
    if (ptSort.col === 'created_at') {
      return (new Date(a.created_at || a.createdAt) - new Date(b.created_at || b.createdAt)) * dir;
    }
    return ((a[ptSort.col] ?? 0) - (b[ptSort.col] ?? 0)) * dir;
  });

  if (!data.length) {
    tbody.innerHTML = '<tr><td colspan="5" class="no-posts">Noch keine Beiträge vorhanden.</td></tr>';
    updateColClearBtns('pt');
    return;
  }

  tbody.innerHTML = data.map(p => {
    const date = new Date(p.created_at || p.createdAt).toLocaleString('de-DE');
    return `<tr>
      <td><a href="#profile/${encodeURIComponent(p.author)}" class="author-link" onclick="event.stopPropagation()">${escapeHtml(p.title)}</a></td>
      <td><a href="#profile/${encodeURIComponent(p.author)}" class="author-link">${escapeHtml(p.author)}</a></td>
      <td class="col-num">${date}</td>
      <td class="col-likes col-num">${p.upvotes}</td>
      <td class="col-dislikes col-num">${p.downvotes}</td>
    </tr>`;
  }).join('');

  updateColClearBtns('pt');
}

// ── Votes ─────────────────────────────────────────
async function vote(btn) {
  const postId    = btn.dataset.postId;
  const direction = btn.dataset.direction;
  const current   = btn.dataset.userVote;
  const newVote   = current === direction ? null : direction;

  const result = await api('POST', `/api/posts/${postId}/vote`, { vote: newVote });
  if (result.error) return;
  lastBoardSnapshot = null;

  const hash = window.location.hash || '#board';
  if (hash === '#board' || hash === '#' || hash === '') {
    loadBoardPosts();
  } else if (hash.startsWith('#profile')) {
    const parts    = hash.split('/');
    const username = parts[1] ? decodeURIComponent(parts[1]) : currentUser;
    const [posts, profile] = await Promise.all([
      api('GET', `/api/posts?author=${encodeURIComponent(username)}`),
      api('GET', `/api/profile/${encodeURIComponent(username)}`)
    ]);
    renderPosts(posts, document.getElementById('profile-posts-container'));
    updateProfileStats(profile);
  }
}

// ── Leaderboard ───────────────────────────────────
async function loadLeaderboard() {
  lbData = await api('GET', '/api/leaderboard');
  renderLeaderboard();
}

function sortLeaderboard(col) {
  // rank column sorts by gold
  const effectiveCol = col === 'rank' ? 'gold' : col;
  if (lbSort.col === effectiveCol) {
    lbSort.dir = lbSort.dir === 'desc' ? 'asc' : 'desc';
  } else {
    lbSort.col = effectiveCol;
    lbSort.dir = effectiveCol === 'username' ? 'asc' : 'desc';
  }
  renderLeaderboard();
}

// ── Shared Column Filter ───────────────────────────
function openColFilter(col, btn, isNumeric, table) {
  if (!table) table = 'lb';
  const dropdown = document.getElementById('lb-col-filter');

  if (activeFilterCol === col && activeFilterTable === table && !dropdown.classList.contains('hidden')) {
    closeColFilter();
    return;
  }

  activeFilterCol   = col;
  activeFilterTable = table;
  dropdown.dataset.col   = col;
  dropdown.dataset.table = table;

  const isNum = !!isNumeric;
  document.getElementById('lbf-range-wrap').style.display = isNum ? 'flex' : 'none';

  const filters = table === 'lb' ? lbFilters : ptFilters;
  const f = filters[col] || {};
  document.getElementById('lbf-text').value = f.text || '';
  document.getElementById('lbf-from').value = f.from ?? '';
  document.getElementById('lbf-to').value   = f.to   ?? '';

  // Always open upward (tables have margin-top to ensure room)
  const rect = btn.getBoundingClientRect();
  dropdown.style.left   = Math.max(4, rect.left - 80) + 'px';
  dropdown.style.top    = 'auto';
  dropdown.style.bottom = (window.innerHeight - rect.top + 4) + 'px';
  dropdown.classList.remove('hidden');

  document.querySelectorAll('.col-filter-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');

  setTimeout(() => {
    const first = isNum
      ? document.getElementById('lbf-from')
      : document.getElementById('lbf-text');
    first.focus();
  }, 50);
}

function closeColFilter() {
  document.getElementById('lb-col-filter').classList.add('hidden');
  document.querySelectorAll('.col-filter-btn').forEach(b => b.classList.remove('active'));
  activeFilterCol   = null;
  activeFilterTable = null;
}

function applyColFilter() {
  const col   = document.getElementById('lb-col-filter').dataset.col;
  const table = document.getElementById('lb-col-filter').dataset.table || 'lb';
  if (!col) return;

  const text = document.getElementById('lbf-text').value.trim().toLowerCase();
  const from = document.getElementById('lbf-from').value;
  const to   = document.getElementById('lbf-to').value;

  const filters = table === 'lb' ? lbFilters : ptFilters;

  if (!text && from === '' && to === '') {
    delete filters[col];
  } else {
    filters[col] = {
      text: text || '',
      from: from !== '' ? parseFloat(from) : undefined,
      to:   to   !== '' ? parseFloat(to)   : undefined
    };
  }

  updateColClearBtns(table);
  if (table === 'lb') renderLeaderboard();
  else                renderPostsTable();
}

function clearColFilter() {
  const col   = document.getElementById('lb-col-filter').dataset.col;
  const table = document.getElementById('lb-col-filter').dataset.table || 'lb';
  const filters = table === 'lb' ? lbFilters : ptFilters;
  if (col) delete filters[col];
  document.getElementById('lbf-text').value = '';
  document.getElementById('lbf-from').value = '';
  document.getElementById('lbf-to').value   = '';
  closeColFilter();
  updateColClearBtns(table);
  if (table === 'lb') renderLeaderboard();
  else                renderPostsTable();
}

function clearOneColFilter(col, table) {
  if (!table) table = 'lb';
  const filters = table === 'lb' ? lbFilters : ptFilters;
  delete filters[col];
  // Also reset sort if this column is currently active
  if (table === 'lb') {
    const effectiveCol = col === 'rank' ? 'gold' : col;
    if (lbSort.col === effectiveCol) lbSort = { col: 'gold', dir: 'desc' };
  } else {
    if (ptSort.col === col) ptSort = { col: 'created_at', dir: 'desc' };
  }
  updateColClearBtns(table);
  if (table === 'lb') renderLeaderboard();
  else                renderPostsTable();
}

function updateColClearBtns(table) {
  const filters = table === 'lb' ? lbFilters : ptFilters;
  const sort    = table === 'lb' ? lbSort    : ptSort;
  document.querySelectorAll(`.col-clear-btn[data-table="${table}"]`).forEach(btn => {
    const col         = btn.dataset.col;
    const effectiveCol = (table === 'lb' && col === 'rank') ? 'gold' : col;
    const hasFilter   = !!filters[col];
    const isSorted    = sort.col === effectiveCol;
    btn.classList.toggle('hidden', !hasFilter && !isSorted);
  });
}

function renderLeaderboard() {
  const tbody = document.getElementById('leaderboard-body');

  // Pre-compute gold-based ranks (ties get same rank)
  const goldRanks = {};
  lbData.forEach(u => {
    goldRanks[u.username] = lbData.filter(x => x.gold > u.gold).length + 1;
  });

  // Sort icons — rank icon activates when sorting by gold
  document.querySelectorAll('.sort-icon[data-table="lb"]').forEach(el => {
    const active = el.dataset.col === lbSort.col ||
                   (el.dataset.col === 'rank' && lbSort.col === 'gold');
    el.className = 'sort-icon' + (active ? ` ${lbSort.dir}` : '');
  });

  // Filter
  let data = [...lbData].filter(u => {
    for (const [col, f] of Object.entries(lbFilters)) {
      const val = u[col];
      if (f.text && !String(val).toLowerCase().includes(f.text)) return false;
      if (f.from !== undefined && Number(val) < f.from) return false;
      if (f.to   !== undefined && Number(val) > f.to)   return false;
    }
    return true;
  });

  // Sort
  data.sort((a, b) => {
    const dir = lbSort.dir === 'asc' ? 1 : -1;
    if (lbSort.col === 'username') return a.username.localeCompare(b.username) * dir;
    return ((a[lbSort.col] ?? 0) - (b[lbSort.col] ?? 0)) * dir;
  });

  if (!data.length) {
    tbody.innerHTML = '<tr><td colspan="6" class="no-posts">Keine User gefunden.</td></tr>';
    updateColClearBtns('lb');
    return;
  }

  tbody.innerHTML = data.map(u => `
    <tr>
      <td class="rank">${goldRanks[u.username]}</td>
      <td><a href="#profile/${encodeURIComponent(u.username)}" class="author-link">${escapeHtml(u.username)}</a></td>
      <td class="col-num">${u.postCount}</td>
      <td class="col-likes">${u.likesReceived}</td>
      <td class="col-dislikes">${u.dislikesReceived}</td>
      <td class="col-gold">${u.gold}</td>
    </tr>
  `).join('');

  updateColClearBtns('lb');
}

// ── Profil ────────────────────────────────────────
async function loadProfile(username) {
  const uname = username.toLowerCase();
  const [profile, posts] = await Promise.all([
    api('GET', `/api/profile/${encodeURIComponent(uname)}`),
    api('GET', `/api/posts?author=${encodeURIComponent(uname)}`)
  ]);

  if (profile.error) {
    document.getElementById('profile-avatar').textContent   = '?';
    document.getElementById('profile-username').textContent = 'User nicht gefunden';
    document.getElementById('profile-joined').textContent   = '';
    ['stat-posts','stat-likes','stat-dislikes','stat-gold','stat-rank'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.textContent = '–';
    });
    document.getElementById('profile-posts-container').innerHTML = '';
    return;
  }

  document.getElementById('profile-avatar').textContent   = profile.username[0].toUpperCase();
  document.getElementById('profile-username').textContent = profile.username;
  document.getElementById('profile-joined').textContent   =
    `SEIT ${new Date(profile.createdAt).toLocaleDateString('de-DE')}`;
  updateProfileStats(profile);
  const ownProfile = uname === currentUser;
  renderPosts(posts, document.getElementById('profile-posts-container'), ownProfile);
}

async function deletePost(postId) {
  if (!confirm('Beitrag wirklich löschen?')) return;
  const result = await api('DELETE', `/api/posts/${postId}`);
  if (result.error) { alert(result.error); return; }
  const [posts, profile] = await Promise.all([
    api('GET', `/api/posts?author=${encodeURIComponent(currentUser)}`),
    api('GET', `/api/profile/${encodeURIComponent(currentUser)}`)
  ]);
  renderPosts(posts, document.getElementById('profile-posts-container'), true);
  updateProfileStats(profile);
}

function updateProfileStats(profile) {
  document.getElementById('stat-posts').textContent    = profile.postCount        ?? '–';
  document.getElementById('stat-likes').textContent    = profile.likesReceived    ?? '–';
  document.getElementById('stat-dislikes').textContent = profile.dislikesReceived ?? '–';
  document.getElementById('stat-gold').textContent     = profile.gold             ?? '–';
  const rankEl = document.getElementById('stat-rank');
  if (rankEl) rankEl.textContent = profile.rank != null ? `#${profile.rank}` : '–';
}

// ── Posts rendern ─────────────────────────────────
function renderPosts(posts, container, showDelete = false) {
  if (!Array.isArray(posts) || posts.length === 0) {
    container.innerHTML = '<p class="no-posts">Noch keine Beiträge vorhanden.</p>';
    return;
  }

  container.innerHTML = posts.map(p => {
    const date      = new Date(p.created_at || p.createdAt).toLocaleString('de-DE');
    const voters    = Array.isArray(p.voters) ? p.voters : [];
    const isOwn     = p.author === currentUser;

    const voteBtns  = isOwn
      ? `<span class="own-post-note">Eigene Posts können nicht bewertet werden</span>`
      : `<button class="vote-btn ${p.userVote === 'up' ? 'active-up' : ''}"
                 data-post-id="${p.id}" data-direction="up" data-user-vote="${p.userVote || ''}"
                 onclick="vote(this)">&#128077; ${p.upvotes}</button>
         <button class="vote-btn ${p.userVote === 'down' ? 'active-down' : ''}"
                 data-post-id="${p.id}" data-direction="down" data-user-vote="${p.userVote || ''}"
                 onclick="vote(this)">&#128078; ${p.downvotes}</button>`;

    const deleteBtn = showDelete
      ? `<button class="delete-btn" onclick="deletePost('${p.id}')" title="Beitrag löschen">&#128465;</button>`
      : '';

    const voterHtml = voters.length
      ? voters.map(v => `
          <a href="#profile/${encodeURIComponent(v.username)}" class="voter-chip ${v.vote}">
            ${v.vote === 'up' ? '&#128077;' : '&#128078;'} ${escapeHtml(v.username)}
          </a>`).join('')
      : '';

    return `
      <div class="post">
        <div class="post-header">
          <h4>${escapeHtml(p.title)}</h4>
          <span class="post-meta">
            <a href="#profile/${encodeURIComponent(p.author)}" class="author-link">${escapeHtml(p.author)}</a>
            &middot; ${date}
            ${deleteBtn}
          </span>
        </div>
        <p class="post-body">${escapeHtml(p.body)}</p>
        <div class="votes-area">
          <div class="post-votes">${voteBtns}</div>
          ${voterHtml ? `<div class="voter-list">${voterHtml}</div>` : ''}
        </div>
      </div>`;
  }).join('');
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ── Suche ─────────────────────────────────────────
function handleSearch(e) {
  if (e.key !== 'Enter') return;
  const val = document.getElementById('search-input').value.trim().toLowerCase();
  if (!val) return;
  document.getElementById('search-input').value = '';
  window.location.hash = `#profile/${encodeURIComponent(val)}`;
}

// ── Router ────────────────────────────────────────
function handleRoute() {
  const hash = window.location.hash || '#board';
  document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
  stopBoardRefresh();
  closeColFilter();

  if (hash === '#board' || hash === '#' || hash === '') {
    document.querySelector('[href="#board"]').classList.add('active');
    showView('board');
    loadBoardPosts();
    startBoardRefresh();
  } else if (hash === '#leaderboard') {
    document.querySelector('[href="#leaderboard"]').classList.add('active');
    showView('leaderboard');
    loadLeaderboard();
  } else if (hash.startsWith('#profile')) {
    document.querySelector('[href="#profile"]').classList.add('active');
    showView('profile');
    const parts    = hash.split('/');
    const username = parts[1] ? decodeURIComponent(parts[1]) : currentUser;
    loadProfile(username);
  }
}

function showView(name) {
  document.querySelectorAll('.view').forEach(v => v.classList.add('hidden'));
  document.getElementById(`view-${name}`).classList.remove('hidden');
}

window.addEventListener('hashchange', handleRoute);

document.addEventListener('click', e => {
  const dropdown = document.getElementById('lb-col-filter');
  if (dropdown && !dropdown.classList.contains('hidden') &&
      !dropdown.contains(e.target) &&
      !e.target.classList.contains('col-filter-btn') &&
      !e.target.classList.contains('col-clear-btn')) {
    closeColFilter();
  }
});

// ── Init ─────────────────────────────────────────
(async () => {
  const data = await api('GET', '/api/me');
  if (data.user) { currentUser = data.user; showApp(data.user); }
})();
