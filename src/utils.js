export function updateCharCount(el) {
  const wrap  = el.closest('.field-wrap');
  if (!wrap) return;
  const max   = parseInt(el.maxLength);
  const len   = el.value.length;
  const pct   = len / max;
  const counter = wrap.querySelector('.char-count');
  const fill    = wrap.querySelector('.char-fill');
  if (!counter || !fill) return;
  counter.textContent = `${len}/${max}`;
  fill.style.width = (pct * 100) + '%';
  const warn  = pct >= 0.8;
  const limit = pct >= 1;
  counter.className = 'char-count' + (el.tagName === 'TEXTAREA' ? ' char-count-area' : '') + (limit ? ' limit' : warn ? ' warn' : '');
  fill.className    = 'char-fill' + (limit ? ' limit' : warn ? ' warn' : '');
}

export function checkPublishable() {
  const title = document.getElementById('post-title');
  const body  = document.getElementById('post-body');
  const btn   = document.getElementById('publish-btn');
  if (!btn) return;
  const ok = title.value.trim().length > 0 && body.value.trim().length > 0
          && title.value.length <= 100 && body.value.length <= 1000;
  btn.disabled = !ok;
  btn.classList.toggle('btn-disabled', !ok);
}
