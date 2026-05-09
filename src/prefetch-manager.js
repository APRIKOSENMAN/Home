// Generic prefetch manager — framework-agnostic, no external dependencies.
// Works in browser and Node.js.

export function createPrefetcher({ fetch: fetchFn, maxAge, onError }) {
  let status    = 'idle';   // 'idle' | 'loading' | 'ready' | 'expired' | 'error'
  let promise   = null;
  let data      = null;
  let fetchedAt = null;

  function _isExpired() {
    return fetchedAt !== null && (Date.now() - fetchedAt) > maxAge;
  }

  function _doFetch() {
    status  = 'loading';
    promise = Promise.resolve()
      .then(() => fetchFn())
      .then(result => {
        data      = result;
        fetchedAt = Date.now();
        status    = 'ready';
        promise   = null;
        return result;
      })
      .catch(err => {
        status  = 'error';
        promise = null;
        onError?.(err);
        throw err;
      });
    return promise;
  }

  return {
    // Start background load. No-op if already loading or freshly cached.
    prime() {
      if (status === 'loading') return;
      if (status === 'ready' && !_isExpired()) return;
      _doFetch();
    },

    // Return cached data (instant), wait for in-flight fetch, or start fresh.
    consume() {
      if (status === 'ready' && !_isExpired()) return Promise.resolve(data);
      if (status === 'loading') return promise;
      // idle, expired, error → fetch now
      return _doFetch();
    },

    // Discard cache so next consume() fetches fresh. Ignores in-flight loads.
    invalidate() {
      if (status === 'loading') return;
      status    = 'idle';
      data      = null;
      fetchedAt = null;
    },

    getStatus() { return status; },
  };
}
