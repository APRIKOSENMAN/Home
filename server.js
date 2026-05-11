import 'dotenv/config';
import dns            from 'dns';
import express        from 'express';
import session        from 'express-session';
import bcrypt         from 'bcryptjs';
import { Pool }       from 'pg';
import { randomUUID } from 'crypto';
import { execSync }   from 'child_process';
import path           from 'path';
import fs             from 'fs';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
import WB from './shared/wheel-balance.js';
import { calculateSellPrice, calculateBuyPrice, calculateSessionPrices, updateAvgBuyPrice } from './shared/trade-pricing.js';
import { executeTransaction, getUserState } from './currency-manager.js';

dns.setDefaultResultOrder('ipv4first');

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const _require   = createRequire(import.meta.url);

const BUILDINGS     = _require('./data/buildings.json');
const RECIPES       = _require('./data/recipes.json');
const ITEMS         = _require('./data/items.json');
const TRADE_BALANCE = _require('./trade-balance-public.json');
const LOCALES       = _require('./data/locales/en.json');
const PKG_VERSION   = _require('./package.json').version;

function parseDuration(str) {
  if (typeof str === 'number') return str;
  const match = str.match(/^(\d+)(ms|s|m|h)$/);
  if (!match) return 0;
  const units = { ms: 1, s: 1000, m: 60000, h: 3600000 };
  return parseInt(match[1]) * units[match[2]];
}

function getBuildingRecipe(type) {
  const building = BUILDINGS[type];
  if (!building) return null;
  const recipe = RECIPES[building.recipe];
  if (!recipe) return null;
  return { ...recipe, durationMs: parseDuration(recipe.duration) };
}

// ── Wheel helpers ─────────────────────────────────
function mulberry32(seed) {
  seed = seed >>> 0;
  return function() {
    seed = (seed + 0x6D2B79F5) >>> 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Must stay in sync with client buildWheelV1
function wheelSegments(seedStr) {
  const rng = mulberry32(parseInt(seedStr, 10));

  const n   = Math.floor(rng() * WB.segments.count_range) + WB.segments.count_min;
  const w   = Array.from({length: n}, () => WB.segments.weight_min + rng() * WB.segments.weight_range);
  const tot = w.reduce((a, b) => a + b, 0);

  let cum = 0;
  const cumCats = WB.categories.map(c => { cum += c.prob; return cum; });

  const segs = w.map(wi => {
    const prob   = wi / tot * (1 - WB.jackpot.prob);
    const r      = rng();
    const catIdx = cumCats.findIndex(t => r < t);
    const cat    = WB.categories[Math.max(0, catIdx)];
    // When min === max, skip the second RNG call (preserves seed sequence)
    const mult   = cat.min === cat.max ? cat.min : cat.min + rng() * (cat.max - cat.min);
    const reward = Math.round(mult * WB.spin_cost);
    return { prob, reward };
  });
  segs.push({ prob: WB.jackpot.prob, reward: 0 }); // jackpot (reserved, does nothing yet)
  return segs;
}

const app  = express();
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function initDb() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      username   TEXT PRIMARY KEY,
      password   TEXT NOT NULL,
      gold       INTEGER DEFAULT 100,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS posts (
      id         TEXT PRIMARY KEY,
      title      TEXT NOT NULL,
      body       TEXT NOT NULL,
      author     TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS votes (
      post_id  TEXT NOT NULL,
      username TEXT NOT NULL,
      vote     TEXT NOT NULL,
      PRIMARY KEY (post_id, username)
    );
  `);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS gold         INTEGER DEFAULT 100;`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS wheel_seed    TEXT    DEFAULT NULL;`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS wheel_version INTEGER DEFAULT 1;`);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS spin_log (
      id          SERIAL PRIMARY KEY,
      username    TEXT NOT NULL,
      seed        TEXT NOT NULL,
      version     INTEGER NOT NULL DEFAULT 1,
      segment_idx INTEGER NOT NULL,
      reward      INTEGER NOT NULL,
      spun_at     TIMESTAMPTZ DEFAULT NOW()
    );
  `);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS daily_last_claimed TIMESTAMPTZ DEFAULT NULL;`);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS jackpot_sessions (
      username    TEXT PRIMARY KEY,
      round       INTEGER      NOT NULL DEFAULT 0,
      accumulated DECIMAL(12,4) NOT NULL DEFAULT 1,
      started_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
    );
  `);
  await pool.query(`ALTER TABLE jackpot_sessions ALTER COLUMN accumulated TYPE DECIMAL(12,4) USING accumulated::DECIMAL(12,4)`);
  await pool.query(`ALTER TABLE jackpot_sessions ALTER COLUMN accumulated SET DEFAULT 1`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS premium_currency INTEGER DEFAULT 0;`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS gems INTEGER DEFAULT 0;`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();`);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS unplaced_buildings (
      username TEXT NOT NULL,
      type     TEXT NOT NULL,
      quantity INT  NOT NULL DEFAULT 0,
      PRIMARY KEY (username, type)
    );
    CREATE TABLE IF NOT EXISTS city_buildings (
      id       SERIAL PRIMARY KEY,
      username TEXT NOT NULL,
      type     TEXT NOT NULL,
      x        INT  NOT NULL,
      y        INT  NOT NULL
    );
    CREATE TABLE IF NOT EXISTS building_jobs (
      id          SERIAL PRIMARY KEY,
      building_id INT  NOT NULL REFERENCES city_buildings(id) ON DELETE CASCADE,
      started_at  TIMESTAMPTZ DEFAULT NOW(),
      completed   BOOL DEFAULT FALSE
    );
    CREATE TABLE IF NOT EXISTS storage_items (
      username  TEXT NOT NULL,
      item_type TEXT NOT NULL,
      quantity  INT  NOT NULL DEFAULT 0,
      PRIMARY KEY (username, item_type)
    );
  `);
  // Add avg buy price tracking columns (idempotent)
  await pool.query(`ALTER TABLE storage_items ADD COLUMN IF NOT EXISTS avg_buy_price DECIMAL(10,2) DEFAULT 0`);
  await pool.query(`ALTER TABLE storage_items ADD COLUMN IF NOT EXISTS paid_quantity INTEGER DEFAULT 0`);
  // Migrate old German IDs to English placeholder IDs
  await pool.query(`UPDATE unplaced_buildings SET type = 'building_001' WHERE type = 'goldbarren_giesserei'`);
  await pool.query(`UPDATE city_buildings     SET type = 'building_001' WHERE type = 'goldbarren_giesserei'`);
  await pool.query(`UPDATE storage_items SET item_type = 'material_001' WHERE item_type = 'goldbarren'`);
  // Migrate material_xxx → item_xxx
  for (const n of ['001','002','003','004','005','006','007','008','900','901']) {
    await pool.query(`UPDATE storage_items SET item_type='item_${n}' WHERE item_type='material_${n}'`);
  }

  // Drop legacy static-market tables (replaced by dynamic session system)
  await pool.query(`DROP TABLE IF EXISTS trade_log`);
  await pool.query(`DROP TABLE IF EXISTS trader_inventory`);
  await pool.query(`DROP TABLE IF EXISTS traders`);

  // Dynamic trade session tables
  await pool.query(`
    CREATE TABLE IF NOT EXISTS trade_sessions (
      id           SERIAL PRIMARY KEY,
      username     TEXT NOT NULL REFERENCES users(username),
      session_id   TEXT NOT NULL UNIQUE,
      created_at   TIMESTAMPTZ DEFAULT NOW(),
      expires_at   TIMESTAMPTZ NOT NULL,
      status       TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','expired','completed','prefetched')),
      last_sync_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_trade_sessions_user   ON trade_sessions(username);
    CREATE INDEX IF NOT EXISTS idx_trade_sessions_status ON trade_sessions(status);
  `);
  // Allow 'prefetched' status (idempotent migration for existing databases)
  await pool.query(`ALTER TABLE trade_sessions DROP CONSTRAINT IF EXISTS trade_sessions_status_check`);
  await pool.query(`ALTER TABLE trade_sessions ADD CONSTRAINT trade_sessions_status_check CHECK (status IN ('active','expired','completed','prefetched'))`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS trade_session_stocks (
      id            SERIAL PRIMARY KEY,
      session_id    TEXT NOT NULL REFERENCES trade_sessions(session_id) ON DELETE CASCADE,
      item_type     TEXT NOT NULL,
      initial_stock INT  NOT NULL,
      current_stock INT  NOT NULL,
      UNIQUE (session_id, item_type)
    );
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS trade_session_log (
      id                  SERIAL PRIMARY KEY,
      session_id          TEXT NOT NULL REFERENCES trade_sessions(session_id),
      username            TEXT NOT NULL,
      sync_number         INT  NOT NULL,
      items_sold          JSONB,
      items_bought        JSONB,
      gold_delta          INT  NOT NULL DEFAULT 0,
      client_calculation  JSONB,
      server_calculation  JSONB,
      discrepancy         BOOLEAN DEFAULT FALSE,
      created_at          TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE (session_id, sync_number)
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS trade_session_summary (
      id         SERIAL PRIMARY KEY,
      session_id TEXT NOT NULL,
      username   TEXT NOT NULL,
      summary    JSONB NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);

  // Currency Transaction Audit Log
  await pool.query(`
    CREATE TABLE IF NOT EXISTS currency_transactions (
      id          SERIAL PRIMARY KEY,
      username    TEXT NOT NULL REFERENCES users(username),
      action      TEXT NOT NULL,
      delta_json  TEXT NOT NULL,
      reason      TEXT,
      created_at  TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_currency_trans_user ON currency_transactions(username);
    CREATE INDEX IF NOT EXISTS idx_currency_trans_action ON currency_transactions(action);
  `);

}

app.use(express.json());
// Serve static files (index.html, src/, data/, shared/)
app.use(express.static(path.join(__dirname)));
app.use(session({
  secret: 'geheim-schluessel-hier-aendern',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 1000 * 60 * 60 * 24 }
}));

function requireAuth(req, res, next) {
  if (!req.session.username) return res.status(401).json({ error: 'Nicht eingeloggt' });
  next();
}

// ── Auth ──────────────────────────────────────────

app.post('/api/register', async (req, res) => {
  const username = req.body.username?.trim().toLowerCase();
  const { password } = req.body;
  if (!username || !password)  return res.status(400).json({ error: 'Felder fehlen' });
  if (username.length < 3)     return res.status(400).json({ error: 'Benutzername zu kurz (min. 3 Zeichen)' });
  if (password.length < 6)     return res.status(400).json({ error: 'Passwort zu kurz (min. 6 Zeichen)' });

  try {
    const hash = await bcrypt.hash(password, 10);
    await pool.query('INSERT INTO users (username, password, gold) VALUES ($1, $2, 100)', [username, hash]);
    res.json({ ok: true });
  } catch (e) {
    if (e.code === '23505') return res.status(409).json({ error: 'Benutzername bereits vergeben' });
    throw e;
  }
});

app.post('/api/login', async (req, res) => {
  const username = req.body.username?.trim().toLowerCase();
  const { password } = req.body;
  const { rows } = await pool.query('SELECT * FROM users WHERE username = $1', [username]);
  const user = rows[0];
  if (!user || !(await bcrypt.compare(password, user.password))) {
    return res.status(401).json({ error: 'Falscher Benutzername oder Passwort' });
  }
  req.session.username = user.username;
  res.json({ ok: true, username: user.username });
});

app.post('/api/login-test', async (req, res) => {
  const username = 'testuser';
  const { rows } = await pool.query('SELECT username FROM users WHERE username=$1', [username]);
  if (!rows[0]) {
    const hash = await bcrypt.hash('testuser', 10);
    await pool.query('INSERT INTO users (username, password, gold) VALUES ($1, $2, 100000)', [username, hash]);
    for (const itemType of Object.keys(ITEMS)) {
      await pool.query(
        'INSERT INTO storage_items (username, item_type, quantity) VALUES ($1, $2, 1000) ON CONFLICT DO NOTHING',
        [username, itemType]
      );
    }
  }
  req.session.username = username;
  res.json({ ok: true, username });
});

app.post('/api/logout', (req, res) => { req.session.destroy(); res.json({ ok: true }); });
app.get('/api/me', (req, res) => res.json({ user: req.session.username || null }));
// ── Version ───────────────────────────────────

app.get('/api/version', async (req, res) => {
  try {
    const version = PKG_VERSION;
    let commits = [];

    try {
      // Try to get git log if available
      const output = execSync('git log --oneline -30 --pretty=format:"%h|%an|%ai|%s"', {
        cwd: __dirname,
        encoding: 'utf-8'
      });
      
      commits = output.trim().split('\n').filter(Boolean).map(line => {
        const [hash, author, date, ...messageParts] = line.split('|');
        const message = messageParts.join('|');
        return { hash, message, author, date };
      });
    } catch (e) {
      // Git not available or error - return empty
      console.log('Git log not available');
    }

    res.json({ version, commits });
  } catch (error) {
    console.error('GET /api/version error:', error);
    res.status(500).json({ error: 'Fehler beim Abrufen der Version' });
  }
});
// ── Currency System ───────────────────────────────

/**
 * GET /api/user
 * Returns complete user state: wallet, inventory, buildings
 */
app.get('/api/user', requireAuth, async (req, res) => {
  try {
    const state = await getUserState(pool, req.session.username);
    if (!state) return res.status(404).json({ error: 'Benutzer nicht gefunden' });
    res.json(state);
  } catch (error) {
    console.error('GET /api/user error:', error);
    res.status(500).json({ error: 'Fehler beim Abrufen des Benutzers' });
  }
});

/**
 * POST /api/transaction
 * Execute a currency transaction
 * Body: { action, payload }
 */
app.post('/api/transaction', requireAuth, async (req, res) => {
  const { action, payload } = req.body;
  
  if (!action) return res.status(400).json({ error: 'action erforderlich' });
  if (!payload || typeof payload !== 'object') {
    return res.status(400).json({ error: 'payload erforderlich' });
  }

  try {
    const result = await executeTransaction(pool, req.session.username, action, payload);
    
    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }

    res.json({
      success: true,
      transaction: {
        action,
        timestamp: new Date().toISOString()
      },
      newWallet: result.newState
    });
  } catch (error) {
    console.error('POST /api/transaction error:', error);
    res.status(500).json({ error: 'Transaktionsfehler' });
  }
});

/**
 * GET /api/user/transactions
 * Returns transaction history for the current user
 */
app.get('/api/user/transactions', requireAuth, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT action, delta_json as delta, reason, created_at as "createdAt"
       FROM currency_transactions
       WHERE username = $1
       ORDER BY created_at DESC
       LIMIT 100`,
      [req.session.username]
    );
    res.json(rows);
  } catch (error) {
    console.error('GET /api/user/transactions error:', error);
    res.status(500).json({ error: 'Fehler beim Laden der Transaktionen' });
  }
});

// ── Posts ─────────────────────────────────────────

app.get('/api/posts', requireAuth, async (req, res) => {
  const author = req.query.author?.toLowerCase();
  const me     = req.session.username;

  const sql = `
    SELECT p.*,
      COUNT(CASE WHEN v.vote = 'up'   THEN 1 END)::int AS upvotes,
      COUNT(CASE WHEN v.vote = 'down' THEN 1 END)::int AS downvotes,
      MAX(CASE WHEN v.username = $1 THEN v.vote END)    AS "userVote",
      COALESCE(
        json_agg(
          CASE WHEN v.username IS NOT NULL
          THEN json_build_object('username', v.username, 'vote', v.vote)
          END
        ) FILTER (WHERE v.username IS NOT NULL),
        '[]'
      ) AS voters
    FROM posts p
    LEFT JOIN votes v ON v.post_id = p.id
    ${author ? 'WHERE p.author = $2' : ''}
    GROUP BY p.id
    ORDER BY p.created_at DESC
  `;

  const params = author ? [me, author] : [me];
  const { rows } = await pool.query(sql, params);
  res.json(rows.map(r => ({ ...r, userVote: r.userVote || null })));
});

app.post('/api/posts', requireAuth, async (req, res) => {
  const { title, body } = req.body;
  if (!title || !body) return res.status(400).json({ error: 'Titel und Inhalt erforderlich' });

  const { rows } = await pool.query(
    'INSERT INTO posts (id, title, body, author) VALUES ($1, $2, $3, $4) RETURNING *',
    [randomUUID(), title, body, req.session.username]
  );

  // +10 Gold für neuen Post
  await pool.query('UPDATE users SET gold = gold + 10 WHERE username = $1', [req.session.username]);

  res.json({ ...rows[0], upvotes: 0, downvotes: 0, userVote: null, voters: [] });
});

app.post('/api/posts/:id/vote', requireAuth, async (req, res) => {
  const { id }          = req.params;
  const { vote: newVote } = req.body;
  const username        = req.session.username;

  // Post-Autor holen
  const { rows: pRows } = await pool.query('SELECT author FROM posts WHERE id = $1', [id]);
  if (!pRows[0]) return res.status(404).json({ error: 'Post nicht gefunden' });
  const author = pRows[0].author;

  if (author === username) return res.status(403).json({ error: 'Eigene Posts können nicht bewertet werden' });

  // Bestehenden Vote holen
  const { rows: vRows } = await pool.query(
    'SELECT vote FROM votes WHERE post_id = $1 AND username = $2', [id, username]
  );
  const oldVote = vRows[0]?.vote || null;

  // Gold-Delta berechnen
  let goldDelta = 0;
  if (oldVote === 'up')   goldDelta -= 1;
  if (oldVote === 'down') goldDelta += 1;
  if (newVote === 'up')   goldDelta += 1;
  if (newVote === 'down') goldDelta -= 1;

  // Vote aktualisieren
  if (!newVote) {
    await pool.query('DELETE FROM votes WHERE post_id = $1 AND username = $2', [id, username]);
  } else {
    await pool.query(
      'INSERT INTO votes (post_id, username, vote) VALUES ($1, $2, $3) ON CONFLICT (post_id, username) DO UPDATE SET vote = $3',
      [id, username, newVote]
    );
  }

  // Gold beim Autor aktualisieren (minimum 0, eigene Posts ausgenommen)
  if (goldDelta !== 0 && author !== username) {
    await pool.query(
      'UPDATE users SET gold = GREATEST(0, gold + $1) WHERE username = $2',
      [goldDelta, author]
    );
  }

  res.json({ ok: true });
});

app.delete('/api/posts/:id', requireAuth, async (req, res) => {
  const { id }     = req.params;
  const username   = req.session.username;

  const { rows } = await pool.query('SELECT author FROM posts WHERE id = $1', [id]);
  if (!rows[0]) return res.status(404).json({ error: 'Post nicht gefunden' });
  if (rows[0].author !== username) return res.status(403).json({ error: 'Nicht erlaubt' });

  // Reverse vote-based gold and post gold
  const { rows: voteRows } = await pool.query(
    `SELECT COUNT(CASE WHEN vote='up' THEN 1 END)::int   AS ups,
            COUNT(CASE WHEN vote='down' THEN 1 END)::int AS downs
     FROM votes WHERE post_id = $1`, [id]
  );
  const goldDelta = 10 + (voteRows[0].ups - voteRows[0].downs);
  await pool.query('UPDATE users SET gold = GREATEST(0, gold - $1) WHERE username = $2', [goldDelta, username]);

  await pool.query('DELETE FROM votes WHERE post_id = $1', [id]);
  await pool.query('DELETE FROM posts WHERE id = $1', [id]);

  res.json({ ok: true });
});

// ── Profil ────────────────────────────────────────

app.get('/api/profile/:username', requireAuth, async (req, res) => {
  const username = req.params.username.toLowerCase();
  const { rows: u } = await pool.query('SELECT * FROM users WHERE username = $1', [username]);
  if (!u[0]) return res.status(404).json({ error: 'User nicht gefunden' });

  const { rows: s } = await pool.query(`
    SELECT
      COUNT(DISTINCT p.id)::int                         AS "postCount",
      COUNT(CASE WHEN v.vote = 'up'   THEN 1 END)::int AS "likesReceived",
      COUNT(CASE WHEN v.vote = 'down' THEN 1 END)::int AS "dislikesReceived"
    FROM posts p
    LEFT JOIN votes v ON v.post_id = p.id
    WHERE p.author = $1
  `, [username]);

  const { rows: rankRow } = await pool.query(
    `SELECT COUNT(*)::int + 1 AS rank FROM users WHERE gold > (SELECT gold FROM users WHERE username = $1)`,
    [username]
  );

  const { rows: wl } = await pool.query(
    `SELECT COUNT(*)::int AS "spinCount", COALESCE(MAX(reward), 0)::int AS "bestReward"
     FROM spin_log WHERE username = $1`,
    [username]
  );

  res.json({
    username,
    postCount:        s[0].postCount,
    likesReceived:    s[0].likesReceived,
    dislikesReceived: s[0].dislikesReceived,
    gold:             u[0].gold,
    rank:             rankRow[0]?.rank ?? null,
    createdAt:        u[0].created_at,
    spinCount:        wl[0].spinCount,
    bestReward:       wl[0].bestReward
  });
});

// ── Leaderboard ───────────────────────────────────

app.get('/api/leaderboard', requireAuth, async (req, res) => {
  const { rows } = await pool.query(`
    SELECT
      u.username,
      u.gold,
      COUNT(DISTINCT p.id)::int                         AS "postCount",
      COUNT(CASE WHEN v.vote = 'up'   THEN 1 END)::int AS "likesReceived",
      COUNT(CASE WHEN v.vote = 'down' THEN 1 END)::int AS "dislikesReceived",
      COALESCE(sl."spinCount", 0)::int                  AS "spinCount",
      COALESCE(sl."bestReward", 0)::int                 AS "bestReward"
    FROM users u
    LEFT JOIN posts  p ON p.author  = u.username
    LEFT JOIN votes  v ON v.post_id = p.id
    LEFT JOIN (
      SELECT username,
             COUNT(*)::int  AS "spinCount",
             MAX(reward)::int AS "bestReward"
      FROM spin_log GROUP BY username
    ) sl ON sl.username = u.username
    GROUP BY u.username, u.gold, sl."spinCount", sl."bestReward"
    ORDER BY "likesReceived" DESC
  `);
  res.json(rows);
});

// ── Wheel ─────────────────────────────────────────

app.get('/api/wheel', requireAuth, async (req, res) => {
  const { rows } = await pool.query(
    'SELECT gold, wheel_seed, wheel_version FROM users WHERE username = $1',
    [req.session.username]
  );
  const u = rows[0];
  res.json({ seed: u.wheel_seed || null, version: u.wheel_version || 1, gold: u.gold });
});

app.post('/api/wheel/generate', requireAuth, async (req, res) => {
  const username = req.session.username;
  const { rows } = await pool.query('SELECT gold FROM users WHERE username = $1', [username]);
  if (rows[0].gold < WB.spin_cost) return res.status(400).json({ error: `Nicht genug Gold (${WB.spin_cost} benötigt)` });

  const seed    = String(Math.floor(Math.random() * 4294967296));
  const version = 1;
  await pool.query(
    'UPDATE users SET gold = gold - $1, wheel_seed = $2, wheel_version = $3 WHERE username = $4',
    [WB.spin_cost, seed, version, username]
  );
  const { rows: u } = await pool.query('SELECT gold FROM users WHERE username = $1', [username]);
  res.json({ seed, version, gold: u[0].gold });
});

app.post('/api/wheel/spin', requireAuth, async (req, res) => {
  const username = req.session.username;
  const { rows } = await pool.query(
    'SELECT gold, wheel_seed, wheel_version FROM users WHERE username = $1', [username]
  );
  const u = rows[0];
  if (!u.wheel_seed) return res.status(400).json({ error: 'Kein Wheel generiert' });
  if (u.gold < WB.spin_cost) return res.status(400).json({ error: `Nicht genug Gold (${WB.spin_cost} benötigt)` });

  const segs = wheelSegments(u.wheel_seed);

  // Weighted random pick
  const rand = Math.random();
  let cum = 0, idx = segs.length - 1;
  for (let i = 0; i < segs.length; i++) {
    cum += segs[i].prob;
    if (rand < cum) { idx = i; break; }
  }
  const reward = segs[idx].reward;
  const isJackpot = idx === segs.length - 1; // jackpot is always the last segment

  await pool.query(
    'INSERT INTO spin_log (username, seed, version, segment_idx, reward) VALUES ($1, $2, $3, $4, $5)',
    [username, u.wheel_seed, u.wheel_version, idx, reward]
  );
  await pool.query(
    'UPDATE users SET gold = GREATEST(0, gold - $1 + $2), wheel_seed = NULL WHERE username = $3',
    [WB.spin_cost, reward, username]
  );
  if (isJackpot) {
    await pool.query(`
      INSERT INTO jackpot_sessions (username, round, accumulated)
      VALUES ($1, 0, 1)
      ON CONFLICT (username) DO UPDATE SET round = 0, accumulated = 1, started_at = NOW()
    `, [username]);
  }
  const { rows: after } = await pool.query('SELECT gold FROM users WHERE username = $1', [username]);
  res.json({ segmentIndex: idx, reward, gold: after[0].gold, jackpot: isJackpot });
});

// ── Jackpot ───────────────────────────────────────

app.get('/api/jackpot', requireAuth, async (req, res) => {
  const { rows } = await pool.query('SELECT round, accumulated FROM jackpot_sessions WHERE username = $1', [req.session.username]);
  if (!rows[0]) return res.json({ active: false });
  res.json({ active: true, round: rows[0].round, accumulated: rows[0].accumulated });
});

app.post('/api/jackpot/spin', requireAuth, async (req, res) => {
  const username = req.session.username;
  const { rows } = await pool.query('SELECT round, accumulated FROM jackpot_sessions WHERE username = $1', [username]);
  if (!rows[0]) return res.status(400).json({ error: 'Kein aktives Jackpot-Spiel' });

  const session  = rows[0];
  const roundIdx = Math.min(session.round, WB.jackpot.rounds.length - 1);
  const round    = WB.jackpot.rounds[roundIdx];

  const rand = Math.random();
  let cum = 0, fieldIdx = round.fields.length - 1;
  for (let i = 0; i < round.fields.length; i++) {
    cum += round.fields[i].prob;
    if (rand < cum) { fieldIdx = i; break; }
  }
  const field = round.fields[fieldIdx];

  if (field.end) {
    const total = Math.round(WB.spin_cost * parseFloat(session.accumulated));
    await pool.query('UPDATE users SET gold = gold + $1 WHERE username = $2', [total, username]);
    await pool.query('DELETE FROM jackpot_sessions WHERE username = $1', [username]);
    const { rows: after } = await pool.query('SELECT gold FROM users WHERE username = $1', [username]);
    res.json({ end: true, fieldIndex: fieldIdx, total, gold: after[0].gold });
  } else {
    const newAccumulated = parseFloat(session.accumulated) * field.reward;
    const newRound       = session.round + 1;
    await pool.query(
      'UPDATE jackpot_sessions SET accumulated = $1, round = $2 WHERE username = $3',
      [newAccumulated, newRound, username]
    );
    res.json({ end: false, fieldIndex: fieldIdx, multiplier: field.reward, accumulated: newAccumulated, round: newRound });
  }
});

// ── Daily ─────────────────────────────────────────

app.get('/api/daily', requireAuth, async (req, res) => {
  const { rows } = await pool.query(
    'SELECT daily_last_claimed, gold FROM users WHERE username = $1', [req.session.username]
  );
  const last = rows[0].daily_last_claimed ? new Date(rows[0].daily_last_claimed).getTime() : 0;
  const DAY  = 0.1 * 60 * 60 * 1000;
  const diff = Date.now() - last;
  res.json({ claimable: diff >= DAY, secondsUntilNext: diff >= DAY ? 0 : Math.ceil((DAY - diff) / 1000), gold: rows[0].gold });
});

app.post('/api/daily/claim', requireAuth, async (req, res) => {
  const username = req.session.username;
  const { rows } = await pool.query('SELECT daily_last_claimed FROM users WHERE username = $1', [username]);
  const last = rows[0].daily_last_claimed ? new Date(rows[0].daily_last_claimed).getTime() : 0;
  if (Date.now() - last < 0.1 * 60 * 60 * 1000) return res.status(400).json({ error: 'Noch nicht verfügbar' });
  await pool.query('UPDATE users SET gold = gold + 150, daily_last_claimed = NOW() WHERE username = $1', [username]);
  const { rows: u } = await pool.query('SELECT gold FROM users WHERE username = $1', [username]);
  res.json({ ok: true, gold: u[0].gold });
});

// ── Factory ───────────────────────────────────────

app.get('/api/factory', requireAuth, async (req, res) => {
  const username = req.session.username;
  const { rows: ex1 } = await pool.query('SELECT 1 FROM unplaced_buildings WHERE username=$1 LIMIT 1', [username]);
  const { rows: ex2 } = await pool.query('SELECT 1 FROM city_buildings     WHERE username=$1 LIMIT 1', [username]);
  if (!ex1.length && !ex2.length) {
    await pool.query(
      'INSERT INTO unplaced_buildings (username,type,quantity) VALUES ($1,$2,5) ON CONFLICT DO NOTHING',
      [username, 'building_001']
    );
  }
  const { rows: unplaced }  = await pool.query('SELECT type, quantity FROM unplaced_buildings WHERE username=$1 AND quantity>0', [username]);
  const { rows: buildings } = await pool.query(`
    SELECT cb.id, cb.type, cb.x, cb.y,
           bj.id AS "jobId", bj.started_at AS "jobStarted", bj.completed AS "jobCompleted"
    FROM city_buildings cb
    LEFT JOIN building_jobs bj ON bj.building_id = cb.id
    WHERE cb.username=$1 ORDER BY cb.id`, [username]);
  const { rows: items } = await pool.query(
    'SELECT item_type AS "itemType", quantity FROM storage_items WHERE username=$1', [username]);
  res.json({ unplaced, buildings, items });
});

app.post('/api/factory/place', requireAuth, async (req, res) => {
  const username = req.session.username;
  const { type, x, y } = req.body;
  const def = BUILDINGS[type];
  if (!def) return res.status(400).json({ error: 'Unbekanntes Gebäude' });
  const { rows: u } = await pool.query('SELECT quantity FROM unplaced_buildings WHERE username=$1 AND type=$2', [username, type]);
  if (!u[0] || u[0].quantity < 1) return res.status(400).json({ error: 'Nicht im Storage' });
  if (x < 0 || y < 0 || x + def.width > 20 || y + def.height > 20)
    return res.status(400).json({ error: 'Außerhalb des Grids' });
  const { rows: placed } = await pool.query('SELECT type, x, y FROM city_buildings WHERE username=$1', [username]);
  for (const b of placed) {
    const bd = BUILDINGS[b.type];
    if (!bd) continue;
    if (x < b.x + bd.width && x + def.width > b.x && y < b.y + bd.height && y + def.height > b.y)
      return res.status(400).json({ error: 'Überlappung' });
  }
  const { rows: nb } = await pool.query(
    'INSERT INTO city_buildings (username,type,x,y) VALUES ($1,$2,$3,$4) RETURNING id', [username, type, x, y]);
  await pool.query('UPDATE unplaced_buildings SET quantity=quantity-1 WHERE username=$1 AND type=$2', [username, type]);
  res.json({ ok: true, id: nb[0].id });
});

app.delete('/api/factory/building/:id', requireAuth, async (req, res) => {
  const username = req.session.username;
  const id = parseInt(req.params.id);
  const { rows } = await pool.query('SELECT type FROM city_buildings WHERE id=$1 AND username=$2', [id, username]);
  if (!rows[0]) return res.status(404).json({ error: 'Nicht gefunden' });
  const { rows: job } = await pool.query('SELECT id FROM building_jobs WHERE building_id=$1 AND completed=FALSE', [id]);
  if (job.length) return res.status(400).json({ error: 'Rezept läuft noch' });
  await pool.query('DELETE FROM city_buildings WHERE id=$1', [id]);
  await pool.query(
    'INSERT INTO unplaced_buildings (username,type,quantity) VALUES ($1,$2,1) ON CONFLICT (username,type) DO UPDATE SET quantity=unplaced_buildings.quantity+1',
    [username, rows[0].type]
  );
  res.json({ ok: true });
});

app.get('/api/factory/building/:id', requireAuth, async (req, res) => {
  const username = req.session.username;
  const id = parseInt(req.params.id);
  const { rows } = await pool.query(`
    SELECT cb.id, cb.type, bj.id AS "jobId", bj.started_at AS "jobStarted", bj.completed AS "jobCompleted", u.gold
    FROM city_buildings cb
    JOIN users u ON u.username=cb.username
    LEFT JOIN building_jobs bj ON bj.building_id=cb.id
    WHERE cb.id=$1 AND cb.username=$2`, [id, username]);
  if (!rows[0]) return res.status(404).json({ error: 'Nicht gefunden' });
  const b = rows[0];
  let job = null;
  if (b.jobId) {
    const recipe  = getBuildingRecipe(b.type);
    const elapsed = Date.now() - new Date(b.jobStarted).getTime();
    if (elapsed >= recipe.durationMs && !b.jobCompleted) {
      await pool.query('UPDATE building_jobs SET completed=TRUE WHERE id=$1', [b.jobId]);
      b.jobCompleted = true;
    }
    job = { id: b.jobId, startedAt: b.jobStarted, completed: b.jobCompleted,
            progress: Math.min(1, elapsed / recipe.durationMs),
            remainingMs: Math.max(0, recipe.durationMs - elapsed) };
  }
  res.json({ id: b.id, type: b.type, job, gold: b.gold });
});

app.post('/api/factory/building/:id/start', requireAuth, async (req, res) => {
  const username = req.session.username;
  const id = parseInt(req.params.id);
  const { rows } = await pool.query(
    'SELECT cb.type, u.gold FROM city_buildings cb JOIN users u ON u.username=cb.username WHERE cb.id=$1 AND cb.username=$2',
    [id, username]);
  if (!rows[0]) return res.status(404).json({ error: 'Nicht gefunden' });
  const recipe = getBuildingRecipe(rows[0].type);
  const goldCost = recipe.inputs.find(i => i.type === 'gold')?.qty ?? 0;
  if (rows[0].gold < goldCost) return res.status(400).json({ error: `Nicht genug Gold (${goldCost} benötigt)` });
  const { rows: active } = await pool.query('SELECT id FROM building_jobs WHERE building_id=$1', [id]);
  if (active.length) return res.status(400).json({ error: 'Job läuft bereits oder Output ausstehend' });
  await pool.query('UPDATE users SET gold=gold-$1 WHERE username=$2', [goldCost, username]);
  await pool.query('INSERT INTO building_jobs (building_id) VALUES ($1)', [id]);
  const { rows: u } = await pool.query('SELECT gold FROM users WHERE username=$1', [username]);
  res.json({ ok: true, gold: u[0].gold });
});

app.post('/api/factory/building/:id/collect', requireAuth, async (req, res) => {
  const username = req.session.username;
  const id = parseInt(req.params.id);
  const { rows } = await pool.query('SELECT type FROM city_buildings WHERE id=$1 AND username=$2', [id, username]);
  if (!rows[0]) return res.status(404).json({ error: 'Nicht gefunden' });
  const recipe = getBuildingRecipe(rows[0].type);
  const output = recipe.outputs[0];
  const { rows: jobs } = await pool.query('SELECT id, started_at, completed FROM building_jobs WHERE building_id=$1', [id]);
  if (!jobs.length) return res.status(400).json({ error: 'Kein Job' });
  const elapsed = Date.now() - new Date(jobs[0].started_at).getTime();
  if (!jobs[0].completed && elapsed < recipe.durationMs)
    return res.status(400).json({ error: 'Noch nicht fertig' });
  await pool.query('DELETE FROM building_jobs WHERE building_id=$1', [id]);
  await pool.query(
    'INSERT INTO storage_items (username,item_type,quantity) VALUES ($1,$2,$3) ON CONFLICT (username,item_type) DO UPDATE SET quantity=storage_items.quantity+$3',
    [username, output.item, output.qty]
  );
  const { rows: items } = await pool.query('SELECT item_type AS "itemType", quantity FROM storage_items WHERE username=$1', [username]);
  res.json({ ok: true, items });
});

app.get('/api/wheel/log', requireAuth, async (req, res) => {
  const { rows } = await pool.query(
    `SELECT seed, version, segment_idx AS "segmentIdx", reward, spun_at AS "spunAt"
     FROM spin_log WHERE username = $1 ORDER BY spun_at DESC LIMIT 50`,
    [req.session.username]
  );
  res.json(rows);
});

// GET /api/gold — current player gold balance
app.get('/api/gold', requireAuth, async (req, res) => {
  const { rows: [row] } = await pool.query('SELECT gold FROM users WHERE username=$1', [req.session.username]);
  res.json({ gold: row?.gold ?? 0 });
});

// GET /api/trade/inventory — player's tradeable items with icons, names, quantities
app.get('/api/trade/inventory', requireAuth, async (req, res) => {
  try {
    const [{ rows }, { rows: [userRow] }] = await Promise.all([
      pool.query(
        `SELECT item_type AS "itemType", quantity, avg_buy_price AS "avgBuyPrice", paid_quantity AS "paidQuantity"
         FROM storage_items WHERE username=$1`, [req.session.username]),
      pool.query('SELECT gold FROM users WHERE username=$1', [req.session.username]),
    ]);
    const invMap = Object.fromEntries(rows.map(r => [r.itemType, r]));
    const items = Object.entries(ITEMS)
      .filter(([, def]) => def.tradable)
      .map(([id, def]) => ({
        item_type:    id,
        icon:         def.icon,
        display_name: LOCALES[`items.${id}.name`] ?? id,
        quantity:     invMap[id]?.quantity     ?? 0,
        avgBuyPrice:  invMap[id]?.avgBuyPrice  ?? 0,
        paidQuantity: invMap[id]?.paidQuantity ?? 0,
      }));
    res.json({ items, gold: userRow?.gold ?? 0 });
  } catch (e) {
    console.error('GET /api/trade/inventory error:', e);
    res.status(500).json({ error: 'internal' });
  }
});

// ── Dynamic Trade Sessions ────────────────────────

function gaussianRandom(mean, stddev) {
  const u1 = Math.random();
  const u2 = Math.random();
  const z  = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  return mean + z * stddev;
}

function generateSessionStocks() {
  const { std_factor, min_multiplier, max_multiplier } = TRADE_BALANCE.gaussian;
  const stocks = {};
  for (const [itemType, item] of Object.entries(ITEMS)) {
    if (!item.tradable) continue;
    const mean   = item.base_quantity;
    const raw    = gaussianRandom(mean, mean * std_factor);
    stocks[itemType] = Math.round(Math.max(mean * min_multiplier, Math.min(mean * max_multiplier, raw)));
  }
  return stocks;
}

async function createTradeSession(username, status) {
  const sessionId = randomUUID();
  const expiresAt = new Date(Date.now() + TRADE_BALANCE.session.duration_minutes * 60 * 1000);
  const stocks    = generateSessionStocks();
  const pgClient  = await pool.connect();
  try {
    await pgClient.query('BEGIN');
    await pgClient.query(
      `INSERT INTO trade_sessions (username,session_id,expires_at,status) VALUES ($1,$2,$3,$4)`,
      [username, sessionId, expiresAt, status]
    );
    for (const [itemType, qty] of Object.entries(stocks)) {
      await pgClient.query(
        `INSERT INTO trade_session_stocks (session_id,item_type,initial_stock,current_stock) VALUES ($1,$2,$3,$3)`,
        [sessionId, itemType, qty]
      );
    }
    await pgClient.query('COMMIT');
  } catch (e) {
    await pgClient.query('ROLLBACK');
    throw e;
  } finally {
    pgClient.release();
  }
  const { rows: [session] } = await pool.query(
    `SELECT * FROM trade_sessions WHERE session_id=$1`, [sessionId]
  );
  return session;
}

async function buildSessionResponse(sessionRow, username) {
  const { rows: stockRows } = await pool.query(
    'SELECT item_type, initial_stock, current_stock FROM trade_session_stocks WHERE session_id=$1',
    [sessionRow.session_id]
  );
  const sessionStocks = {};
  stockRows.forEach(s => { sessionStocks[s.item_type] = s.current_stock; });

  const prices = calculateSessionPrices(ITEMS, sessionStocks, TRADE_BALANCE.pricing);
  const items  = stockRows.map(s => {
    const def = ITEMS[s.item_type];
    return {
      item_type:     s.item_type,
      display_name:  LOCALES[`items.${s.item_type}.name`] ?? s.item_type,
      icon:          def.icon,
      initial_stock: s.initial_stock,
      current_stock: s.current_stock,
      sell_price:    prices[s.item_type].sell_price,
      buy_price:     prices[s.item_type].buy_price,
      base_price:    def.base_price,
      base_quantity: def.base_quantity,
    };
  });

  return {
    session_id: sessionRow.session_id,
    expires_at: sessionRow.expires_at,
    items,
    config:     TRADE_BALANCE.pricing,
  };
}

// Core sync logic shared by /sync and /close
async function performSync(username, session_id, sync_number, transactions) {
  const { rows: [session] } = await pool.query(
    `SELECT * FROM trade_sessions WHERE session_id=$1 AND username=$2`,
    [session_id, username]
  );
  if (!session) throw Object.assign(new Error('Session nicht gefunden'), { status: 404 });
  if (session.status === 'prefetched') {
    // First sync implicitly activates the session (safety net alongside /activate)
    await pool.query(`UPDATE trade_sessions SET status='active' WHERE session_id=$1`, [session_id]);
  } else if (session.status !== 'active') {
    throw Object.assign(new Error('Session abgelaufen'), { status: 400, expired: true });
  }
  if (new Date(session.expires_at) < new Date()) {
    await pool.query(`UPDATE trade_sessions SET status='expired' WHERE session_id=$1`, [session_id]);
    throw Object.assign(new Error('Session abgelaufen'), { status: 400, expired: true });
  }

  // Idempotency: already processed this sync_number?
  const { rows: dup } = await pool.query(
    'SELECT id FROM trade_session_log WHERE session_id=$1 AND sync_number=$2',
    [session_id, sync_number]
  );
  if (dup[0]) return { success: true, already_processed: true };

  const { rows: stockRows } = await pool.query(
    'SELECT item_type, current_stock FROM trade_session_stocks WHERE session_id=$1',
    [session_id]
  );
  const serverStocks = {};
  stockRows.forEach(s => { serverStocks[s.item_type] = s.current_stock; });

  const { rows: invRows } = await pool.query(
    'SELECT item_type, quantity, avg_buy_price, paid_quantity FROM storage_items WHERE username=$1', [username]
  );
  const playerInventory = {};
  const playerAvg  = {};
  const playerPaid = {};
  invRows.forEach(r => {
    playerInventory[r.item_type] = r.quantity;
    playerAvg[r.item_type]  = parseFloat(r.avg_buy_price) || 0;
    playerPaid[r.item_type] = r.paid_quantity || 0;
  });

  const config      = TRADE_BALANCE.pricing;
  let totalGoldDelta = 0;
  const stockDeltas  = {};
  const invDeltas    = {};
  const clientCalc   = {};
  const serverCalc   = {};
  const buyBatches   = {};
  const sellQtys     = {};

  for (const tx of transactions) {
    const { item_type, direction, quantity, client_price_per_unit } = tx;
    const def = ITEMS[item_type];
    if (!def || !def.tradable) throw Object.assign(new Error(`Item nicht handelbar: ${item_type}`), { status: 400 });
    if (!Number.isInteger(quantity) || quantity < 1) throw Object.assign(new Error('Ungültige Menge'), { status: 400 });

    const stockBefore = (serverStocks[item_type] ?? 0) + (stockDeltas[item_type] ?? 0);
    const serverPrice = direction === 'sell'
      ? calculateSellPrice(def.base_price, def.base_quantity, stockBefore, config)
      : calculateBuyPrice(def.base_price, def.base_quantity, stockBefore, config);

    clientCalc[item_type] = (clientCalc[item_type] ?? 0) + (client_price_per_unit ?? serverPrice) * quantity;
    serverCalc[item_type] = (serverCalc[item_type] ?? 0) + serverPrice * quantity;

    if (direction === 'sell') {
      const avail = (playerInventory[item_type] ?? 0) + (invDeltas[item_type] ?? 0);
      if (avail < quantity) throw Object.assign(new Error(`Nicht genug ${item_type}`), { status: 400 });
      invDeltas[item_type]   = (invDeltas[item_type]   ?? 0) - quantity;
      stockDeltas[item_type] = (stockDeltas[item_type] ?? 0) + quantity;
      totalGoldDelta += serverPrice * quantity;
      sellQtys[item_type] = (sellQtys[item_type] ?? 0) + quantity;
    } else {
      if (stockBefore < quantity) throw Object.assign(new Error(`Händler hat nicht genug ${item_type}`), { status: 400 });
      invDeltas[item_type]   = (invDeltas[item_type]   ?? 0) + quantity;
      stockDeltas[item_type] = (stockDeltas[item_type] ?? 0) - quantity;
      totalGoldDelta -= serverPrice * quantity;
      if (!buyBatches[item_type]) buyBatches[item_type] = [];
      buyBatches[item_type].push({ price: serverPrice, qty: quantity });
    }
  }

  // Compute avg_buy_price / paid_quantity updates
  const avgUpdates = {};
  for (const [itemType, sellQty] of Object.entries(sellQtys)) {
    const finalQty = (playerInventory[itemType] ?? 0) + (invDeltas[itemType] ?? 0);
    if (finalQty <= 0) {
      avgUpdates[itemType] = { newAvg: 0, newPaid: 0 };
    } else {
      avgUpdates[itemType] = {
        newAvg:  playerAvg[itemType]  ?? 0,
        newPaid: Math.max(0, (playerPaid[itemType] ?? 0) - sellQty),
      };
    }
  }
  for (const [itemType, batches] of Object.entries(buyBatches)) {
    const ex      = avgUpdates[itemType];
    let curPaid   = ex ? ex.newPaid : (playerPaid[itemType] ?? 0);
    let curAvg    = ex ? ex.newAvg  : (playerAvg[itemType]  ?? 0);
    for (const { price, qty } of batches) {
      ({ newAvg: curAvg, newPaid: curPaid } = updateAvgBuyPrice(curAvg, curPaid, price, qty));
    }
    const finalQty = (playerInventory[itemType] ?? 0) + (invDeltas[itemType] ?? 0);
    avgUpdates[itemType] = finalQty <= 0
      ? { newAvg: 0, newPaid: 0 }
      : { newAvg: curAvg, newPaid: curPaid };
  }

  const { rows: [userRow] } = await pool.query('SELECT gold FROM users WHERE username=$1', [username]);
  if (userRow.gold + totalGoldDelta < 0) throw Object.assign(new Error('Nicht genug Gold'), { status: 400 });

  const clientTotal = Object.values(clientCalc).reduce((a, b) => a + b, 0);
  const serverTotal = Object.values(serverCalc).reduce((a, b) => a + b, 0);
  const discrepancy = serverTotal > 0 && Math.abs(clientTotal - serverTotal) / serverTotal > 0.05;

  const pgClient = await pool.connect();
  try {
    await pgClient.query('BEGIN');

    for (const [itemType, delta] of Object.entries(stockDeltas)) {
      await pgClient.query(
        'UPDATE trade_session_stocks SET current_stock=current_stock+$1 WHERE session_id=$2 AND item_type=$3',
        [delta, session_id, itemType]
      );
    }
    for (const [itemType, delta] of Object.entries(invDeltas)) {
      if (delta > 0) {
        await pgClient.query(
          `INSERT INTO storage_items (username,item_type,quantity) VALUES ($1,$2,$3)
           ON CONFLICT (username,item_type) DO UPDATE SET quantity=storage_items.quantity+$3`,
          [username, itemType, delta]
        );
      } else if (delta < 0) {
        await pgClient.query(
          'UPDATE storage_items SET quantity=GREATEST(0,quantity+$1) WHERE username=$2 AND item_type=$3',
          [delta, username, itemType]
        );
        await pgClient.query(
          'DELETE FROM storage_items WHERE username=$1 AND item_type=$2 AND quantity=0',
          [username, itemType]
        );
      }
    }
    for (const [itemType, { newAvg, newPaid }] of Object.entries(avgUpdates)) {
      await pgClient.query(
        'UPDATE storage_items SET avg_buy_price=$1, paid_quantity=$2 WHERE username=$3 AND item_type=$4',
        [newAvg, newPaid, username, itemType]
      );
    }
    await pgClient.query('UPDATE users SET gold=gold+$1 WHERE username=$2', [totalGoldDelta, username]);
    await pgClient.query('UPDATE trade_sessions SET last_sync_at=NOW() WHERE session_id=$1', [session_id]);
    await pgClient.query(
      `INSERT INTO trade_session_log
         (session_id,username,sync_number,items_sold,items_bought,gold_delta,client_calculation,server_calculation,discrepancy)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [
        session_id, username, sync_number,
        JSON.stringify(transactions.filter(t => t.direction === 'sell')),
        JSON.stringify(transactions.filter(t => t.direction === 'buy')),
        totalGoldDelta,
        JSON.stringify(clientCalc),
        JSON.stringify(serverCalc),
        discrepancy,
      ]
    );
    await pgClient.query('COMMIT');
  } catch (e) {
    await pgClient.query('ROLLBACK');
    throw e;
  } finally {
    pgClient.release();
  }

  const { rows: [updUser] }  = await pool.query('SELECT gold FROM users WHERE username=$1', [username]);
  const { rows: updInv }     = await pool.query(
    `SELECT item_type AS "itemType", quantity, avg_buy_price AS "avgBuyPrice", paid_quantity AS "paidQuantity" FROM storage_items WHERE username=$1`, [username]
  );
  const { rows: updStocks }  = await pool.query(
    'SELECT item_type, current_stock FROM trade_session_stocks WHERE session_id=$1', [session_id]
  );
  const sessionStocksMap = {};
  updStocks.forEach(s => { sessionStocksMap[s.item_type] = s.current_stock; });

  return {
    success:              true,
    confirmed_gold_delta: totalGoldDelta,
    player_gold:          updUser.gold,
    player_inventory:     updInv,
    session_stocks:       sessionStocksMap,
    discrepancy,
    server_correction:    discrepancy ? { note: 'Price recalculated by server' } : null,
  };
}

// Rate limiter: max 60 sync requests/minute per user (bots send far more)
const syncRateLimiter = new Map();
function checkSyncRateLimit(username) {
  const now   = Date.now();
  const entry = syncRateLimiter.get(username);
  if (!entry || now - entry.windowStart > 60000) {
    syncRateLimiter.set(username, { count: 1, windowStart: now });
    return true;
  }
  entry.count++;
  return entry.count <= 60;
}

// 2.1 Generate / resume session (fallback when prefetch cache is empty)
app.post('/api/trade/session/generate', requireAuth, async (req, res) => {
  const username = req.session.username;
  await pool.query(
    `UPDATE trade_sessions SET status='expired' WHERE username=$1 AND status='active'`,
    [username]
  );
  const sessionRow = await createTradeSession(username, 'active');
  res.json(await buildSessionResponse(sessionRow, username));
});

// 2.1b Prefetch — generates session + returns full data so client needs no round-trip on click
app.post('/api/trade/prefetch', requireAuth, async (req, res) => {
  const username = req.session.username;
  await pool.query(
    `DELETE FROM trade_sessions WHERE username=$1 AND status='prefetched'`,
    [username]
  );
  const session = await createTradeSession(username, 'prefetched');
  res.json(await buildSessionResponse(session, username));
});

// 2.1c Activate — called fire-and-forget on first trade after a prefetch-started session
app.post('/api/trade/session/activate', requireAuth, async (req, res) => {
  const { session_id } = req.body;
  if (!session_id) return res.status(400).json({ error: 'Missing session_id' });
  const { rows: [session] } = await pool.query(
    `SELECT status FROM trade_sessions WHERE session_id=$1 AND username=$2`,
    [session_id, req.session.username]
  );
  if (!session) return res.status(404).json({ error: 'Session not found' });
  if (session.status === 'prefetched') {
    await pool.query(
      `UPDATE trade_sessions SET status='active' WHERE session_id=$1`, [session_id]
    );
  }
  res.json({ ok: true });
});

// 2.2 Get current active session
app.get('/api/trade/session/current', requireAuth, async (req, res) => {
  const { rows } = await pool.query(
    `SELECT * FROM trade_sessions WHERE username=$1 AND status='active' AND expires_at > NOW() LIMIT 1`,
    [req.session.username]
  );
  if (!rows[0]) return res.status(404).json({ error: 'Keine aktive Session' });
  res.json(await buildSessionResponse(rows[0], req.session.username));
});

// 2.3 Background sync
app.post('/api/trade/session/sync', requireAuth, async (req, res) => {
  if (!checkSyncRateLimit(req.session.username))
    return res.status(429).json({ error: 'Zu viele Sync-Anfragen. Warte kurz.' });
  const { session_id, sync_number, transactions } = req.body;
  if (!session_id || typeof sync_number !== 'number' || !Array.isArray(transactions))
    return res.status(400).json({ error: 'Ungültige Sync-Daten' });
  try {
    res.json(await performSync(req.session.username, session_id, sync_number, transactions));
  } catch (e) {
    res.status(e.status ?? 400).json({ error: e.message, expired: e.expired ?? false });
  }
});

// 2.4 Close session (final sync + mark completed)
app.post('/api/trade/session/close', requireAuth, async (req, res) => {
  const username = req.session.username;
  const { session_id, sync_number, transactions } = req.body;
  if (Array.isArray(transactions) && transactions.length > 0) {
    try { await performSync(username, session_id, sync_number, transactions); }
    catch (_) { /* ignore errors on close, session is being discarded */ }
  }
  await pool.query(
    `UPDATE trade_sessions SET status='completed' WHERE session_id=$1 AND username=$2`,
    [session_id, username]
  );
  res.json({ success: true });
});

// 2.5 Session summary log (analytics, fire-and-forget from client)
app.post('/api/trade/session/log', requireAuth, async (req, res) => {
  const { session_id, summary } = req.body;
  if (session_id && Array.isArray(summary) && summary.length > 0) {
    try {
      await pool.query(
        `INSERT INTO trade_session_summary (session_id, username, summary) VALUES ($1, $2, $3)`,
        [session_id, req.session.username, JSON.stringify(summary)]
      );
    } catch (_) {}
  }
  res.json({ ok: true });
});

// 2.6 Expire stale sessions (on startup + every 10 minutes)
async function expireOldSessions() {
  await pool.query(
    `UPDATE trade_sessions SET status='expired' WHERE status='active' AND expires_at < NOW()`
  );
  await pool.query(
    `DELETE FROM trade_sessions WHERE status='prefetched' AND created_at < NOW() - INTERVAL '10 minutes'`
  );
}

// ── Dev hot-reload for data files ─────────────────
if (!process.env.RAILWAY_ENVIRONMENT) {
  const hotReload = (file, target) => {
    fs.watchFile(path.join(__dirname, file), { interval: 300 }, () => {
      try {
        const fresh = JSON.parse(fs.readFileSync(path.join(__dirname, file), 'utf8'));
        Object.keys(target).forEach(k => delete target[k]);
        Object.assign(target, fresh);
        console.log(`[dev] ${file} reloaded`);
      } catch (e) {
        console.error(`[dev] ${file} reload error:`, e.message);
      }
    });
  };
  hotReload('data/items.json',           ITEMS);
  hotReload('data/buildings.json',       BUILDINGS);
  hotReload('data/recipes.json',         RECIPES);
  hotReload('trade-balance-public.json', TRADE_BALANCE);
}

// ── Start ─────────────────────────────────────────
const PORT = process.env.PORT || 3000;
initDb()
  .then(() => {
    const startServer = (retries = 5) => {
      app.listen(PORT, () => console.log(`Server läuft auf http://localhost:${PORT}`))
        .on('error', err => {
          if (err.code === 'EADDRINUSE' && retries > 0) {
            console.log(`Port ${PORT} belegt, neuer Versuch in 1s... (${retries} übrig)`);
            setTimeout(() => startServer(retries - 1), 1000);
          } else {
            console.error(err);
            process.exit(1);
          }
        });
    };
    startServer();
    expireOldSessions();
    setInterval(expireOldSessions, 10 * 60 * 1000);
  })
  .catch(e => { console.error('DB-Fehler:', e.message); process.exit(1); });
