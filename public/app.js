let currentUser = null;

// ── API-Helfer ───────────────────────────────────
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
  const username = document.getElementById('reg-user').value.trim();
  const password = document.getElementById('reg-pass').value;
  const password2 = document.getElementById('reg-pass2').value;
  const err = document.getElementById('reg-error');

  if (!username || !password) { err.textContent = 'Bitte alle Felder ausfüllen.'; return; }
  if (password !== password2) { err.textContent = 'Passwörter stimmen nicht überein.'; return; }

  const data = await api('POST', '/api/register', { username, password });
  if (data.error) { err.textContent = data.error; return; }

  err.style.color = '#27ae60';
  err.textContent = 'Registrierung erfolgreich! Bitte einloggen.';
  setTimeout(() => { err.textContent = ''; err.style.color = ''; showLogin(); }, 1500);
}

async function login() {
  const username = document.getElementById('login-user').value.trim();
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

// ── Board ────────────────────────────────────────
async function submitPost() {
  const title = document.getElementById('post-title').value.trim();
  const body = document.getElementById('post-body').value.trim();
  if (!title || !body) return;

  const data = await api('POST', '/api/posts', { title, body });
  if (data.error) { alert(data.error); return; }

  document.getElementById('post-title').value = '';
  document.getElementById('post-body').value = '';
  loadBoardPosts();
}

async function loadBoardPosts() {
  const posts = await api('GET', '/api/posts');
  renderPosts(posts, document.getElementById('posts-container'));
}

// ── Profil ───────────────────────────────────────
async function loadProfile(username) {
  const [profile, posts] = await Promise.all([
    api('GET', `/api/profile/${encodeURIComponent(username)}`),
    api('GET', `/api/posts?author=${encodeURIComponent(username)}`)
  ]);

  if (profile.error) {
    document.getElementById('profile-avatar').textContent = '?';
    document.getElementById('profile-username').textContent = 'User nicht gefunden';
    document.getElementById('profile-meta').textContent = '';
    document.getElementById('profile-posts-container').innerHTML = '';
    return;
  }

  document.getElementById('profile-avatar').textContent = username[0].toUpperCase();
  document.getElementById('profile-username').textContent = profile.username;
  document.getElementById('profile-meta').textContent =
    `${profile.postCount} Beiträge · Dabei seit ${new Date(profile.createdAt).toLocaleDateString('de-DE')}`;

  renderPosts(posts, document.getElementById('profile-posts-container'));
}

// ── Posts rendern ────────────────────────────────
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
      </div>
    `;
  }).join('');
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ── Router ───────────────────────────────────────
function handleRoute() {
  const hash = window.location.hash || '#board';

  document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));

  if (hash === '#board' || hash === '#' || hash === '') {
    document.querySelector('[href="#board"]').classList.add('active');
    showView('board');
    loadBoardPosts();
  } else if (hash.startsWith('#profile')) {
    document.querySelector('[href="#profile"]').classList.add('active');
    showView('profile');
    const parts = hash.split('/');
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
  if (data.user) {
    currentUser = data.user;
    showApp(data.user);
  }
})();
