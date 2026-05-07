import { getGameData } from './game-data.js';
import { t } from './i18n.js';

export async function loadQuests() {
  const { quests, items } = await getGameData();
  const container = document.getElementById('quest-list');
  container.innerHTML = Object.entries(quests).map(([id, q]) => renderQuestCard(id, q, items)).join('');
}

function rewardText(reward, items) {
  if (reward.gold) return `${reward.gold} 💰`;
  if (reward.item) {
    const icon = items[reward.item]?.icon ?? '';
    const name = t('items.' + reward.item + '.name');
    return `${icon} ${name} ×${reward.qty}`;
  }
  return '?';
}

function renderQuestCard(id, q, items) {
  const name = t('quests.' + id + '.name');
  const desc = t('quests.' + id + '.description');
  return `<div class="panel quest-card">
    <div class="quest-card-header">
      <span class="quest-name">${name}</span>
      <span class="quest-type-badge">${q.type.toUpperCase()}</span>
    </div>
    <div class="quest-desc">${desc}</div>
    <div class="quest-reward">Belohnung: ${rewardText(q.reward, items)}</div>
  </div>`;
}
