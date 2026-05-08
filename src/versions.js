import { api } from './api.js';

let versionsData = null;

export async function loadVersions() {
  const data = await api('GET', '/api/version');
  versionsData = data;
  updateVersionTabLabel(data.version);
  renderVersionsPage();
}

function renderVersionsPage() {
  if (!versionsData) return;

  const container = document.getElementById('versions-container');
  if (!container) return;

  container.innerHTML = renderVersionsPanel(versionsData);
}

function updateVersionTabLabel(version) {
  const tab = document.getElementById('nav-versions');
  if (tab) tab.textContent = `V${version}`;
}

function renderVersionsPanel(data) {
  const { version, commits } = data;

  const commitRows = commits.slice(0, 50).map((c, i) => {
    const date = new Date(c.date).toLocaleString('de-DE');
    return `<tr>
      <td class="col-num">${i + 1}</td>
      <td class="version-hash">${c.hash}</td>
      <td class="version-msg">${escapeHtml(c.message)}</td>
      <td class="version-author">${escapeHtml(c.author)}</td>
      <td class="col-num">${date}</td>
    </tr>`;
  }).join('');

  return `
    <div class="panel">
      <div class="panel-header">VERSIONS HISTORY</div>
      <table class="spin-log-table">
        <thead><tr>
          <th><div class="th-inner">#</div></th>
          <th><div class="th-inner">HASH</div></th>
          <th><div class="th-inner">MESSAGE</div></th>
          <th><div class="th-inner">AUTHOR</div></th>
          <th><div class="th-inner">DATUM</div></th>
        </tr></thead>
        <tbody>${commitRows}</tbody>
      </table>
    </div>
  `;
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function getVersionString() {
  return versionsData ? `V${versionsData.version}` : 'V–';
}
