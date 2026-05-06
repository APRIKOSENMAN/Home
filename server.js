require('dns').setDefaultResultOrder('ipv4first');
const express        = require('express');
const session        = require('express-session');
const bcrypt         = require('bcryptjs');
const { Pool }       = require('pg');
const { randomUUID } = require('crypto');
const path           = require('path');

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
  const n   = Math.floor(rng() * 7) + 2;
  const w   = Array.from({length: n}, () => 0.15 + rng() * 0.85);
  const tot = w.reduce((a, b) => a + b, 0);
  const p   = w.map(x => x / tot);
  const raw = Array.from({length: n}, () => {
    const r = rng();
    if (r < 0.30) return 0;
    if (r < 0.62) return rng() * 90 + 5;
    if (r < 0.84) return rng() * 280 + 60;
    if (r < 0.95) return rng() * 450 + 220;
    return rng() * 2000 + 2000;
  });
  const ev    = p.reduce((s, pi, i) => s + pi * raw[i], 0);
  const scale = ev > 0 ? 11 / ev : 1;
  const rwd   = raw.map(r => Math.min(200, Math.max(0, Math.round(r * scale))));
  return p.map((prob, i) => ({ prob, reward: rwd[i] }));
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
}

app.use(express.json());
// In production (after "npm run build"): serve from dist/
// In development: Vite dev server handles the frontend on port 5173
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, 'dist')));
}
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

app.post('/api/logout', (req, res) => { req.session.destroy(); res.json({ ok: true }); });
app.get('/api/me', (req, res) => res.json({ user: req.session.username || null }));

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
  if (rows[0].gold < 5) return res.status(400).json({ error: 'Nicht genug Gold (5 benötigt)' });

  const seed    = String(Math.floor(Math.random() * 4294967296));
  const version = 1;
  await pool.query(
    'UPDATE users SET gold = gold - 5, wheel_seed = $1, wheel_version = $2 WHERE username = $3',
    [seed, version, username]
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
  if (u.gold < 5)    return res.status(400).json({ error: 'Nicht genug Gold (5 benötigt)' });

  const segs = wheelSegments(u.wheel_seed);

  // Weighted random pick
  const rand = Math.random();
  let cum = 0, idx = segs.length - 1;
  for (let i = 0; i < segs.length; i++) {
    cum += segs[i].prob;
    if (rand < cum) { idx = i; break; }
  }
  const reward = segs[idx].reward;

  await pool.query(
    'INSERT INTO spin_log (username, seed, version, segment_idx, reward) VALUES ($1, $2, $3, $4, $5)',
    [username, u.wheel_seed, u.wheel_version, idx, reward]
  );
  await pool.query(
    'UPDATE users SET gold = GREATEST(0, gold - 5 + $1), wheel_seed = NULL WHERE username = $2',
    [reward, username]
  );
  const { rows: after } = await pool.query('SELECT gold FROM users WHERE username = $1', [username]);
  res.json({ segmentIndex: idx, reward, gold: after[0].gold });
});

// ── Daily ─────────────────────────────────────────

app.get('/api/daily', requireAuth, async (req, res) => {
  const { rows } = await pool.query(
    'SELECT daily_last_claimed, gold FROM users WHERE username = $1', [req.session.username]
  );
  const last = rows[0].daily_last_claimed ? new Date(rows[0].daily_last_claimed).getTime() : 0;
  const DAY  = 24 * 60 * 60 * 1000;
  const diff = Date.now() - last;
  res.json({ claimable: diff >= DAY, secondsUntilNext: diff >= DAY ? 0 : Math.ceil((DAY - diff) / 1000), gold: rows[0].gold });
});

app.post('/api/daily/claim', requireAuth, async (req, res) => {
  const username = req.session.username;
  const { rows } = await pool.query('SELECT daily_last_claimed FROM users WHERE username = $1', [username]);
  const last = rows[0].daily_last_claimed ? new Date(rows[0].daily_last_claimed).getTime() : 0;
  if (Date.now() - last < 24 * 60 * 60 * 1000) return res.status(400).json({ error: 'Noch nicht verfügbar' });
  await pool.query('UPDATE users SET gold = gold + 100, daily_last_claimed = NOW() WHERE username = $1', [username]);
  const { rows: u } = await pool.query('SELECT gold FROM users WHERE username = $1', [username]);
  res.json({ ok: true, gold: u[0].gold });
});

// ── Factory ───────────────────────────────────────

const BUILDING_DEFS_SRV = {
  goldbarren_giesserei: { width: 2, height: 3 }
};
const RECIPE_DEFS_SRV = {
  goldbarren_giesserei: { goldCost: 10, durationMs: 10 * 60 * 1000, outputItem: 'goldbarren', outputQty: 1 }
};

app.get('/api/factory', requireAuth, async (req, res) => {
  const username = req.session.username;
  const { rows: ex1 } = await pool.query('SELECT 1 FROM unplaced_buildings WHERE username=$1 LIMIT 1', [username]);
  const { rows: ex2 } = await pool.query('SELECT 1 FROM city_buildings     WHERE username=$1 LIMIT 1', [username]);
  if (!ex1.length && !ex2.length) {
    await pool.query(
      'INSERT INTO unplaced_buildings (username,type,quantity) VALUES ($1,$2,5) ON CONFLICT DO NOTHING',
      [username, 'goldbarren_giesserei']
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
  const def = BUILDING_DEFS_SRV[type];
  if (!def) return res.status(400).json({ error: 'Unbekanntes Gebäude' });
  const { rows: u } = await pool.query('SELECT quantity FROM unplaced_buildings WHERE username=$1 AND type=$2', [username, type]);
  if (!u[0] || u[0].quantity < 1) return res.status(400).json({ error: 'Nicht im Storage' });
  if (x < 0 || y < 0 || x + def.width > 20 || y + def.height > 20)
    return res.status(400).json({ error: 'Außerhalb des Grids' });
  const { rows: placed } = await pool.query('SELECT type, x, y FROM city_buildings WHERE username=$1', [username]);
  for (const b of placed) {
    const bd = BUILDING_DEFS_SRV[b.type];
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
    const recipe  = RECIPE_DEFS_SRV[b.type];
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
  const recipe = RECIPE_DEFS_SRV[rows[0].type];
  if (rows[0].gold < recipe.goldCost) return res.status(400).json({ error: `Nicht genug Gold (${recipe.goldCost} benötigt)` });
  const { rows: active } = await pool.query('SELECT id FROM building_jobs WHERE building_id=$1', [id]);
  if (active.length) return res.status(400).json({ error: 'Job läuft bereits oder Output ausstehend' });
  await pool.query('UPDATE users SET gold=gold-$1 WHERE username=$2', [recipe.goldCost, username]);
  await pool.query('INSERT INTO building_jobs (building_id) VALUES ($1)', [id]);
  const { rows: u } = await pool.query('SELECT gold FROM users WHERE username=$1', [username]);
  res.json({ ok: true, gold: u[0].gold });
});

app.post('/api/factory/building/:id/collect', requireAuth, async (req, res) => {
  const username = req.session.username;
  const id = parseInt(req.params.id);
  const { rows } = await pool.query('SELECT type FROM city_buildings WHERE id=$1 AND username=$2', [id, username]);
  if (!rows[0]) return res.status(404).json({ error: 'Nicht gefunden' });
  const recipe = RECIPE_DEFS_SRV[rows[0].type];
  const { rows: jobs } = await pool.query('SELECT id, started_at, completed FROM building_jobs WHERE building_id=$1', [id]);
  if (!jobs.length) return res.status(400).json({ error: 'Kein Job' });
  const elapsed = Date.now() - new Date(jobs[0].started_at).getTime();
  if (!jobs[0].completed && elapsed < recipe.durationMs)
    return res.status(400).json({ error: 'Noch nicht fertig' });
  await pool.query('DELETE FROM building_jobs WHERE building_id=$1', [id]);
  await pool.query(
    'INSERT INTO storage_items (username,item_type,quantity) VALUES ($1,$2,$3) ON CONFLICT (username,item_type) DO UPDATE SET quantity=storage_items.quantity+$3',
    [username, recipe.outputItem, recipe.outputQty]
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

// ── Start ─────────────────────────────────────────
const PORT = process.env.PORT || 3000;
initDb()
  .then(() => app.listen(PORT, () => console.log(`Server läuft auf http://localhost:${PORT}`)))
  .catch(e => { console.error('DB-Fehler:', e.message); process.exit(1); });
