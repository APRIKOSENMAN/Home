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
}

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
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
      COUNT(CASE WHEN v.vote = 'down' THEN 1 END)::int AS "dislikesReceived"
    FROM users u
    LEFT JOIN posts  p ON p.author  = u.username
    LEFT JOIN votes  v ON v.post_id = p.id
    GROUP BY u.username, u.gold
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
