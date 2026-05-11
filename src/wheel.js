import { api, escapeHtml } from './api.js';
import { updateCharCount } from './utils.js';
import { slSort, slFilters, updateColClearBtns } from './table-filter.js';
import { setGold } from './gold.js';
import WB from '../shared/wheel-balance.js';

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

function playJackpotChing(count) {
  if (!audioCtx) return;
  for (let i = 0; i < count; i++) {
    setTimeout(() => {
      _tone(2400, 'sine', 0.4, 0.5);
      _tone(1800, 'sine', 0.22, 0.35);
    }, i * 340);
  }
}

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

let currentSeed   = null;
let previewActive = false;
let previewSaved  = null; // { segs, rot }
let previewSeed   = null;

let slData        = [];
let postedSeeds   = new Set();
let lastPostTime  = 0;
let modalSeedData = null;

// ── Jackpot state ─────────────────────────────────
let jpRound       = 0;
let jpProduct     = 1;
let jpMultipliers = [];
let jpRaf         = null;
let jpRot         = 0;
let jpRevealCount = 0;
let jpRevealTimer = null;

// ── Double-or-Nothing state ────────────────────────
let jpDonUsed    = false;   // reset per round
let jpDonFactors = [];      // accumulated across rounds, cleared on new jackpot session
let jpDonRaf     = null;
let jpDonRot     = 0;

const DON_SEGS = [
  { prob: 0.51, label: '2×', color: '#43a047' },
  { prob: 0.49, label: '0×', color: '#e53935' },
];

// ── Wheel math ────────────────────────────────────
function mulberry32(seed) {
  seed = seed >>> 0;
  return function() {
    seed = (seed + 0x6D2B79F5) >>> 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Cumulative category thresholds (computed once from balance config)
const _cumCats = (() => {
  let cum = 0;
  return WB.categories.map(c => { cum += c.prob; return cum; });
})();

function buildWheelV1(seedStr) {
  const rng = mulberry32(parseInt(seedStr, 10));

  const n   = Math.floor(rng() * WB.segments.count_range) + WB.segments.count_min;
  const w   = Array.from({length: n}, () => WB.segments.weight_min + rng() * WB.segments.weight_range);
  const tot = w.reduce((a, b) => a + b, 0);

  const emptyColor = WB.categories[0].color;
  const segs = w.map(wi => {
    const prob   = wi / tot * (1 - WB.jackpot.prob);
    const r      = rng();
    const catIdx = _cumCats.findIndex(t => r < t);
    const cat    = WB.categories[Math.max(0, catIdx)];
    // When min === max, skip the second RNG call (preserves seed sequence)
    const mult   = cat.min === cat.max ? cat.min : cat.min + rng() * (cat.max - cat.min);
    const reward = Math.round(mult * WB.spin_cost);
    return { prob, reward, color: reward === 0 ? emptyColor : cat.color };
  });
  segs.push({ prob: WB.jackpot.prob, reward: 0, color: WB.jackpot.color, isJackpot: true });
  return segs;
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
    if (seg.isJackpot) {
      ctx.fillText('FREE',  R - 10, -(fs | 0) * 0.55);
      ctx.fillText('SPINS', R - 10,  (fs | 0) * 0.55);
    } else {
      ctx.fillText(seg.reward === 0 ? '0' : `${seg.reward}`, R - 10, (fs | 0) / 3);
    }
    ctx.restore();

    a += arc;
  });

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
    ctx.fillText(seg.isJackpot ? '★JP' : seg.reward === 0 ? '0' : `${seg.reward}`, R - 4, (fs | 0) / 3);
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

// ── Jackpot Wheel ─────────────────────────────────
function jpArcSizes() {
  const tickets = WB.jackpot.field_tickets;
  const total   = tickets.reduce((a, b) => a + b, 0);
  return tickets.map(t => t / total * Math.PI * 2);
}

function drawJackpotWheel() {
  const canvas = document.getElementById('jackpot-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const S   = canvas.width;
  const cx  = S / 2, cy = S / 2;
  const R   = S / 2 - 26;
  const roundIdx = Math.min(jpRound, WB.jackpot.rounds.length - 1);
  const fields   = WB.jackpot.rounds[roundIdx].fields;
  const arcSizes = jpArcSizes();

  ctx.clearRect(0, 0, S, S);
  ctx.beginPath();
  ctx.arc(cx, cy, R + 10, 0, Math.PI * 2);
  ctx.fillStyle = '#162032';
  ctx.fill();

  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(jpRot);

  let a = -Math.PI / 2;
  fields.forEach((field, i) => {
    if (i >= jpRevealCount) { a += arcSizes[i]; return; }
    const arc = arcSizes[i];
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.arc(0, 0, R, a, a + arc);
    ctx.closePath();
    ctx.fillStyle = WB.jackpot.field_colors[i];
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.45)';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    ctx.save();
    ctx.rotate(a + arc / 2);
    const label = field.end ? 'CASH OUT' : `${field.reward}×`;
    const fs    = field.end ? 18 : 26;
    ctx.font = `bold ${fs}px Segoe UI,sans-serif`;
    ctx.fillStyle = '#fff';
    ctx.shadowColor = 'rgba(0,0,0,.7)';
    ctx.shadowBlur  = 4;
    ctx.textAlign   = 'right';
    ctx.fillText(label, R - 10, fs / 3);
    ctx.restore();
    a += arc;
  });

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

function drawDonWheel(rot) {
  const canvas = document.getElementById('don-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const S   = canvas.width;
  const cx  = S / 2, cy = S / 2;
  const R   = S / 2 - 6;

  ctx.clearRect(0, 0, S, S);
  ctx.beginPath();
  ctx.arc(cx, cy, R + 4, 0, Math.PI * 2);
  ctx.fillStyle = '#162032';
  ctx.fill();

  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(rot);

  let a = -Math.PI / 2;
  DON_SEGS.forEach(seg => {
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
    ctx.font = 'bold 13px Segoe UI,sans-serif';
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'right';
    ctx.fillText(seg.label, R - 5, 5);
    ctx.restore();

    a += arc;
  });

  ctx.restore();

  ctx.beginPath();
  ctx.moveTo(cx - 6, cy - R - 2);
  ctx.lineTo(cx + 6, cy - R - 2);
  ctx.lineTo(cx, cy - R + 8);
  ctx.closePath();
  ctx.fillStyle = '#e53935';
  ctx.fill();
}

function donTargetRot(segIdx) {
  let cum = 0;
  for (let i = 0; i < segIdx; i++) cum += DON_SEGS[i].prob * Math.PI * 2;
  const arc  = DON_SEGS[segIdx].prob * Math.PI * 2;
  const land = cum + arc * 0.2 + Math.random() * arc * 0.6;
  const base = -land;
  const extra = Math.ceil((jpDonRot + Math.PI * 2 * 5 - base) / (Math.PI * 2));
  return base + extra * Math.PI * 2;
}

function animateDonSpin(winIdx, onDone) {
  if (jpDonRaf) cancelAnimationFrame(jpDonRaf);
  const target = donTargetRot(winIdx);
  const start  = jpDonRot;
  const t0     = performance.now();
  const dur    = 1400 + Math.random() * 600;
  function ease(p) { return 1 - Math.pow(1 - p, 5); }
  function frame(now) {
    const t = Math.min((now - t0) / dur, 1);
    jpDonRot = start + (target - start) * ease(t);
    drawDonWheel(jpDonRot);
    if (t >= 1) { jpDonRaf = null; onDone(); }
    else         { jpDonRaf = requestAnimationFrame(frame); }
  }
  jpDonRaf = requestAnimationFrame(frame);
}

export function doubleOrNothing() {
  if (!document.getElementById('don-aktivier')?.classList.contains('is-on')) return;
  if (jpDonUsed) return;
  jpDonUsed = true;
  const btn = document.getElementById('don-btn');
  if (btn) btn.disabled = true;
  initAudio();
  playClick();

  const winIdx = Math.random() < DON_SEGS[0].prob ? 0 : 1;
  animateDonSpin(winIdx, () => {
    const factor = winIdx === 0 ? 2 : 0;
    jpDonFactors.push(factor);
    updateJackpotFormula();
    if (factor === 2) {
      playJackpotChing(2);
    } else {
      for (let i = 0; i < 2; i++) setTimeout(() => playWinSound(0), i * 500);
    }
  });
}

function jpRevealAnimation(onDone) {
  if (jpRevealTimer) clearInterval(jpRevealTimer);
  const n = WB.jackpot.rounds[Math.min(jpRound, WB.jackpot.rounds.length - 1)].fields.length;
  jpRevealCount = 1;
  drawJackpotWheel();
  jpRevealTimer = setInterval(() => {
    jpRevealCount++;
    drawJackpotWheel();
    if (jpRevealCount >= n) {
      clearInterval(jpRevealTimer);
      jpRevealTimer = null;
      onDone();
    }
  }, 300);
}

function updateJackpotFormula() {
  const el = document.getElementById('jackpot-formula');
  if (!el) return;
  const donProduct  = jpDonFactors.reduce((a, b) => a * b, 1);
  const basePayout  = Math.round(WB.spin_cost * jpProduct);
  const finalPayout = Math.round(basePayout * donProduct);

  if (jpMultipliers.length === 0 && jpDonFactors.length === 0) {
    el.textContent = `${WB.spin_cost} 💰`;
    return;
  }

  const donPrefix = jpDonFactors.length > 0 ? jpDonFactors.map(f => `${f}×`).join(' × ') + ' × ' : '';
  el.innerHTML = `${donPrefix}${[WB.spin_cost, ...jpMultipliers].join(' × ')} = <strong>${finalPayout}</strong> 💰`;
}

function showJackpotPanel(round = 0, product = 1) {
  jpRound         = round;
  jpProduct       = product;
  jpMultipliers   = [];
  jpRot           = 0;
  jpDonUsed    = false;
  jpDonFactors = [];
  jpDonRot     = 0;

  document.getElementById('wheel-canvas').classList.add('hidden');
  document.getElementById('jackpot-canvas').classList.remove('hidden');
  document.getElementById('jackpot-header').classList.remove('hidden');
  document.getElementById('wheel-panel-header').textContent = '★ JACKPOT WHEEL ★';
  document.getElementById('jackpot-round-label').textContent = `RUNDE ${round + 1}`;
  updateJackpotFormula();

  document.getElementById('wheel-btn-row').innerHTML =
    `<button id="jackpot-spin-btn" onclick="jackpotSpin()" disabled>&#9654; DREHEN</button>`;
  document.getElementById('jackpot-win').classList.add('hidden');
  document.getElementById('wheel-error').textContent = '';
  document.getElementById('wheel-seed-row').textContent = '';

  const donPanel = document.getElementById('don-aktivier');
  donPanel.classList.remove('is-on');
  document.getElementById('don-aktivier-check').checked = false;
  document.getElementById('don-btn').disabled = false;
  document.getElementById('don-wrap').classList.remove('hidden');
  drawDonWheel(0);

  jpRevealAnimation(() => { document.getElementById('jackpot-spin-btn').disabled = false; });
}

function hideJackpotPanel() {
  document.getElementById('jackpot-canvas').classList.add('hidden');
  document.getElementById('wheel-canvas').classList.remove('hidden');
  document.getElementById('jackpot-header').classList.add('hidden');
  document.getElementById('jackpot-win').classList.add('hidden');
  document.getElementById('don-wrap').classList.add('hidden');
  document.getElementById('wheel-panel-header').textContent = 'WHEEL OF FORTUNE';
}

function jpTargetRot(fieldIdx) {
  const arcSizes = jpArcSizes();
  const start    = arcSizes.slice(0, fieldIdx).reduce((a, b) => a + b, 0);
  const arc      = arcSizes[fieldIdx];
  const land     = start + arc * 0.15 + Math.random() * arc * 0.70;
  const base     = -land;
  const extra    = Math.ceil((jpRot + Math.PI * 2 * 6 - base) / (Math.PI * 2));
  return base + extra * Math.PI * 2;
}

function jpCurrentField(rot) {
  const arcSizes = jpArcSizes();
  const angle    = ((-rot) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2);
  let cum = 0;
  for (let i = 0; i < arcSizes.length; i++) {
    cum += arcSizes[i];
    if (angle < cum) return i;
  }
  return arcSizes.length - 1;
}

function animateJackpotSpin(fieldIdx, onDone) {
  if (jpRaf) cancelAnimationFrame(jpRaf);
  const target   = jpTargetRot(fieldIdx);
  const start    = jpRot;
  const t0       = performance.now();
  const dur      = 1800 + Math.random() * 800;
  function ease(p) { return 1 - Math.pow(1 - p, 5); }
  let lastField  = jpCurrentField(jpRot);
  function frame(now) {
    const t = Math.min((now - t0) / dur, 1);
    jpRot = start + (target - start) * ease(t);
    const curField = jpCurrentField(jpRot);
    if (curField !== lastField) { lastField = curField; playTick(); }
    drawJackpotWheel();
    if (t >= 1 || t > 0.78) { jpRot = target; drawJackpotWheel(); jpRaf = null; onDone(); }
    else                     { jpRaf = requestAnimationFrame(frame); }
  }
  jpRaf = requestAnimationFrame(frame);
}

export async function jackpotSpin() {
  document.getElementById('jackpot-spin-btn').disabled = true;
  document.getElementById('wheel-error').textContent = '';

  const data = await api('POST', '/api/jackpot/spin');
  if (data.error) {
    document.getElementById('wheel-error').textContent = data.error;
    document.getElementById('jackpot-spin-btn').disabled = false;
    return;
  }

  animateJackpotSpin(data.fieldIndex, () => {
    if (data.end) {
      for (let i = 0; i < 3; i++) setTimeout(() => playWinSound(0), i * 500);
    } else {
      playJackpotChing(data.round + 1);
    }

    const roundIdx = Math.min(jpRound, WB.jackpot.rounds.length - 1);
    const field    = WB.jackpot.rounds[roundIdx].fields[data.fieldIndex];
    const label    = field.end ? 'CASH OUT' : `${field.reward}×`;
    animateSelect({
      canvas: document.getElementById('jackpot-canvas'),
      frozenRot: jpRot,
      winIdx: data.fieldIndex,
      arcSizes: jpArcSizes(),
      colors: WB.jackpot.field_colors,
      label,
      onDone: () => {
        if (data.end) {
          const donProduct   = jpDonFactors.reduce((a, b) => a * b, 1);
          const finalPayout  = Math.round(data.total * donProduct);
          const adjustedGold = data.gold + Math.round(data.total * (donProduct - 1));
          const winEl = document.getElementById('jackpot-win');
          winEl.textContent = `★ +${finalPayout} GOLD ★`;
          winEl.classList.remove('hidden');
          slData.unshift({ spunAt: new Date().toISOString(), seed: 'JACKPOT', reward: finalPayout, segmentIdx: null, isJackpotEntry: true });
          renderWheelLog();
          setGold(adjustedGold);
          setTimeout(() => {
            hideJackpotPanel();
            wheelGenerate();
          }, 3500);
        } else {
          jpRound    = data.round;
          jpProduct  = data.accumulated;
          jpMultipliers.push(data.multiplier);
          jpDonUsed = false;
          updateJackpotFormula();
          const labelEl = document.getElementById('jackpot-round-label');
          labelEl.textContent = `RUNDE ${data.round + 1}`;
          labelEl.classList.remove('jp-round-pulse');
          void labelEl.offsetWidth;
          labelEl.classList.add('jp-round-pulse');
          jpRevealAnimation(() => {
            document.getElementById('jackpot-spin-btn').disabled = false;
            if (document.getElementById('don-aktivier')?.classList.contains('is-on')) {
              document.getElementById('don-btn').disabled = false;
            }
          });
        }
      },
    });
  });
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
  const dur    = 2500 + Math.random() * 1500;
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
    if (t >= 1 || t > 0.75) { wheelRot = target; drawWheel(); wheelRaf = null; onDone(); }
    else                     { wheelRaf = requestAnimationFrame(frame); }
  }
  wheelRaf = requestAnimationFrame(frame);
}

function animateSelect({ canvas, frozenRot, winIdx, arcSizes, colors, label, onDone }) {
  const S   = canvas.width;
  const cx  = S / 2, cy = S / 2;
  const R   = S / 2 - 26;
  const ctx = canvas.getContext('2d');

  const cum = [0];
  for (let i = 0; i < arcSizes.length; i++) cum.push(cum[i] + arcSizes[i]);

  // Normalize winning slice mid-angle to [-π, π] for shortest text rotation
  const θRaw = frozenRot - Math.PI / 2 + cum[winIdx] + arcSizes[winIdx] / 2;
  const θ    = ((θRaw + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;

  const lp  = (a, b, t) => a + (b - a) * t;
  const ez  = p => 1 - Math.pow(1 - p, 3);
  const lines = label.split('\n');
  const t0  = performance.now();

  function frame(now) {
    const p  = Math.min((now - t0) / 500, 1);
    const et = ez(p);

    ctx.clearRect(0, 0, S, S);
    ctx.beginPath();
    ctx.arc(cx, cy, R + 10, 0, Math.PI * 2);
    ctx.fillStyle = '#162032';
    ctx.fill();

    ctx.save();
    ctx.translate(cx, cy);

    // Frozen non-winning slices (will get covered by expanding winner)
    let a = frozenRot - Math.PI / 2;
    arcSizes.forEach((arc, i) => {
      if (i !== winIdx) {
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.arc(0, 0, R, a, a + arc);
        ctx.closePath();
        ctx.fillStyle = colors[i];
        ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.45)';
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }
      a += arc;
    });

    // Winning slice expanding symmetrically about its midpoint
    const winArc = lp(arcSizes[winIdx], Math.PI * 2, et);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.arc(0, 0, R, θ - winArc / 2, θ + winArc / 2);
    ctx.closePath();
    ctx.fillStyle = colors[winIdx];
    ctx.fill();
    if (winArc < Math.PI * 1.99) {
      ctx.strokeStyle = 'rgba(255,255,255,0.45)';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }

    // Label: moves from slice area toward center, rotates to horizontal, grows
    const tx  = lp(0.65 * R * Math.cos(θ), 0, et);
    const ty  = lp(0.65 * R * Math.sin(θ), 0, et);
    const fs  = lp(26, 60, et) | 0;
    const rot = lp(θ, 0, et);

    ctx.save();
    ctx.translate(tx, ty);
    ctx.rotate(rot);
    ctx.font         = `bold ${fs}px Segoe UI,sans-serif`;
    ctx.fillStyle    = '#fff';
    ctx.shadowColor  = 'rgba(0,0,0,.7)';
    ctx.shadowBlur   = 4;
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    const lineH = fs * 1.15;
    lines.forEach((line, li) => {
      ctx.fillText(line, 0, (li - (lines.length - 1) / 2) * lineH);
    });
    ctx.restore();

    ctx.restore();

    // Pointer arrow (fixed)
    ctx.beginPath();
    ctx.moveTo(cx - 15, cy - R - 4);
    ctx.lineTo(cx + 15, cy - R - 4);
    ctx.lineTo(cx, cy - R + 22);
    ctx.closePath();
    ctx.fillStyle   = '#e53935';
    ctx.fill();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth   = 2;
    ctx.stroke();

    if (p < 1) requestAnimationFrame(frame);
    else        setTimeout(onDone, 300);
  }

  requestAnimationFrame(frame);
}

// ── UI helpers ────────────────────────────────────
function renderWheelButtons() {
  document.getElementById('wheel-btn-row').innerHTML =
    `<button id="wbtn-spin" onclick="wheelSpin()">&#9654; SPIN <span class="wheel-cost">${WB.spin_cost} &#128176;</span></button>`;
  setTimeout(() => document.getElementById('wbtn-spin')?.focus(), 50);
}

function setWheelBtnsDisabled(on) {
  document.querySelectorAll('#wheel-btn-row button').forEach(b => b.disabled = on);
}

function updateSeedRow() {
  const row = document.getElementById('wheel-seed-row');
  if (!row) return;
  if (previewActive) {
    row.innerHTML =
      `<span class="seed-val seed-preview">${previewSeed}</span>
       <button class="seed-icon-btn" title="Anderen Seed" onclick="openSeedLookup()">&#128269;</button>
       <button class="seed-exit-btn" title="Vorschau beenden" onclick="exitSeedPreview()">&#10005;</button>`;
  } else if (currentSeed) {
    row.innerHTML =
      `<span class="seed-val">${currentSeed}</span>
       <button class="seed-icon-btn" title="Seed nachschlagen" onclick="openSeedLookup()">&#128269;</button>`;
  } else {
    row.innerHTML = '';
  }
}

export function openSeedLookup() {
  const row = document.getElementById('wheel-seed-row');
  row.innerHTML =
    `<input id="seed-lookup-input" class="seed-lookup-input" type="number" placeholder="Seed eingeben…" />
     <button class="seed-exit-btn" title="Abbrechen" onclick="cancelSeedLookup()">&#10005;</button>`;
  const inp = document.getElementById('seed-lookup-input');
  inp?.focus();
  inp?.addEventListener('keydown', e => { if (e.key === 'Enter') applySeedLookup(); });
}

export function applySeedLookup() {
  const val = document.getElementById('seed-lookup-input')?.value.trim();
  if (!val || isNaN(parseInt(val, 10))) { cancelSeedLookup(); return; }
  if (!previewActive) {
    previewSaved = { segs: wheelSegs, rot: wheelRot };
    previewActive = true;
  }
  previewSeed = val;
  wheelSegs = buildWheelV1(val);
  wheelRot  = 0;
  drawWheel();
  updateSeedRow();
  document.getElementById('wheel-btn-row').innerHTML = '';
}

export function cancelSeedLookup() {
  updateSeedRow();
  if (!previewActive) renderWheelButtons();
}

export function exitSeedPreview() {
  previewActive = false;
  previewSeed   = null;
  if (previewSaved) {
    wheelSegs = previewSaved.segs;
    wheelRot  = previewSaved.rot;
    previewSaved = null;
    drawWheel();
    updateSeedRow();
    renderWheelButtons();
  } else {
    wheelGenerate();
  }
}

// ── Public API ────────────────────────────────────
export async function loadWheel() {
  const [data, jpData] = await Promise.all([
    api('GET', '/api/wheel'),
    api('GET', '/api/jackpot'),
  ]);
  setGold(data.gold);
  if (data.seed) {
    currentSeed = data.seed;
    wheelSegs = buildWheelV1(data.seed);
    drawWheel();
    updateSeedRow();
    renderWheelButtons();
  } else {
    wheelGenerate();
  }

  document.getElementById('wheel-error').textContent = '';
  if (jpData.active) showJackpotPanel(jpData.round, parseFloat(jpData.accumulated));
  loadWheelLog();
}

export async function wheelGenerate() {
  setWheelBtnsDisabled(true);
  document.getElementById('wheel-error').textContent = '';
  const data = await api('POST', '/api/wheel/generate');
  if (data.error) {
    document.getElementById('wheel-error').textContent = data.error;
    return;
  }
  currentSeed = data.seed;
  previewActive = false;
  previewSeed   = null;
  previewSaved  = null;
  wheelSegs = buildWheelV1(data.seed);
  wheelRot  = 0;
  drawWheel();
  document.getElementById('wheel-gold').textContent = `${data.gold} 💰`;
  updateSeedRow();
  renderWheelButtons();
}

export async function wheelSpin() {
  if (!wheelSegs) return;
  initAudio();
  playClick();
  setWheelBtnsDisabled(true);

  document.getElementById('wheel-error').textContent = '';

  const data = await api('POST', '/api/wheel/spin');
  if (data.error) {
    document.getElementById('wheel-error').textContent = data.error;
    setWheelBtnsDisabled(false);
    return;
  }

  animateSpin(data.segmentIndex, () => {
    if (data.jackpot) playJackpotChing(5);
    else              playWinSound(data.reward);

    const seg      = wheelSegs[data.segmentIndex];
    const arcSizes = wheelSegs.map(s => s.prob * Math.PI * 2);
    const label    = seg.isJackpot ? 'FREE\nSPINS' : seg.reward === 0 ? '0' : `${seg.reward}`;
    animateSelect({
      canvas: document.getElementById('wheel-canvas'),
      frozenRot: wheelRot,
      winIdx: data.segmentIndex,
      arcSizes,
      colors: wheelSegs.map(s => s.color),
      label,
      onDone: () => {
        setGold(data.gold);
        wheelSegs = null;
        document.getElementById('wheel-seed-row').textContent = '';
        if (data.jackpot) {
          setTimeout(() => showJackpotPanel(0, 1), 800);
        } else {
          wheelGenerate();
        }
        loadWheelLog();
      },
    });
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
          const date = new Date(e.spunAt).toLocaleString('de-DE');
          if (e.isJackpotEntry) {
            return `<tr>
              <td class="col-num">${date}</td>
              <td class="log-seed" style="color:#e8c84a;font-weight:700">★ JACKPOT</td>
              <td class="col-num log-jackpot">+${e.reward} &#127922;</td>
              <td></td>
            </tr>`;
          }
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
