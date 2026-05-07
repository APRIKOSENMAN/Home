import { getGameData } from './game-data.js';
import { t } from './i18n.js';

export async function loadWiki() {
  const container = document.getElementById('wiki-items-container');
  const { items } = await getGameData();

  container.innerHTML = `<table class="trade-table">
    <thead><tr>
      <th></th>
      <th>ITEM</th>
    </tr></thead>
    <tbody>${Object.entries(items).map(([id, def]) => `<tr>
      <td class="trade-icon">${def.icon}</td>
      <td>${t('items.' + id + '.name')}</td>
    </tr>`).join('')}</tbody>
  </table>`;
}
