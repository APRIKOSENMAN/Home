let locale = {};

export async function loadLocale(lang = 'en') {
  locale = await fetch(`/data/locales/${lang}.json`).then(r => r.json());
}

export function t(key) {
  return locale[key] ?? key;
}

export function applyI18n() {
  document.querySelectorAll('[data-i18n]').forEach(el => {
    el.textContent = t(el.dataset.i18n);
  });
}
