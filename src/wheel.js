import { api, escapeHtml } from './api.js';
import { updateCharCount } from './utils.js';
import { slSort, slFilters, updateColClearBtns } from './table-filter.js';

// ── Audio ─────────────────────────────────────────
let audioCtx   = null;
let masterGain = null;

function initAudio() {
  if (audioCtx) return;
  audioCtx   = new (window.AudioContext || window.webkitAudioContext)();
  masterGain = audioCtx.createGain();
  masterGain.gain.value = parseFloat(document.getElementById('vol-slider')?.value ?? 0.5);
  masterGain.connect(audioCtx.destination);
}

export function setVolume(v) {
  if (masterGain) masterGain.gain.value = parseFloat(v);
}

function _tone(freq, type, dur, vol) {
  if (!audioCtx) return;
  const osc = audioCtx.createOscillator();
  const g   = audioCtx.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  g.gain.setValueAtTime(vol, audioCtx.currentTime);
  g.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + dur);
  osc.connect(g);
  g.connect(masterGain);
  osc.start();
  osc.stop(audioCtx.currentTime + dur);
}

function playClick() { _tone(880, 'square', 0.07, 0.3); }
function playTick()  { _tone(1200, 'square', 0.025, 0.15); }

function playWinSound(reward) {
  if (!audioCtx) return;
  if (reward === 0) {
    _tone(200, 'sawtooth', 0.4, 0.25);
    setTimeout(() => _tone(160, 'sawtooth', 0.4, 0.25), 200);
  } else if (reward <= 15) {
    _tone(523, 'sine', 0.2, 0.3);
    setTimeout(() => _tone(659, 'sine', 0.2, 0.3), 120);
  } else if (reward <= 40) {
    _tone(523, 'sine', 0.15, 0.3);
    setTimeout(() => _tone(659, 'sine', 0.15, 0.3), 100);
    setTimeout(() => _tone(784, 'sine', 0.25, 0.35), 200);
  } else if (reward <= 75) {
    [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => _tone(f, 'sine', 0.2, 0.3), i * 80));
  } else {
    [523, 659, 784, 1047, 1319].forEach((f, i) => setTimeout(() => _tone(f, 'triangle', 0.25, 0.4), i * 70));
  }
}

// ── Wheel state ───────────────────────────────────
let wheelSegs     = null;
let wheelRot      = 0;
export let wheelRaf = null;
let wheelFastFrom = null;

let slData        = [];
let postedSeeds   = new Set();
let lastPostTime  = 0;
let modalSeedData = null;

// ── Wheel math ────────────────────────────────────
const CAT_COLORS = ['#9e9e9e', '#64b5f6', '#9c27b0', '#ef5350', '#ffd700'];

function mulberry32(seed) {
  seed = seed >>> 0;
  return function() {
    seed = (seed + 0x6D2B79F5) >>> 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function buildWheelV1(seedStr) {
  const rng = mulberry32(parseInt(seedStr, 10));
  const n   = Math.floor(rng() * 7) + 2;
  const w   = Array.from({length: n}, () => 0.15 + rng() * 0.85);
  const tot = w.reduce((a, b) => a + b, 0);
  const p   = w.map(x => x / tot);
  const rawData = Array.from({length: n}, () => {
    const r = rng();
    if (r < 0.30) return { raw: 0,                  cat: 0 };
    if (r < 0.62) return { raw: rng() * 90 + 5,     cat: 1 };
    if (r < 0.84) return { raw: rng() * 280 + 60,   cat: 2 };
    if (r < 0.95) return { raw: rng() * 450 + 220,  cat: 3 };
    return               { raw: rng() * 2000 + 2000, cat: 4 };
  });
  const raw   = rawData.map(d => d.raw);
  const ev    = p.reduce((s, pi, i) => s + pi * raw[i], 0);
  const scale = ev > 0 ? 11 / ev : 1;
  const rwd   = raw.map(r => Math.min(200, Math.max(0, Math.round(r * scale))));
  return p.map((prob, i) => ({ prob, reward: rwd[i], color: CAT_COLORS[rawData[i].cat] }));
}

function wheelCurrentSeg(rot) {
  if (!wheelSegs) return 0;
  let angle = ((-rot) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2);
  let cum = 0;
  for (let i = 0; i < wheelSegs.length; i++) {
    cum += wheelSegs[i].prob * Math.PI * 2;
    if (angle < cum) return i;
  }
  return wheelSegs.length - 1;
}

// ── Drawing ───────────────────────────────────────
function drawWheel() {
  const canvas = document.getElementById('wheel-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const S   = canvas.width;
  const cx  = S / 2, cy = S / 2;
  const R   = S / 2 - 26;

  ctx.clearRect(0, 0, S, S);
  ctx.beginPath();
  ctx.arc(cx, cy, R + 10, 0, Math.PI * 2);
  ctx.fillStyle = '#162032';
  ctx.fill();

  if (!wheelSegs) return;

  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(wheelRot);

  let a = -Math.PI / 2;
  wheelSegs.forEach(seg => {
    const arc = seg.prob * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.arc(0, 0, R, a, a + arc);
    ctx.closePath();
    ctx.fillStyle = seg.color;
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.45)';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    ctx.save();
    ctx.rotate(a + arc / 2);
    const fs = Math.max(13, Math.min(26, arc * R / 9));
    ctx.font = `bold ${fs | 0}px Segoe UI,sans-serif`;
    ctx.fillStyle = '#fff';
    ctx.shadowColor = 'rgba(0,0,0,.7)';
    ctx.shadowBlur  = 4;
    ctx.textAlign   = 'right';
    ctx.fillText(seg.reward === 0 ? '0' : `${seg.reward}`, R - 10, (fs | 0) / 3);
    ctx.restore();

    a += arc;
  });

  ctx.beginPath();
  ctx.arc(0, 0, 20, 0, Math.PI * 2);
  ctx.fillStyle = '#0d1a28';
  ctx.fill();
  ctx.strokeStyle = '#c8d8e8';
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.restore();

  ctx.beginPath();
  ctx.moveTo(cx - 15, cy - R - 4);
  ctx.lineTo(cx + 15, cy - R - 4);
  ctx.lineTo(cx, cy - R + 22);
  ctx.closePath();
  ctx.fillStyle = '#e53935';
  ctx.fill();
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 2;
  ctx.stroke();
}

function drawMiniWheel(canvas, segs, winIdx) {
  const ctx = canvas.getContext('2d');
  const S   = canvas.width;
  const cx  = S / 2, cy = S / 2;
  const R   = S / 2 - 8;

  let cum = 0;
  for (let i = 0; i < winIdx; i++) cum += segs[i].prob * Math.PI * 2;
  const rot = -(cum + segs[winIdx].prob * Math.PI);

  ctx.clearRect(0, 0, S, S);
  ctx.beginPath();
  ctx.arc(cx, cy, R + 4, 0, Math.PI * 2);
  ctx.fillStyle = '#162032';
  ctx.fill();

  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(rot);

  let a = -Math.PI / 2;
  segs.forEach((seg, i) => {
    const arc = seg.prob * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.arc(0, 0, R, a, a + arc);
    ctx.closePath();
    ctx.fillStyle = seg.color;
    ctx.fill();
    ctx.strokeStyle = i === winIdx ? '#fff' : 'rgba(255,255,255,0.35)';
    ctx.lineWidth   = i === winIdx ? 2 : 1;
    ctx.stroke();

    ctx.save();
    ctx.rotate(a + arc / 2);
    const fs = Math.max(7, Math.min(12, arc * R / 9));
    ctx.font = `bold ${fs | 0}px Segoe UI,sans-serif`;
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'right';
    ctx.fillText(seg.reward === 0 ? '0' : `${seg.reward}`, R - 4, (fs | 0) / 3);
    ctx.restore();

    a += arc;
  });

  ctx.beginPath();
  ctx.arc(0, 0, 6, 0, Math.PI * 2);
  ctx.fillStyle = '#0d1a28';
  ctx.fill();
  ctx.restore();

  ctx.beginPath();
  ctx.moveTo(cx - 6, cy - R - 2);
  ctx.lineTo(cx + 6, cy - R - 2);
  ctx.lineTo(cx, cy - R + 9);
  ctx.closePath();
  ctx.fillStyle = '#e53935';
  ctx.fill();
}

// ── Animation ─────────────────────────────────────
function wheelTargetRot(segIdx) {
  let cum = 0;
  for (let i = 0; i < segIdx; i++) cum += wheelSegs[i].prob * Math.PI * 2;
  const arc    = wheelSegs[segIdx].prob * Math.PI * 2;
  const margin = arc * 0.12;
  const land   = cum + margin + Math.random() * (arc - 2 * margin);
  const base   = -land;
  const extra  = Math.ceil((wheelRot + Math.PI * 2 * 6 - base) / (Math.PI * 2));
  return base + extra * Math.PI * 2;
}

export function speedUpSpin() {
  if (wheelRaf && wheelFastFrom === null) wheelFastFrom = performance.now();
}

function animateSpin(segIdx, onDone) {
  if (wheelRaf) cancelAnimationFrame(wheelRaf);
  wheelFastFrom = null;
  const target = wheelTargetRot(segIdx);
  const start  = wheelRot;
  const t0     = performance.now();
  const dur    = 4500 + Math.random() * 2500;
  function ease(p) { return 1 - Math.pow(1 - p, 6); }
  let lastSeg = wheelCurrentSeg(wheelRot);
  function frame(now) {
    let elapsed = now - t0;
    if (wheelFastFrom !== null) elapsed = (wheelFastFrom - t0) + (now - wheelFastFrom) * 2;
    const t = Math.min(elapsed / dur, 1);
    wheelRot = start + (target - start) * ease(t);
    const curSeg = wheelCurrentSeg(wheelRot);
    if (curSeg !== lastSeg) { lastSeg = curSeg; playTick(); }
    drawWheel();
    if (t >= 1 || t > 0.82) { wheelRot = target; drawWheel(); wheelRaf = null; onDone(); }
    else                     { wheelRaf = requestAnimationFrame(frame); }
  }
  wheelRaf = requestAnimationFrame(frame);
}

// ── UI helpers ────────────────────────────────────
function renderWheelButtons(hasSeed) {
  const row = document.getElementById('wheel-btn-row');
  if (hasSeed) {
    row.innerHTML = `
      <button id="wbtn-spin" onclick="wheelSpin()">&#9654; SPIN <span class="wheel-cost">5 &#128176;</span></button>
      <span class="wheel-or">OR</span>
      <button id="wbtn-regen" class="btn-secondary" onclick="wheelGenerate()">&#8635; REGENERATE <span class="wheel-cost">5 &#128176;</span></button>`;
    setTimeout(() => document.getElementById('wbtn-spin')?.focus(), 50);
  } else {
    row.innerHTML = `
      <button id="wbtn-gen" onclick="wheelGenerate()">&#9889; GENERATE <span class="wheel-cost">5 &#128176;</span></button>`;
    setTimeout(() => document.getElementById('wbtn-gen')?.focus(), 50);
  }
}

function setWheelBtnsDisabled(on) {
  document.querySelectorAll('#wheel-btn-row button').forEach(b => b.disabled = on);
}

// ── Public API ────────────────────────────────────
export async function loadWheel() {
  const data = await api('GET', '/api/wheel');
  document.getElementById('wheel-gold').textContent = `${data.gold} 💰`;
  if (data.seed) {
    wheelSegs = buildWheelV1(data.seed);
    drawWheel();
    document.getElementById('wheel-seed-row').textContent = `SEED v${data.version} · ${data.seed}`;
    renderWheelButtons(true);
  } else {
    wheelSegs = null;
    drawWheel();
    document.getElementById('wheel-seed-row').textContent = '';
    renderWheelButtons(false);
  }
  document.getElementById('wheel-result').classList.add('hidden');
  document.getElementById('wheel-error').textContent = '';
  loadWheelLog();
}

export async function wheelGenerate() {
  initAudio();
  playClick();
  setWheelBtnsDisabled(true);
  document.getElementById('wheel-error').textContent = '';
  const data = await api('POST', '/api/wheel/generate');
  if (data.error) {
    document.getElementById('wheel-error').textContent = data.error;
    setWheelBtnsDisabled(false);
    return;
  }
  wheelSegs = buildWheelV1(data.seed);
  wheelRot  = 0;
  drawWheel();
  document.getElementById('wheel-gold').textContent     = `${data.gold} 💰`;
  document.getElementById('wheel-seed-row').textContent = `SEED v${data.version} · ${data.seed}`;
  document.getElementById('wheel-result').classList.add('hidden');
  renderWheelButtons(true);
}

export async function wheelSpin() {
  if (!wheelSegs) return;
  initAudio();
  playClick();
  setWheelBtnsDisabled(true);
  document.getElementById('wheel-result').classList.add('hidden');
  document.getElementById('wheel-error').textContent = '';

  const data = await api('POST', '/api/wheel/spin');
  if (data.error) {
    document.getElementById('wheel-error').textContent = data.error;
    setWheelBtnsDisabled(false);
    return;
  }

  animateSpin(data.segmentIndex, () => {
    playWinSound(data.reward);
    const el = document.getElementById('wheel-result');
    el.classList.remove('hidden', 'zero');
    if (data.reward === 0) {
      el.textContent = '— 0 GOLD —';
      el.classList.add('zero');
    } else {
      el.textContent = `+ ${data.reward} GOLD`;
    }
    document.getElementById('wheel-gold').textContent = `${data.gold} 💰`;
    wheelSegs = null;
    document.getElementById('wheel-seed-row').textContent = '';
    renderWheelButtons(false);
    setWheelBtnsDisabled(false);
    loadWheelLog();
  });
}

// ── Spin Log ──────────────────────────────────────
async function loadWheelLog() {
  const entries = await api('GET', '/api/wheel/log');
  slData = entries;
  renderWheelLog();
}

export function sortSpinLog(col) {
  if (slSort.col === col) {
    slSort.dir = slSort.dir === 'desc' ? 'asc' : 'desc';
  } else {
    slSort.col = col;
    slSort.dir = col === 'seed' ? 'asc' : 'desc';
  }
  renderWheelLog();
}

export function renderWheelLog(entries) {
  if (Array.isArray(entries)) slData = entries;
  const container = document.getElementById('wheel-log-container');
  if (!container) return;
  if (!slData.length) { container.innerHTML = ''; return; }

  const sortIconHtml = col =>
    `<span class="sort-icon" data-col="${col}" data-table="sl"></span>`;

  let data = [...slData].filter(e => {
    for (const [col, f] of Object.entries(slFilters)) {
      let val;
      if (col === 'spunAt') val = new Date(e.spunAt).toLocaleString('de-DE');
      else val = e[col];
      if (f.text && !String(val ?? '').toLowerCase().includes(f.text)) return false;
      if (f.from !== undefined && Number(val) < f.from) return false;
      if (f.to   !== undefined && Number(val) > f.to)   return false;
    }
    return true;
  });

  data.sort((a, b) => {
    const dir = slSort.dir === 'asc' ? 1 : -1;
    if (slSort.col === 'spunAt') return (new Date(a.spunAt) - new Date(b.spunAt)) * dir;
    if (slSort.col === 'seed')   return String(a.seed).localeCompare(String(b.seed)) * dir;
    return ((a[slSort.col] ?? 0) - (b[slSort.col] ?? 0)) * dir;
  });

  container.innerHTML = `
    <div class="panel-label">SPIN VERLAUF</div>
    <div class="panel" style="margin-top:130px">
      <table class="spin-log-table">
        <thead><tr>
          <th><div class="th-inner">
            <span class="sortable" onclick="sortSpinLog('spunAt')">DATUM ${sortIconHtml('spunAt')}</span>
            <button class="col-filter-btn" onclick="openColFilter('spunAt',this,false,'sl')">&#128269;</button>
            <button class="col-clear-btn hidden" data-col="spunAt" data-table="sl" onclick="clearOneColFilter('spunAt','sl')">&#10005;</button>
          </div></th>
          <th><div class="th-inner">
            <span class="sortable" onclick="sortSpinLog('seed')">SEED ${sortIconHtml('seed')}</span>
            <button class="col-filter-btn" onclick="openColFilter('seed',this,false,'sl')">&#128269;</button>
            <button class="col-clear-btn hidden" data-col="seed" data-table="sl" onclick="clearOneColFilter('seed','sl')">&#10005;</button>
          </div></th>
          <th><div class="th-inner">
            <span class="sortable" onclick="sortSpinLog('reward')">REWARD ${sortIconHtml('reward')}</span>
            <button class="col-filter-btn" onclick="openColFilter('reward',this,true,'sl')">&#128269;</button>
            <button class="col-clear-btn hidden" data-col="reward" data-table="sl" onclick="clearOneColFilter('reward','sl')">&#10005;</button>
          </div></th>
          <th></th>
        </tr></thead>
        <tbody>${data.map(e => {
          const date   = new Date(e.spunAt).toLocaleString('de-DE');
          const cls    = e.reward === 0 ? 'log-zero' : e.reward >= 120 ? 'log-jackpot' : '';
          const posted = postedSeeds.has(e.seed);
          return `<tr>
            <td class="col-num">${date}</td>
            <td class="log-seed" data-seed="${e.seed}" data-seg="${e.segmentIdx}"
                onmouseenter="showWheelPreview(this,event)" onmouseleave="hideWheelPreview()">${e.seed}</td>
            <td class="col-num ${cls}">${e.reward === 0 ? '— 0' : '+' + e.reward} &#127922;</td>
            <td><button class="spin-post-btn" ${posted ? 'disabled' : ''}
                onclick="openPostModal('${e.seed}',${e.segmentIdx},${e.reward})">
              ${posted ? '&#10003; Gepostet' : '&#128203; Posten'}</button></td>
          </tr>`;
        }).join('')}</tbody>
      </table>
    </div>`;

  document.querySelectorAll('.sort-icon[data-table="sl"]').forEach(el => {
    el.className = 'sort-icon' + (el.dataset.col === slSort.col ? ` ${slSort.dir}` : '');
  });
  updateColClearBtns('sl');
}

// ── Post Modal ────────────────────────────────────
export function openPostModal(seed, segIdx, reward) {
  if (postedSeeds.has(seed)) return;
  modalSeedData = { seed, segIdx, reward };

  const titleEl = document.getElementById('modal-title');
  const bodyEl  = document.getElementById('modal-body-text');
  titleEl.value = reward === 0 ? 'Wheel Spin: 0 Gold' : `Wheel Spin: +${reward} Gold`;
  bodyEl.value  = `Wheel of Fortune Ergebnis:\n\n\u{1F4B0} Reward: ${reward === 0 ? '— 0 Gold' : '+' + reward + ' Gold'}\n\u{1F331} Seed: ${seed}`;
  updateCharCount(titleEl);
  updateCharCount(bodyEl);
  document.getElementById('modal-error').textContent = '';

  const canvas = document.getElementById('modal-wheel-canvas');
  drawMiniWheel(canvas, buildWheelV1(seed), segIdx);

  document.getElementById('post-modal').classList.remove('hidden');
  titleEl.focus();
}

export function closePostModal() {
  document.getElementById('post-modal').classList.add('hidden');
  modalSeedData = null;
}

export async function submitPostModal() {
  if (!modalSeedData) return;
  const { seed, reward } = modalSeedData;

  if (postedSeeds.has(seed)) {
    document.getElementById('modal-error').textContent = 'Dieser Spin wurde bereits gepostet.';
    return;
  }
  const now  = Date.now();
  const wait = Math.ceil((60000 - (now - lastPostTime)) / 1000);
  if (lastPostTime > 0 && wait > 0) {
    document.getElementById('modal-error').textContent = `Bitte noch ${wait}s warten (1-Minuten-Cooldown).`;
    return;
  }

  const title = document.getElementById('modal-title').value.trim();
  const body  = document.getElementById('modal-body-text').value.trim();
  if (!title || !body) {
    document.getElementById('modal-error').textContent = 'Titel und Inhalt erforderlich.';
    return;
  }

  const data = await api('POST', '/api/posts', { title, body });
  if (data.error) { document.getElementById('modal-error').textContent = data.error; return; }

  lastPostTime = Date.now();
  postedSeeds.add(seed);
  closePostModal();
  renderWheelLog();
}

export function showWheelPreview(el, event) {
  const preview = document.getElementById('wheel-preview');
  const canvas  = document.getElementById('preview-canvas');
  const segs    = buildWheelV1(el.dataset.seed);
  const winIdx  = parseInt(el.dataset.seg);
  drawMiniWheel(canvas, segs, winIdx);

  const rect = el.getBoundingClientRect();
  let left = rect.right + 10;
  if (left + 148 > window.innerWidth) left = rect.left - 158;
  preview.style.left = left + 'px';
  preview.style.top  = Math.max(4, rect.top - 60) + 'px';
  preview.classList.remove('hidden');
}

export function hideWheelPreview() {
  document.getElementById('wheel-preview').classList.add('hidden');
}
