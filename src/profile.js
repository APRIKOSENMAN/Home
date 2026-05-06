import { api } from './api.js';
import { currentUser } from './state.js';
import { renderPosts } from './board.js';

export async function loadProfile(username) {
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

export async function deletePost(postId) {
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

export function updateProfileStats(profile) {
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

export function handleSearch(e) {
  if (e.key !== 'Enter') return;
  const val = document.getElementById('search-input').value.trim().toLowerCase();
  if (!val) return;
  document.getElementById('search-input').value = '';
  window.location.hash = `#profile/${encodeURIComponent(val)}`;
}
