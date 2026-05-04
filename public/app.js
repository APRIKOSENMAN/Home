let currentUser = null;
let refreshInterval = null;
let lastBoardSnapshot = null;

// ── API ──────────────────────────────────────────
async function api(method, url, body) {
  const res = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined
  });
  return res.json();
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
  const id = String(Math.floor(10000000 + Math.random() * 90000000));
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
    err: document.getElementById('reg-error')
  };
}

async function login() {
  const username = document.getElementById('login-user').value.trim().toLowerCase();
  const password = document.getElementById('login-pass').value;
  const err = document.getElementById('login-error');

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
  const title = document.getElementById('post-title').value.trim();
  const body  = document.getElementById('post-body').value.trim();
  if (!title || !body) return;

  const data = await api('POST', '/api/posts', { title, body });
  if (data.error) { alert(data.error); return; }

  document.getElementById('post-title').value = '';
  document.getElementById('post-body').value  = '';
  lastBoardSnapshot = null;
  loadBoardPosts();
}

async function loadBoardPosts() {
  const posts = await api('GET', '/api/posts');
  const snap = JSON.stringify(posts.map(p => ({ id: p._id, up: p.upvotes, down: p.downvotes, uv: p.userVote })));
  if (snap === lastBoardSnapshot) return;
  lastBoardSnapshot = snap;
  renderPosts(posts, document.getElementById('posts-container'));
}

function startBoardRefresh() {
  stopBoardRefresh();
  refreshInterval = setInterval(loadBoardPosts, 5000);
}

function stopBoardRefresh() {
  if (refreshInterval) { clearInterval(refreshInterval); refreshInterval = null; }
}

// ── Votes ─────────────────────────────────────────
async function vote(btn) {
  const postId    = btn.dataset.postId;
  const direction = btn.dataset.direction;
  const current   = btn.dataset.userVote;
  const newVote   = current === direction ? null : direction;

  await api('POST', `/api/posts/${postId}/vote`, { vote: newVote });
  lastBoardSnapshot = null;

  const hash = window.location.hash || '#board';
  if (hash === '#board' || hash === '#' || hash === '') {
    loadBoardPosts();
  } else if (hash.startsWith('#profile')) {
    const parts    = hash.split('/');
    const username = parts[1] ? decodeURIComponent(parts[1]) : currentUser;
    const posts    = await api('GET', `/api/posts?author=${encodeURIComponent(username)}`);
    renderPosts(posts, document.getElementById('profile-posts-container'));
    const profile  = await api('GET', `/api/profile/${encodeURIComponent(username)}`);
    updateProfileStats(profile);
  }
}

// ── Leaderboard ───────────────────────────────────
async function loadLeaderboard() {
  const data = await api('GET', '/api/leaderboard');
  const tbody = document.getElementById('leaderboard-body');

  if (!Array.isArray(data) || data.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" class="no-posts">Keine User vorhanden.</td></tr>';
    return;
  }

  tbody.innerHTML = data.map((u, i) => `
    <tr>
      <td class="rank">${i + 1}</td>
      <td><a href="#profile/${encodeURIComponent(u.username)}" class="author-link">${escapeHtml(u.username)}</a></td>
      <td class="col-num">${u.postCount}</td>
      <td class="col-likes">${u.likesReceived}</td>
      <td class="col-dislikes">${u.dislikesReceived}</td>
      <td class="col-gold">${u.gold}</td>
    </tr>
  `).join('');
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
    ['stat-posts','stat-likes','stat-dislikes','stat-gold'].forEach(id => document.getElementById(id).textContent = '–');
    document.getElementById('profile-posts-container').innerHTML = '';
    return;
  }

  document.getElementById('profile-avatar').textContent   = profile.username[0].toUpperCase();
  document.getElementById('profile-username').textContent = profile.username;
  document.getElementById('profile-joined').textContent   =
    `SEIT ${new Date(profile.createdAt).toLocaleDateString('de-DE')}`;
  updateProfileStats(profile);
  renderPosts(posts, document.getElementById('profile-posts-container'));
}

function updateProfileStats(profile) {
  document.getElementById('stat-posts').textContent    = profile.postCount    ?? '–';
  document.getElementById('stat-likes').textContent    = profile.likesReceived    ?? '–';
  document.getElementById('stat-dislikes').textContent = profile.dislikesReceived ?? '–';
  document.getElementById('stat-gold').textContent     = profile.gold             ?? '–';
}

// ── Posts rendern ─────────────────────────────────
function renderPosts(posts, container) {
  if (!Array.isArray(posts) || posts.length === 0) {
    container.innerHTML = '<p class="no-posts">Noch keine Beiträge vorhanden.</p>';
    return;
  }

  container.innerHTML = posts.map(p => {
    const date = new Date(p.createdAt).toLocaleString('de-DE');
    return `
      <div class="post">
        <div class="post-header">
          <h4>${escapeHtml(p.title)}</h4>
          <span class="post-meta">
            <a href="#profile/${encodeURIComponent(p.author)}" class="author-link">${escapeHtml(p.author)}</a>
            &middot; ${date}
          </span>
        </div>
        <p class="post-body">${escapeHtml(p.body)}</p>
        <div class="post-votes">
          <button class="vote-btn ${p.userVote === 'up' ? 'active-up' : ''}"
                  data-post-id="${p._id}" data-direction="up" data-user-vote="${p.userVote || ''}"
                  onclick="vote(this)">&#128077; ${p.upvotes}</button>
          <button class="vote-btn ${p.userVote === 'down' ? 'active-down' : ''}"
                  data-post-id="${p._id}" data-direction="down" data-user-vote="${p.userVote || ''}"
                  onclick="vote(this)">&#128078; ${p.downvotes}</button>
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

// ── Init ─────────────────────────────────────────
(async () => {
  const data = await api('GET', '/api/me');
  if (data.user) { currentUser = data.user; showApp(data.user); }
})();
