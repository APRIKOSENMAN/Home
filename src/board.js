import { api, escapeHtml } from './api.js';
import { updateCharCount, checkPublishable } from './utils.js';
import { currentUser } from './state.js';
import { ptSort, ptFilters, updateColClearBtns } from './table-filter.js';

let ptData            = [];
let refreshInterval   = null;
let lastBoardSnapshot = null;

export async function submitPost() {
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

export async function loadBoardPosts() {
  const posts = await api('GET', '/api/posts');
  const snap  = JSON.stringify(posts.map(p => ({ id: p.id, up: p.upvotes, down: p.downvotes, uv: p.userVote })));
  if (snap === lastBoardSnapshot) return;
  lastBoardSnapshot = snap;
  renderPosts(posts, document.getElementById('posts-container'));
  renderPostsTable(posts);
}

export function startBoardRefresh() {
  stopBoardRefresh();
  refreshInterval = setInterval(loadBoardPosts, 5000);
}

export function stopBoardRefresh() {
  if (refreshInterval) { clearInterval(refreshInterval); refreshInterval = null; }
}

export function setBoardView(view) {
  document.getElementById('posts-container').classList.toggle('hidden', view !== 'cards');
  document.getElementById('posts-table-container').classList.toggle('hidden', view !== 'table');
  document.getElementById('btn-cards').classList.toggle('active', view === 'cards');
  document.getElementById('btn-table').classList.toggle('active', view === 'table');
}

export function sortPostsTable(col) {
  if (ptSort.col === col) {
    ptSort.dir = ptSort.dir === 'desc' ? 'asc' : 'desc';
  } else {
    ptSort.col = col;
    ptSort.dir = (col === 'title' || col === 'author') ? 'asc' : 'desc';
  }
  renderPostsTable();
}

export function renderPostsTable(posts) {
  if (Array.isArray(posts)) ptData = posts;
  const tbody = document.getElementById('posts-table-body');
  if (!tbody) return;

  document.querySelectorAll('.sort-icon[data-table="pt"]').forEach(el => {
    el.className = 'sort-icon' + (el.dataset.col === ptSort.col ? ` ${ptSort.dir}` : '');
  });

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

export function renderPosts(posts, container, showDelete = false) {
  if (!Array.isArray(posts) || posts.length === 0) {
    container.innerHTML = '<p class="no-posts">Noch keine Beiträge vorhanden.</p>';
    return;
  }

  container.innerHTML = posts.map(p => {
    const date   = new Date(p.created_at || p.createdAt).toLocaleString('de-DE');
    const voters = Array.isArray(p.voters) ? p.voters : [];
    const isOwn  = p.author === currentUser;

    const voteBtns = isOwn
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

export async function vote(btn) {
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
    window.updateProfileStats(profile);
  }
}
