let locale = {};

export async function loadLocale(lang = 'en') {
  locale = await fetch(`/data/locales/${lang}.json`).then(r => r.json());
}

export function t(key) {
  return locale[key] ?? key;
}
