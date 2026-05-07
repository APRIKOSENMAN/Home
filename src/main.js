import { api } from './api.js';
import { loadLocale } from './i18n.js';
import { updateCharCount, checkPublishable } from './utils.js';
import { currentUser, setCurrentUser } from './state.js';
import { registerRenderer, openColFilter, closeColFilter, applyColFilter, clearColFilter, clearOneColFilter } from './table-filter.js';
import { loadLeaderboard, sortLeaderboard, renderLeaderboard } from './leaderboard.js';
import { loadDaily, claimDaily, stopDailyTimer } from './daily.js';
import { loadProfile, deletePost, updateProfileStats, handleSearch } from './profile.js';
import { submitPost, loadBoardPosts, startBoardRefresh, stopBoardRefresh, setBoardView, sortPostsTable, renderPostsTable, renderPosts, vote } from './board.js';
import { loadFactory, renderFactory, renderStoragePanel, renderCityGrid, startBuildingDrag, dropBuilding, openBuildingPanel, closeBuildingPanel, startRecipe, collectOutput, removeBuilding } from './factory.js';
import { loadWheel, wheelGenerate, wheelSpin, setVolume, sortSpinLog, openPostModal, closePostModal, submitPostModal, showWheelPreview, hideWheelPreview, speedUpSpin, wheelRaf, renderWheelLog } from './wheel.js';
import { loadTrade, tradeBuy, tradeSell, updateGoldDisplays } from './trade.js';
import { loadWiki } from './wiki.js';

// ── Register renderers (avoids circular deps in table-filter.js) ──
registerRenderer('lb', renderLeaderboard);
registerRenderer('pt', renderPostsTable);
registerRenderer('sl', renderWheelLog);

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
  const { username, password, err } = _getRegFields();
  if (!username || !password) { err.textContent = 'Bitte alle Felder ausfüllen.'; return; }
  if (password !== document.getElementById('reg-pass2').value) { err.textContent = 'Passwörter stimmen nicht überein.'; return; }
  const data = await api('POST', '/api/register', { username, password });
  if (data.error) { err.textContent = data.error; return; }
  err.style.color = '#1a7a3a';
  err.textContent = 'Registrierung erfolgreich!';
  setTimeout(() => { err.textContent = ''; err.style.color = ''; showLogin(); }, 1500);
}

async function registerAndLogin() {
  const { username, password, err } = _getRegFields();
  if (!username || !password) { err.textContent = 'Bitte alle Felder ausfüllen.'; return; }
  if (password !== document.getElementById('reg-pass2').value) { err.textContent = 'Passwörter stimmen nicht überein.'; return; }
  const reg = await api('POST', '/api/register', { username, password });
  if (reg.error) { err.textContent = reg.error; return; }
  const login = await api('POST', '/api/login', { username, password });
  if (login.error) { err.textContent = login.error; return; }
  setCurrentUser(login.username);
  showApp(login.username);
}

async function quickRegister() {
  const id  = String(Math.floor(10000000 + Math.random() * 90000000));
  const err = document.getElementById('reg-error');
  const reg = await api('POST', '/api/register', { username: id, password: id });
  if (reg.error) { err.textContent = reg.error; return; }
  const login = await api('POST', '/api/login', { username: id, password: id });
  if (login.error) { err.textContent = login.error; return; }
  setCurrentUser(login.username);
  showApp(login.username);
}

function _getRegFields() {
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
  setCurrentUser(data.username);
  showApp(data.username);
}

async function logout() {
  await api('POST', '/api/logout');
  setCurrentUser(null);
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

// ── Router ────────────────────────────────────────
function handleRoute() {
  const hash = window.location.hash || '#board';
  document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
  stopBoardRefresh();
  stopDailyTimer();
  closeColFilter();
  closeBuildingPanel();
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
  } else if (hash === '#trade') {
    document.querySelector('[href="#trade"]').classList.add('active');
    showView('trade');
    loadTrade();
  } else if (hash === '#wiki') {
    document.querySelector('[href="#wiki"]').classList.add('active');
    showView('wiki');
    loadWiki();
  }
}

function showView(name) {
  document.querySelectorAll('.view').forEach(v => v.classList.add('hidden'));
  document.getElementById(`view-${name}`).classList.remove('hidden');
}

// ── Event listeners ───────────────────────────────
window.addEventListener('hashchange', handleRoute);

document.addEventListener('click', e => {
  const dropdown = document.getElementById('lb-col-filter');
  if (dropdown && !dropdown.classList.contains('hidden') &&
      !dropdown.contains(e.target) &&
      !e.target.classList.contains('col-filter-btn') &&
      !e.target.classList.contains('col-clear-btn')) {
    closeColFilter();
  }
  const sub = document.getElementById('sub-header');
  if (sub && !sub.classList.contains('hidden')) {
    const hdr = document.querySelector('header');
    if (hdr && !hdr.contains(e.target) && !sub.contains(e.target)) {
      sub.classList.add('hidden');
    }
  }
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

// ── Window exposure (inline HTML handlers) ────────
Object.assign(window, {
  // utils
  updateCharCount,
  checkPublishable,
  // auth
  login,
  logout,
  showLogin,
  showRegister,
  register,
  registerAndLogin,
  quickRegister,
  toggleUserMenu,
  // profile
  handleSearch,
  updateProfileStats,
  deletePost,
  loadProfile,
  // board
  submitPost,
  setBoardView,
  sortPostsTable,
  vote,
  // leaderboard
  sortLeaderboard,
  // table-filter
  openColFilter,
  closeColFilter,
  applyColFilter,
  clearColFilter,
  clearOneColFilter,
  // wheel
  setVolume,
  wheelGenerate,
  wheelSpin,
  sortSpinLog,
  openPostModal,
  closePostModal,
  submitPostModal,
  showWheelPreview,
  hideWheelPreview,
  speedUpSpin,
  // factory
  startBuildingDrag,
  startRecipe,
  collectOutput,
  removeBuilding,
  closeBuildingPanel,
  // daily
  claimDaily,
  // trade
  tradeBuy,
  tradeSell,
  updateGoldDisplays,
});

// ── Init ─────────────────────────────────────────
(async () => {
  await loadLocale('de');
  const data = await api('GET', '/api/me');
  if (data.user) { setCurrentUser(data.user); showApp(data.user); }
})();
