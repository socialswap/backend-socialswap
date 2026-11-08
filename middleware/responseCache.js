// In-memory cache for public read routes. Each database query costs a network round
// trip, so serving repeat reads from here is much faster. All writes pass through this
// server, so clearing on write keeps data fresh. The TTL is only a safety net for
// changes made directly in the database.

const MAX_ENTRIES = 300;

// Writes to these paths never change cached public data
const WRITES_THAT_KEEP_CACHE = /^\/api\/(auth|cart|chat|push|contact|create-order)\b|^\/api\/blogs\/[^/]+\/views$/;

const store = new Map();
let generation = 0;

const clearResponseCache = () => {
  store.clear();
  generation += 1;
};

const responseCache = (ttlSeconds) => (req, res, next) => {
  const key = req.originalUrl;
  const cached = store.get(key);

  if (cached && cached.expiresAt > Date.now()) {
    res.set('X-Cache', 'HIT');
    return res.type('json').send(cached.body);
  }

  const startedGeneration = generation;
  const sendJson = res.json.bind(res);

  res.json = (payload) => {
    // Skip saving if a write finished while this read was running
    if (res.statusCode === 200 && startedGeneration === generation) {
      store.delete(key);
      if (store.size >= MAX_ENTRIES) store.delete(store.keys().next().value);
      store.set(key, { body: JSON.stringify(payload), expiresAt: Date.now() + ttlSeconds * 1000 });
    }
    res.set('X-Cache', 'MISS');
    return sendJson(payload);
  };

  return next();
};

const clearCacheOnWrite = (req, res, next) => {
  const isWrite = req.method !== 'GET' && req.method !== 'HEAD';

  if (isWrite && !WRITES_THAT_KEEP_CACHE.test(req.originalUrl.split('?')[0])) {
    res.on('finish', () => {
      if (res.statusCode < 400) clearResponseCache();
    });
  }

  next();
};

module.exports = { responseCache, clearCacheOnWrite, clearResponseCache };
