import { api } from './api.js';

let dailyTimerInterval = null;

export async function loadDaily() {
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
    btn.textContent = '🎁 150 GOLD EINSAMMELN';
    if (timer) timer.textContent = '';
  } else {
    btn.disabled = true;
    btn.textContent = '⏳ NOCH NICHT VERFÜGBAR';
    if (dailyTimerInterval) clearInterval(dailyTimerInterval);
    let remaining = data.secondsUntilNext;
    function tick() {
      if (!document.getElementById('daily-timer')) { clearInterval(dailyTimerInterval); return; }
      if (remaining <= 0) {
        clearInterval(dailyTimerInterval);
        btn.disabled = false;
        btn.textContent = '🎁 150 GOLD EINSAMMELN';
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

export async function claimDaily() {
  const btn = document.getElementById('daily-claim-btn');
  const err = document.getElementById('daily-error');
  btn.disabled = true;
  const data = await api('POST', '/api/daily/claim');
  if (data.error) { err.textContent = data.error; btn.disabled = false; return; }
  err.textContent = '';
  const timer = document.getElementById('daily-timer');
  if (timer) timer.textContent = `+150 Gold eingesammelt! Guthaben: ${data.gold} 💰`;
  btn.textContent = '✓ Eingesammelt!';
  setTimeout(loadDaily, 2000);
}

export function stopDailyTimer() {
  if (dailyTimerInterval) { clearInterval(dailyTimerInterval); dailyTimerInterval = null; }
}
