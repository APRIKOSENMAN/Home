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

// Spin log state
let slData    = [];
let slSort    = { col: 'spunAt', dir: 'desc' };
let slFilters = {};

// Shared filter dropdown state
let activeFilterCol   = null;
let activeFilterTable = null; // 'lb' | 'pt' | 'sl'

// Post modal state
let postedSeeds   = new Set();
let lastPostTime  = 0;
let modalSeedData = null;

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
  const el = document.getElementById('nav-username');
  if (el) el.textContent = username.toUpperCase();
  document.getElementById('auth-section').classList.add('hidden');
  document.getElementById('app-section').classList.remove('hidden');
  if (!window.location.hash || window.location.hash === '#') {
    window.location.hash = '#board';
  } else {
    handleRoute();
  }
}

function toggleUserMenu() {
  document.getElementById('sub-header').classList.toggle('hidden');
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

  const filters = table === 'lb' ? lbFilters : table === 'sl' ? slFilters : ptFilters;
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

  const filters = table === 'lb' ? lbFilters : table === 'sl' ? slFilters : ptFilters;

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
  else if (table === 'sl') renderWheelLog();
  else                renderPostsTable();
}

function clearColFilter() {
  const col   = document.getElementById('lb-col-filter').dataset.col;
  const table = document.getElementById('lb-col-filter').dataset.table || 'lb';
  const filters = table === 'lb' ? lbFilters : table === 'sl' ? slFilters : ptFilters;
  if (col) delete filters[col];
  document.getElementById('lbf-text').value = '';
  document.getElementById('lbf-from').value = '';
  document.getElementById('lbf-to').value   = '';
  closeColFilter();
  updateColClearBtns(table);
  if (table === 'lb') renderLeaderboard();
  else if (table === 'sl') renderWheelLog();
  else                renderPostsTable();
}

function clearOneColFilter(col, table) {
  if (!table) table = 'lb';
  const filters = table === 'lb' ? lbFilters : table === 'sl' ? slFilters : ptFilters;
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
  if (table === 'lb') renderLeaderboard();
  else if (table === 'sl') renderWheelLog();
  else                renderPostsTable();
}

function updateColClearBtns(table) {
  const filters = table === 'lb' ? lbFilters : table === 'sl' ? slFilters : ptFilters;
  const sort    = table === 'lb' ? lbSort    : table === 'sl' ? slSort    : ptSort;
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
      <td class="col-num">${u.spinCount}</td>
      <td class="col-gold">${u.bestReward > 0 ? '+' + u.bestReward : '–'}</td>
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
  const spinsEl = document.getElementById('stat-spins');
  if (spinsEl) spinsEl.textContent = profile.spinCount ?? '–';
  const bestEl = document.getElementById('stat-best');
  if (bestEl) bestEl.textContent = profile.bestReward != null ? `+${profile.bestReward}` : '–';
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
  document.getElementById('sub-header')?.classList.add('hidden');

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
  } else if (hash === '#wheel') {
    document.querySelector('[href="#wheel"]').classList.add('active');
    showView('wheel');
    loadWheel();
  } else if (hash === '#factory') {
    document.querySelector('[href="#factory"]').classList.add('active');
    showView('factory');
    loadFactory();
  } else if (hash === '#daily') {
    document.querySelector('[href="#daily"]').classList.add('active');
    showView('daily');
    loadDaily();
  }
  closeBuildingPanel();
  if (dailyTimerInterval) { clearInterval(dailyTimerInterval); dailyTimerInterval = null; }
}

function showView(name) {
  document.querySelectorAll('.view').forEach(v => v.classList.add('hidden'));
  document.getElementById(`view-${name}`).classList.remove('hidden');
}

window.addEventListener('hashchange', handleRoute);

document.addEventListener('click', e => {
  // Close filter dropdown
  const dropdown = document.getElementById('lb-col-filter');
  if (dropdown && !dropdown.classList.contains('hidden') &&
      !dropdown.contains(e.target) &&
      !e.target.classList.contains('col-filter-btn') &&
      !e.target.classList.contains('col-clear-btn')) {
    closeColFilter();
  }
  // Close sub-header when clicking outside header area
  const sub = document.getElementById('sub-header');
  if (sub && !sub.classList.contains('hidden')) {
    const hdr = document.querySelector('header');
    if (hdr && !hdr.contains(e.target) && !sub.contains(e.target)) {
      sub.classList.add('hidden');
    }
  }
  // Close modal on overlay click
  if (e.target.id === 'post-modal') closePostModal();
});

document.addEventListener('keydown', e => {
  if (e.code === 'Escape') { closePostModal(); return; }
  if (e.code !== 'Space') return;
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
  e.preventDefault();
  if (wheelRaf !== null) { speedUpSpin(); return; }
  const focused = document.activeElement;
  if (focused && focused.closest && focused.closest('#wheel-btn-row')) focused.click();
});

// ── Audio ─────────────────────────────────────────
let audioCtx   = null;
let masterGain = null;

function initAudio() {
  if (audioCtx) return;
  audioCtx   = new (window.AudioContext || window.webkitAudioContext)();
  masterGain = audioCtx.createGain();
  masterGain.gain.value = parseFloat(document.getElementById('vol-slider')?.value ?? 0.5);
  masterGain.connect(audioCtx.destination);
}

function setVolume(v) {
  if (masterGain) masterGain.gain.value = parseFloat(v);
}

function _tone(freq, type, dur, vol) {
  if (!audioCtx) return;
  const osc = audioCtx.createOscillator();
  const g   = audioCtx.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  g.gain.setValueAtTime(vol, audioCtx.currentTime);
  g.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + dur);
  osc.connect(g);
  g.connect(masterGain);
  osc.start();
  osc.stop(audioCtx.currentTime + dur);
}

function playClick() { _tone(880, 'square', 0.07, 0.3); }
function playTick()  { _tone(1200, 'square', 0.025, 0.15); }

function playWinSound(reward) {
  if (!audioCtx) return;
  if (reward === 0) {
    _tone(200, 'sawtooth', 0.4, 0.25);
    setTimeout(() => _tone(160, 'sawtooth', 0.4, 0.25), 200);
  } else if (reward <= 15) {
    _tone(523, 'sine', 0.2, 0.3);
    setTimeout(() => _tone(659, 'sine', 0.2, 0.3), 120);
  } else if (reward <= 40) {
    _tone(523, 'sine', 0.15, 0.3);
    setTimeout(() => _tone(659, 'sine', 0.15, 0.3), 100);
    setTimeout(() => _tone(784, 'sine', 0.25, 0.35), 200);
  } else if (reward <= 75) {
    [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => _tone(f, 'sine', 0.2, 0.3), i * 80));
  } else {
    [523, 659, 784, 1047, 1319].forEach((f, i) => setTimeout(() => _tone(f, 'triangle', 0.25, 0.4), i * 70));
  }
}

// ── Wheel ─────────────────────────────────────────
let wheelSegs     = null;
let wheelRot      = 0;
let wheelRaf      = null;
let wheelFastFrom = null;

// Seeded PRNG — must stay in sync with server wheelSegments()
function mulberry32(seed) {
  seed = seed >>> 0;
  return function() {
    seed = (seed + 0x6D2B79F5) >>> 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const CAT_COLORS = ['#9e9e9e', '#64b5f6', '#9c27b0', '#ef5350', '#ffd700'];

function buildWheelV1(seedStr) {
  const rng = mulberry32(parseInt(seedStr, 10));
  const n   = Math.floor(rng() * 7) + 2;   // 2-8 segments
  const w   = Array.from({length: n}, () => 0.15 + rng() * 0.85);
  const tot = w.reduce((a, b) => a + b, 0);
  const p   = w.map(x => x / tot);
  const rawData = Array.from({length: n}, () => {
    const r = rng();
    if (r < 0.30) return { raw: 0,                  cat: 0 };
    if (r < 0.62) return { raw: rng() * 90 + 5,     cat: 1 };
    if (r < 0.84) return { raw: rng() * 280 + 60,   cat: 2 };
    if (r < 0.95) return { raw: rng() * 450 + 220,   cat: 3 };
    return               { raw: rng() * 2000 + 2000, cat: 4 };
  });
  const raw   = rawData.map(d => d.raw);
  const ev    = p.reduce((s, pi, i) => s + pi * raw[i], 0);
  const scale = ev > 0 ? 11 / ev : 1;
  const rwd   = raw.map(r => Math.min(200, Math.max(0, Math.round(r * scale))));
  return p.map((prob, i) => ({ prob, reward: rwd[i], color: CAT_COLORS[rawData[i].cat] }));
}

function wheelCurrentSeg(rot) {
  if (!wheelSegs) return 0;
  let angle = ((-rot) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2);
  let cum = 0;
  for (let i = 0; i < wheelSegs.length; i++) {
    cum += wheelSegs[i].prob * Math.PI * 2;
    if (angle < cum) return i;
  }
  return wheelSegs.length - 1;
}

function drawWheel() {
  const canvas = document.getElementById('wheel-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const S   = canvas.width;
  const cx  = S / 2, cy = S / 2;
  const R   = S / 2 - 26;

  ctx.clearRect(0, 0, S, S);

  ctx.beginPath();
  ctx.arc(cx, cy, R + 10, 0, Math.PI * 2);
  ctx.fillStyle = '#162032';
  ctx.fill();

  if (!wheelSegs) return;

  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(wheelRot);

  let a = -Math.PI / 2;
  wheelSegs.forEach(seg => {
    const arc = seg.prob * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.arc(0, 0, R, a, a + arc);
    ctx.closePath();
    ctx.fillStyle = seg.color;
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.45)';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    ctx.save();
    ctx.rotate(a + arc / 2);
    const fs = Math.max(13, Math.min(26, arc * R / 9));
    ctx.font = `bold ${fs | 0}px Segoe UI,sans-serif`;
    ctx.fillStyle = '#fff';
    ctx.shadowColor = 'rgba(0,0,0,.7)';
    ctx.shadowBlur  = 4;
    ctx.textAlign   = 'right';
    ctx.fillText(seg.reward === 0 ? '0' : `${seg.reward}`, R - 10, (fs | 0) / 3);
    ctx.restore();

    a += arc;
  });

  ctx.beginPath();
  ctx.arc(0, 0, 20, 0, Math.PI * 2);
  ctx.fillStyle = '#0d1a28';
  ctx.fill();
  ctx.strokeStyle = '#c8d8e8';
  ctx.lineWidth = 3;
  ctx.stroke();

  ctx.restore();

  ctx.beginPath();
  ctx.moveTo(cx - 15, cy - R - 4);
  ctx.lineTo(cx + 15, cy - R - 4);
  ctx.lineTo(cx, cy - R + 22);
  ctx.closePath();
  ctx.fillStyle = '#e53935';
  ctx.fill();
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 2;
  ctx.stroke();
}

function wheelTargetRot(segIdx) {
  let cum = 0;
  for (let i = 0; i < segIdx; i++) cum += wheelSegs[i].prob * Math.PI * 2;
  const arc    = wheelSegs[segIdx].prob * Math.PI * 2;
  const margin = arc * 0.12;
  const land   = cum + margin + Math.random() * (arc - 2 * margin);
  const base   = -land;
  const extra  = Math.ceil((wheelRot + Math.PI * 2 * 6 - base) / (Math.PI * 2));
  return base + extra * Math.PI * 2;
}

function speedUpSpin() {
  if (wheelRaf && wheelFastFrom === null) wheelFastFrom = performance.now();
}

function animateSpin(segIdx, onDone) {
  if (wheelRaf) cancelAnimationFrame(wheelRaf);
  wheelFastFrom = null;
  const target = wheelTargetRot(segIdx);
  const start  = wheelRot;
  const t0     = performance.now();
  const dur    = 4500 + Math.random() * 2500;
  function ease(p) { return 1 - Math.pow(1 - p, 6); }
  let lastSeg = wheelCurrentSeg(wheelRot);
  function frame(now) {
    let elapsed = now - t0;
    if (wheelFastFrom !== null) elapsed = (wheelFastFrom - t0) + (now - wheelFastFrom) * 2;
    const t = Math.min(elapsed / dur, 1);
    wheelRot = start + (target - start) * ease(t);
    const curSeg = wheelCurrentSeg(wheelRot);
    if (curSeg !== lastSeg) { lastSeg = curSeg; playTick(); }
    drawWheel();
    if (t >= 1 || t > 0.82) { wheelRot = target; drawWheel(); wheelRaf = null; onDone(); }
    else                     { wheelRaf = requestAnimationFrame(frame); }
  }
  wheelRaf = requestAnimationFrame(frame);
}

async function loadWheel() {
  const data = await api('GET', '/api/wheel');
  document.getElementById('wheel-gold').textContent = `${data.gold} 💰`;
  if (data.seed) {
    wheelSegs = buildWheelV1(data.seed);
    drawWheel();
    document.getElementById('wheel-seed-row').textContent = `SEED v${data.version} · ${data.seed}`;
    renderWheelButtons(true);
  } else {
    wheelSegs = null;
    drawWheel();
    document.getElementById('wheel-seed-row').textContent = '';
    renderWheelButtons(false);
  }
  document.getElementById('wheel-result').classList.add('hidden');
  document.getElementById('wheel-error').textContent = '';
  loadWheelLog();
}

function renderWheelButtons(hasSeed) {
  const row = document.getElementById('wheel-btn-row');
  if (hasSeed) {
    row.innerHTML = `
      <button id="wbtn-spin" onclick="wheelSpin()">&#9654; SPIN <span class="wheel-cost">5 &#128176;</span></button>
      <span class="wheel-or">OR</span>
      <button id="wbtn-regen" class="btn-secondary" onclick="wheelGenerate()">&#8635; REGENERATE <span class="wheel-cost">5 &#128176;</span></button>`;
    setTimeout(() => document.getElementById('wbtn-spin')?.focus(), 50);
  } else {
    row.innerHTML = `
      <button id="wbtn-gen" onclick="wheelGenerate()">&#9889; GENERATE <span class="wheel-cost">5 &#128176;</span></button>`;
    setTimeout(() => document.getElementById('wbtn-gen')?.focus(), 50);
  }
}

function setWheelBtnsDisabled(on) {
  document.querySelectorAll('#wheel-btn-row button').forEach(b => b.disabled = on);
}

async function wheelGenerate() {
  initAudio();
  playClick();
  setWheelBtnsDisabled(true);
  document.getElementById('wheel-error').textContent = '';
  const data = await api('POST', '/api/wheel/generate');
  if (data.error) {
    document.getElementById('wheel-error').textContent = data.error;
    setWheelBtnsDisabled(false);
    return;
  }
  wheelSegs = buildWheelV1(data.seed);
  wheelRot  = 0;
  drawWheel();
  document.getElementById('wheel-gold').textContent  = `${data.gold} 💰`;
  document.getElementById('wheel-seed-row').textContent = `SEED v${data.version} · ${data.seed}`;
  document.getElementById('wheel-result').classList.add('hidden');
  renderWheelButtons(true);
}

async function wheelSpin() {
  if (!wheelSegs) return;
  initAudio();
  playClick();
  setWheelBtnsDisabled(true);
  document.getElementById('wheel-result').classList.add('hidden');
  document.getElementById('wheel-error').textContent = '';

  const data = await api('POST', '/api/wheel/spin');
  if (data.error) {
    document.getElementById('wheel-error').textContent = data.error;
    setWheelBtnsDisabled(false);
    return;
  }

  animateSpin(data.segmentIndex, () => {
    playWinSound(data.reward);
    const el = document.getElementById('wheel-result');
    el.classList.remove('hidden', 'zero');
    if (data.reward === 0) {
      el.textContent = '— 0 GOLD —';
      el.classList.add('zero');
    } else {
      el.textContent = `+ ${data.reward} GOLD`;
    }
    document.getElementById('wheel-gold').textContent = `${data.gold} 💰`;
    wheelSegs = null;
    document.getElementById('wheel-seed-row').textContent = '';
    renderWheelButtons(false);
    setWheelBtnsDisabled(false);
    loadWheelLog();
  });
}

// ── Wheel Log ─────────────────────────────────────
async function loadWheelLog() {
  const entries = await api('GET', '/api/wheel/log');
  slData = entries;
  renderWheelLog();
}

function sortSpinLog(col) {
  if (slSort.col === col) {
    slSort.dir = slSort.dir === 'desc' ? 'asc' : 'desc';
  } else {
    slSort.col = col;
    slSort.dir = col === 'seed' ? 'asc' : 'desc';
  }
  renderWheelLog();
}

function renderWheelLog(entries) {
  if (Array.isArray(entries)) slData = entries;
  const container = document.getElementById('wheel-log-container');
  if (!container) return;
  if (!slData.length) { container.innerHTML = ''; return; }

  // Sort icons
  const sortIconHtml = col =>
    `<span class="sort-icon" data-col="${col}" data-table="sl"></span>`;

  // Filter + sort data
  let data = [...slData].filter(e => {
    for (const [col, f] of Object.entries(slFilters)) {
      let val;
      if (col === 'spunAt') val = new Date(e.spunAt).toLocaleString('de-DE');
      else val = e[col];
      if (f.text && !String(val ?? '').toLowerCase().includes(f.text)) return false;
      if (f.from !== undefined && Number(val) < f.from) return false;
      if (f.to   !== undefined && Number(val) > f.to)   return false;
    }
    return true;
  });
  data.sort((a, b) => {
    const dir = slSort.dir === 'asc' ? 1 : -1;
    if (slSort.col === 'spunAt') return (new Date(a.spunAt) - new Date(b.spunAt)) * dir;
    if (slSort.col === 'seed')   return String(a.seed).localeCompare(String(b.seed)) * dir;
    return ((a[slSort.col] ?? 0) - (b[slSort.col] ?? 0)) * dir;
  });

  container.innerHTML = `
    <div class="panel-label">SPIN VERLAUF</div>
    <div class="panel" style="margin-top:130px">
      <table class="spin-log-table">
        <thead><tr>
          <th><div class="th-inner">
            <span class="sortable" onclick="sortSpinLog('spunAt')">DATUM ${sortIconHtml('spunAt')}</span>
            <button class="col-filter-btn" onclick="openColFilter('spunAt',this,false,'sl')">&#128269;</button>
            <button class="col-clear-btn hidden" data-col="spunAt" data-table="sl" onclick="clearOneColFilter('spunAt','sl')">&#10005;</button>
          </div></th>
          <th><div class="th-inner">
            <span class="sortable" onclick="sortSpinLog('seed')">SEED ${sortIconHtml('seed')}</span>
            <button class="col-filter-btn" onclick="openColFilter('seed',this,false,'sl')">&#128269;</button>
            <button class="col-clear-btn hidden" data-col="seed" data-table="sl" onclick="clearOneColFilter('seed','sl')">&#10005;</button>
          </div></th>
          <th><div class="th-inner">
            <span class="sortable" onclick="sortSpinLog('reward')">REWARD ${sortIconHtml('reward')}</span>
            <button class="col-filter-btn" onclick="openColFilter('reward',this,true,'sl')">&#128269;</button>
            <button class="col-clear-btn hidden" data-col="reward" data-table="sl" onclick="clearOneColFilter('reward','sl')">&#10005;</button>
          </div></th>
          <th></th>
        </tr></thead>
        <tbody>${data.map(e => {
          const date    = new Date(e.spunAt).toLocaleString('de-DE');
          const cls     = e.reward === 0 ? 'log-zero' : e.reward >= 120 ? 'log-jackpot' : '';
          const posted  = postedSeeds.has(e.seed);
          return `<tr>
            <td class="col-num">${date}</td>
            <td class="log-seed" data-seed="${e.seed}" data-seg="${e.segmentIdx}"
                onmouseenter="showWheelPreview(this,event)" onmouseleave="hideWheelPreview()">${e.seed}</td>
            <td class="col-num ${cls}">${e.reward === 0 ? '— 0' : '+' + e.reward} &#127922;</td>
            <td><button class="spin-post-btn" ${posted ? 'disabled' : ''}
                onclick="openPostModal('${e.seed}',${e.segmentIdx},${e.reward})">
              ${posted ? '&#10003; Gepostet' : '&#128203; Posten'}</button></td>
          </tr>`;
        }).join('')}</tbody>
      </table>
    </div>`;

  // Apply sort icons now that elements exist
  document.querySelectorAll('.sort-icon[data-table="sl"]').forEach(el => {
    el.className = 'sort-icon' + (el.dataset.col === slSort.col ? ` ${slSort.dir}` : '');
  });
  updateColClearBtns('sl');
}

function openPostModal(seed, segIdx, reward) {
  if (postedSeeds.has(seed)) return;
  modalSeedData = { seed, segIdx, reward };

  const titleEl = document.getElementById('modal-title');
  const bodyEl  = document.getElementById('modal-body-text');
  titleEl.value = reward === 0 ? 'Wheel Spin: 0 Gold' : `Wheel Spin: +${reward} Gold`;
  bodyEl.value  = `Wheel of Fortune Ergebnis:\n\n\u{1F4B0} Reward: ${reward === 0 ? '— 0 Gold' : '+' + reward + ' Gold'}\n\u{1F331} Seed: ${seed}`;
  updateCharCount(titleEl);
  updateCharCount(bodyEl);
  document.getElementById('modal-error').textContent = '';

  const canvas = document.getElementById('modal-wheel-canvas');
  drawMiniWheel(canvas, buildWheelV1(seed), segIdx);

  document.getElementById('post-modal').classList.remove('hidden');
  titleEl.focus();
}

function closePostModal() {
  document.getElementById('post-modal').classList.add('hidden');
  modalSeedData = null;
}

async function submitPostModal() {
  if (!modalSeedData) return;
  const { seed, reward } = modalSeedData;

  if (postedSeeds.has(seed)) {
    document.getElementById('modal-error').textContent = 'Dieser Spin wurde bereits gepostet.';
    return;
  }
  const now = Date.now();
  const wait = Math.ceil((60000 - (now - lastPostTime)) / 1000);
  if (lastPostTime > 0 && wait > 0) {
    document.getElementById('modal-error').textContent = `Bitte noch ${wait}s warten (1-Minuten-Cooldown).`;
    return;
  }

  const title = document.getElementById('modal-title').value.trim();
  const body  = document.getElementById('modal-body-text').value.trim();
  if (!title || !body) {
    document.getElementById('modal-error').textContent = 'Titel und Inhalt erforderlich.';
    return;
  }

  const data = await api('POST', '/api/posts', { title, body });
  if (data.error) { document.getElementById('modal-error').textContent = data.error; return; }

  lastPostTime = Date.now();
  postedSeeds.add(seed);
  closePostModal();
  renderWheelLog();
}

function showWheelPreview(el, event) {
  const preview = document.getElementById('wheel-preview');
  const canvas  = document.getElementById('preview-canvas');
  const segs    = buildWheelV1(el.dataset.seed);
  const winIdx  = parseInt(el.dataset.seg);
  drawMiniWheel(canvas, segs, winIdx);

  const rect = el.getBoundingClientRect();
  let left = rect.right + 10;
  if (left + 148 > window.innerWidth) left = rect.left - 158;
  preview.style.left = left + 'px';
  preview.style.top  = Math.max(4, rect.top - 60) + 'px';
  preview.classList.remove('hidden');
}

function hideWheelPreview() {
  document.getElementById('wheel-preview').classList.add('hidden');
}

function drawMiniWheel(canvas, segs, winIdx) {
  const ctx = canvas.getContext('2d');
  const S   = canvas.width;
  const cx  = S / 2, cy = S / 2;
  const R   = S / 2 - 8;

  // Rotate so winning segment faces pointer
  let cum = 0;
  for (let i = 0; i < winIdx; i++) cum += segs[i].prob * Math.PI * 2;
  const rot = -(cum + segs[winIdx].prob * Math.PI);

  ctx.clearRect(0, 0, S, S);
  ctx.beginPath();
  ctx.arc(cx, cy, R + 4, 0, Math.PI * 2);
  ctx.fillStyle = '#162032';
  ctx.fill();

  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(rot);

  let a = -Math.PI / 2;
  segs.forEach((seg, i) => {
    const arc = seg.prob * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.arc(0, 0, R, a, a + arc);
    ctx.closePath();
    ctx.fillStyle = seg.color;
    ctx.fill();
    ctx.strokeStyle = i === winIdx ? '#fff' : 'rgba(255,255,255,0.35)';
    ctx.lineWidth   = i === winIdx ? 2 : 1;
    ctx.stroke();

    ctx.save();
    ctx.rotate(a + arc / 2);
    const fs = Math.max(7, Math.min(12, arc * R / 9));
    ctx.font = `bold ${fs | 0}px Segoe UI,sans-serif`;
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'right';
    ctx.fillText(seg.reward === 0 ? '0' : `${seg.reward}`, R - 4, (fs | 0) / 3);
    ctx.restore();

    a += arc;
  });

  ctx.beginPath();
  ctx.arc(0, 0, 6, 0, Math.PI * 2);
  ctx.fillStyle = '#0d1a28';
  ctx.fill();
  ctx.restore();

  ctx.beginPath();
  ctx.moveTo(cx - 6, cy - R - 2);
  ctx.lineTo(cx + 6, cy - R - 2);
  ctx.lineTo(cx, cy - R + 9);
  ctx.closePath();
  ctx.fillStyle = '#e53935';
  ctx.fill();
}

// ── Daily ─────────────────────────────────────────
let dailyTimerInterval = null;

async function loadDaily() {
  const data = await api('GET', '/api/daily');
  renderDaily(data);
}

function renderDaily(data) {
  const btn   = document.getElementById('daily-claim-btn');
  const timer = document.getElementById('daily-timer');
  const err   = document.getElementById('daily-error');
  if (err) err.textContent = '';
  if (data.claimable) {
    btn.disabled = false;
    btn.textContent = '&#127873; 100 GOLD EINSAMMELN';
    if (timer) timer.textContent = '';
  } else {
    btn.disabled = true;
    btn.textContent = '&#8987; NOCH NICHT VERFÜGBAR';
    if (dailyTimerInterval) clearInterval(dailyTimerInterval);
    let remaining = data.secondsUntilNext;
    function tick() {
      if (!document.getElementById('daily-timer')) { clearInterval(dailyTimerInterval); return; }
      if (remaining <= 0) {
        clearInterval(dailyTimerInterval);
        btn.disabled = false;
        btn.textContent = '&#127873; 100 GOLD EINSAMMELN';
        timer.textContent = '';
        return;
      }
      const h = Math.floor(remaining / 3600);
      const m = Math.floor((remaining % 3600) / 60);
      const s = remaining % 60;
      timer.textContent = `Nächste Einsammlung in ${h}h ${String(m).padStart(2,'0')}m ${String(s).padStart(2,'0')}s`;
      remaining--;
    }
    tick();
    dailyTimerInterval = setInterval(tick, 1000);
  }
}

async function claimDaily() {
  const btn = document.getElementById('daily-claim-btn');
  const err = document.getElementById('daily-error');
  btn.disabled = true;
  const data = await api('POST', '/api/daily/claim');
  if (data.error) { err.textContent = data.error; btn.disabled = false; return; }
  err.textContent = '';
  const timer = document.getElementById('daily-timer');
  if (timer) timer.textContent = `+100 Gold eingesammelt! Guthaben: ${data.gold} 💰`;
  btn.textContent = '&#10003; Eingesammelt!';
  setTimeout(loadDaily, 2000);
}

// ── Factory ───────────────────────────────────────
const BUILDING_DEFS = {
  goldbarren_giesserei: { name: 'Goldbarrengießerei', width: 2, height: 3, color: '#b8860b', border: '#8b6914', icon: '🏭' }
};
const RECIPE_DEFS = {
  goldbarren_giesserei: { inputLabel: '10 💰 Gold', durationMs: 10 * 60 * 1000, outputLabel: '1 🥇 Goldbarren' }
};
const ITEM_DEFS = { goldbarren: { name: 'Goldbarren', icon: '🥇' } };
const CELL = 24;

let factoryData        = null;
let dragBuildingType   = null;
let activeBuildingId   = null;
let buildingPollTimer  = null;

async function loadFactory() {
  factoryData = await api('GET', '/api/factory');
  renderFactory();
}

function renderFactory() {
  renderStoragePanel();
  renderCityGrid();
}

function renderStoragePanel() {
  const bEl = document.getElementById('storage-buildings');
  const iEl = document.getElementById('storage-items');
  if (bEl) {
    bEl.innerHTML = factoryData.unplaced.length
      ? factoryData.unplaced.map(b => {
          const d = BUILDING_DEFS[b.type]; if (!d) return '';
          return `<div class="storage-building" draggable="true" ondragstart="startBuildingDrag(event,'${b.type}')">
            <span class="sb-icon">${d.icon}</span>
            <span class="sb-info"><b>${d.name}</b><br><small>${d.width}×${d.height} Felder</small></span>
            <span class="sb-qty">×${b.quantity}</span>
          </div>`;
        }).join('')
      : '<p class="no-posts" style="padding:.6rem">Keine Gebäude</p>';
  }
  if (iEl) {
    iEl.innerHTML = factoryData.items.length
      ? factoryData.items.map(it => {
          const d = ITEM_DEFS[it.itemType] || { name: it.itemType, icon: '📦' };
          return `<div class="storage-item-row"><span>${d.icon} ${d.name}</span><span class="col-gold">×${it.quantity}</span></div>`;
        }).join('')
      : '<p class="no-posts" style="padding:.4rem .8rem;font-size:.75rem">Leer</p>';
  }
}

function renderCityGrid() {
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
    const d = BUILDING_DEFS[b.type]; if (!d) return;
    const el = document.createElement('div');
    el.className = 'placed-building';
    Object.assign(el.style, {
      left: b.x * CELL + 'px', top: b.y * CELL + 'px',
      width: d.width * CELL + 'px', height: d.height * CELL + 'px',
      background: d.color, borderColor: d.border
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

function startBuildingDrag(e, type) {
  dragBuildingType = type;
  e.dataTransfer.effectAllowed = 'move';
}

function highlightDrop(x, y) {
  clearDropHighlight();
  if (!dragBuildingType) return;
  const d = BUILDING_DEFS[dragBuildingType];
  for (let dy = 0; dy < d.height; dy++)
    for (let dx = 0; dx < d.width; dx++) {
      const c = document.querySelector(`.city-cell[data-x="${x+dx}"][data-y="${y+dy}"]`);
      if (c) c.classList.add('drop-highlight');
    }
}

function clearDropHighlight() {
  document.querySelectorAll('.city-cell.drop-highlight').forEach(c => c.classList.remove('drop-highlight'));
}

async function dropBuilding(x, y) {
  clearDropHighlight();
  if (!dragBuildingType) return;
  const type = dragBuildingType;
  dragBuildingType = null;
  const res = await api('POST', '/api/factory/place', { type, x, y });
  if (res.error) return;
  factoryData = await api('GET', '/api/factory');
  renderFactory();
}

async function openBuildingPanel(id) {
  activeBuildingId = id;
  const data = await api('GET', `/api/factory/building/${id}`);
  if (data.error) return;
  const d  = BUILDING_DEFS[data.type];
  const rc = RECIPE_DEFS[data.type];
  let jobHtml = '';
  if (!data.job) {
    jobHtml = `<div class="recipe-row">
        <div class="recipe-slot">📥 ${rc.inputLabel}</div>
        <div class="recipe-arrow">→ 10 min →</div>
        <div class="recipe-slot">📤 ${rc.outputLabel}</div></div>
      <div class="bp-actions">
        <small class="bp-gold">Gold: ${data.gold} 💰</small>
        <button onclick="startRecipe(${id})">&#9654; STARTEN (−10 Gold)</button>
      </div>`;
  } else if (data.job.completed) {
    jobHtml = `<div class="recipe-row">
        <div class="recipe-slot done">✓ ${rc.inputLabel}</div>
        <div class="recipe-arrow">→</div>
        <div class="recipe-slot ready">✅ ${rc.outputLabel}</div></div>
      <div class="bp-actions"><button onclick="collectOutput(${id})">&#128230; EINSAMMELN</button></div>`;
  } else {
    const pct = Math.round(data.job.progress * 100);
    const rem = Math.round(data.job.remainingMs / 1000);
    const ts  = rem >= 60 ? `${Math.floor(rem/60)}m ${rem%60}s` : `${rem}s`;
    jobHtml = `<div class="recipe-row">
        <div class="recipe-slot done">✓ ${rc.inputLabel}</div>
        <div class="recipe-arrow">→</div>
        <div class="recipe-slot">${rc.outputLabel}</div></div>
      <div class="bp-progress-wrap"><div class="bp-progress-bar" style="width:${pct}%"></div></div>
      <div class="bp-progress-label">${pct}% · noch ${ts}</div>
      <div class="bp-actions"><button disabled>&#8987; ${ts}</button></div>`;
  }
  document.getElementById('building-panel-content').innerHTML = `
    <div class="bp-title"><span>${d.icon} ${d.name}</span>
      <button class="bp-remove" onclick="removeBuilding(${id})" title="Abbauen">&#128465;</button></div>
    ${jobHtml}
    <p class="error" id="bp-error"></p>`;
  document.getElementById('building-panel').classList.remove('hidden');
  if (buildingPollTimer) clearInterval(buildingPollTimer);
  if (data.job && !data.job.completed)
    buildingPollTimer = setInterval(() => openBuildingPanel(id), 5000);
}

function closeBuildingPanel() {
  if (buildingPollTimer) { clearInterval(buildingPollTimer); buildingPollTimer = null; }
  activeBuildingId = null;
  document.getElementById('building-panel')?.classList.add('hidden');
}

async function startRecipe(id) {
  const res = await api('POST', `/api/factory/building/${id}/start`);
  const err = document.getElementById('bp-error');
  if (res.error) { err.textContent = res.error; return; }
  err.textContent = '';
  factoryData = await api('GET', '/api/factory');
  renderCityGrid();
  await openBuildingPanel(id);
}

async function collectOutput(id) {
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

async function removeBuilding(id) {
  if (!confirm('Gebäude abbauen und in Storage zurückstellen?')) return;
  const res = await api('DELETE', `/api/factory/building/${id}`);
  if (res.error) { document.getElementById('bp-error').textContent = res.error; return; }
  closeBuildingPanel();
  factoryData = await api('GET', '/api/factory');
  renderFactory();
}

// ── Init ─────────────────────────────────────────
(async () => {
  const data = await api('GET', '/api/me');
  if (data.user) { currentUser = data.user; showApp(data.user); }
})();
