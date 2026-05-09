import { createPrefetcher } from './prefetch-manager.js';

export const traderPrefetch = createPrefetcher({
  fetch: () => fetch('/api/trade/prefetch', { method: 'POST' }).then(r => {
    if (!r.ok) throw new Error(`Prefetch ${r.status}`);
    return r.json();
  }),
  maxAge: 10 * 60 * 1000,
  onError: err => console.warn('Trader prefetch failed:', err),
});
