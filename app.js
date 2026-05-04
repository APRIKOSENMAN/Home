// ── Storage helpers ─────────────────────────────
function getUsers() {
  return JSON.parse(localStorage.getItem('users') || '{}');
}

function saveUsers(users) {
  localStorage.setItem('users', JSON.stringify(users));
}

function getPosts() {
  return JSON.parse(localStorage.getItem('posts') || '[]');
}

function savePosts(posts) {
  localStorage.setItem('posts', JSON.stringify(posts));
}

function getSession() {
  return localStorage.getItem('session');
}

function setSession(username) {
  localStorage.setItem('session', username);
}

function clearSession() {
  localStorage.removeItem('session');
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

function register() {
  const user = document.getElementById('reg-user').value.trim();
  const pass = document.getElementById('reg-pass').value;
  const pass2 = document.getElementById('reg-pass2').value;
  const err = document.getElementById('reg-error');

  if (!user || !pass) { err.textContent = 'Bitte alle Felder ausfüllen.'; return; }
  if (pass !== pass2) { err.textContent = 'Passwörter stimmen nicht überein.'; return; }
  if (user.length < 3) { err.textContent = 'Benutzername muss mindestens 3 Zeichen haben.'; return; }

  const users = getUsers();
  if (users[user]) { err.textContent = 'Benutzername bereits vergeben.'; return; }

  users[user] = { password: btoa(pass) };
  saveUsers(users);
  err.style.color = '#27ae60';
  err.textContent = 'Registrierung erfolgreich! Bitte einloggen.';

  setTimeout(() => {
    err.textContent = '';
    err.style.color = '';
    showLogin();
  }, 1500);
}

function login() {
  const user = document.getElementById('login-user').value.trim();
  const pass = document.getElementById('login-pass').value;
  const err = document.getElementById('login-error');

  if (!user || !pass) { err.textContent = 'Bitte alle Felder ausfüllen.'; return; }

  const users = getUsers();
  if (!users[user] || users[user].password !== btoa(pass)) {
    err.textContent = 'Falscher Benutzername oder Passwort.';
    return;
  }

  err.textContent = '';
  setSession(user);
  showApp(user);
}

function logout() {
  clearSession();
  document.getElementById('app-section').classList.add('hidden');
  document.getElementById('auth-section').classList.remove('hidden');
  document.getElementById('login-user').value = '';
  document.getElementById('login-pass').value = '';
  showLogin();
}

// ── App ──────────────────────────────────────────
function showApp(username) {
  document.getElementById('auth-section').classList.add('hidden');
  document.getElementById('app-section').classList.remove('hidden');
  document.getElementById('current-user-name').textContent = username;
  renderPosts();
}

function submitPost() {
  const title = document.getElementById('post-title').value.trim();
  const body = document.getElementById('post-body').value.trim();
  if (!title || !body) return;

  const posts = getPosts();
  posts.unshift({
    title,
    body,
    author: getSession(),
    date: new Date().toLocaleString('de-DE')
  });
  savePosts(posts);

  document.getElementById('post-title').value = '';
  document.getElementById('post-body').value = '';
  renderPosts();
}

function renderPosts() {
  const container = document.getElementById('posts-container');
  const posts = getPosts();

  if (posts.length === 0) {
    container.innerHTML = '<p class="no-posts">Noch keine Beiträge vorhanden.</p>';
    return;
  }

  container.innerHTML = posts.map(p => `
    <div class="post">
      <div class="post-header">
        <h4>${escapeHtml(p.title)}</h4>
        <span class="post-meta">${escapeHtml(p.author)} &middot; ${p.date}</span>
      </div>
      <p class="post-body">${escapeHtml(p.body)}</p>
    </div>
  `).join('');
}

function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ── Init ─────────────────────────────────────────
const session = getSession();
if (session) {
  const users = getUsers();
  if (users[session]) {
    showApp(session);
  } else {
    clearSession();
  }
}
