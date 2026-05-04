require('dns').setDefaultResultOrder('ipv4first');
const express        = require('express');
const session        = require('express-session');
const bcrypt         = require('bcryptjs');
const { Pool }       = require('pg');
const { randomUUID } = require('crypto');
const path           = require('path');

const app  = express();
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// Tabellen beim Start anlegen
async function initDb() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      username   TEXT PRIMARY KEY,
      password   TEXT NOT NULL,
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

const calcGold = (posts, likes) => 100 + posts * 10 + likes;

// ── Auth ──────────────────────────────────────────

app.post('/api/register', async (req, res) => {
  const username = req.body.username?.trim().toLowerCase();
  const { password } = req.body;
  if (!username || !password)  return res.status(400).json({ error: 'Felder fehlen' });
  if (username.length < 3)     return res.status(400).json({ error: 'Benutzername zu kurz (min. 3 Zeichen)' });
  if (password.length < 6)     return res.status(400).json({ error: 'Passwort zu kurz (min. 6 Zeichen)' });

  try {
    const hash = await bcrypt.hash(password, 10);
    await pool.query('INSERT INTO users (username, password) VALUES ($1, $2)', [username, hash]);
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
      MAX(CASE WHEN v.username = $1 THEN v.vote END)    AS "userVote"
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
  res.json({ ...rows[0], upvotes: 0, downvotes: 0, userVote: null });
});

app.post('/api/posts/:id/vote', requireAuth, async (req, res) => {
  const { id } = req.params;
  const { vote } = req.body;
  const username = req.session.username;

  if (!vote) {
    await pool.query('DELETE FROM votes WHERE post_id = $1 AND username = $2', [id, username]);
  } else {
    await pool.query(
      'INSERT INTO votes (post_id, username, vote) VALUES ($1, $2, $3) ON CONFLICT (post_id, username) DO UPDATE SET vote = $3',
      [id, username, vote]
    );
  }
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

  const { postCount, likesReceived, dislikesReceived } = s[0];
  res.json({
    username, postCount, likesReceived, dislikesReceived,
    gold: calcGold(postCount, likesReceived),
    createdAt: u[0].created_at
  });
});

// ── Leaderboard ───────────────────────────────────

app.get('/api/leaderboard', requireAuth, async (req, res) => {
  const { rows } = await pool.query(`
    SELECT
      u.username,
      COUNT(DISTINCT p.id)::int                         AS "postCount",
      COUNT(CASE WHEN v.vote = 'up'   THEN 1 END)::int AS "likesReceived",
      COUNT(CASE WHEN v.vote = 'down' THEN 1 END)::int AS "dislikesReceived",
      (100 + COUNT(DISTINCT p.id)::int * 10
           + COUNT(CASE WHEN v.vote = 'up' THEN 1 END)::int) AS gold
    FROM users u
    LEFT JOIN posts  p ON p.author   = u.username
    LEFT JOIN votes  v ON v.post_id  = p.id
    GROUP BY u.username
    ORDER BY "likesReceived" DESC
  `);
  res.json(rows);
});

// ── Start ─────────────────────────────────────────
const PORT = process.env.PORT || 3000;
initDb()
  .then(() => app.listen(PORT, () => console.log(`Server läuft auf http://localhost:${PORT}`)))
  .catch(e => { console.error('DB-Fehler:', e.message); process.exit(1); });
