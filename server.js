const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const Datastore = require('@seald-io/nedb');
const path = require('path');

const app = express();

const users = new Datastore({ filename: 'users.db', autoload: true });
const posts = new Datastore({ filename: 'posts.db', autoload: true });
const votes = new Datastore({ filename: 'votes.db', autoload: true });

users.ensureIndex({ fieldName: 'username', unique: true });

// Promise-Wrapper für NeDB
const find = (db, q, sort) => new Promise((res, rej) => {
  const c = db.find(q);
  if (sort) c.sort(sort);
  c.exec((e, d) => e ? rej(e) : res(d));
});
const findOne = (db, q) => new Promise((res, rej) => db.findOne(q, (e, d) => e ? rej(e) : res(d)));
const insert  = (db, doc) => new Promise((res, rej) => db.insert(doc, (e, d) => e ? rej(e) : res(d)));
const update  = (db, q, u, o = {}) => new Promise((res, rej) => db.update(q, u, o, (e) => e ? rej(e) : res()));
const remove  = (db, q, o = {}) => new Promise((res, rej) => db.remove(q, o, (e) => e ? rej(e) : res()));

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
  if (!username || !password) return res.status(400).json({ error: 'Felder fehlen' });
  if (username.length < 3)  return res.status(400).json({ error: 'Benutzername zu kurz (min. 3 Zeichen)' });
  if (password.length < 6)  return res.status(400).json({ error: 'Passwort zu kurz (min. 6 Zeichen)' });

  try {
    const hash = await bcrypt.hash(password, 10);
    await insert(users, { username, password: hash, createdAt: new Date() });
    res.json({ ok: true });
  } catch {
    res.status(409).json({ error: 'Benutzername bereits vergeben' });
  }
});

app.post('/api/login', async (req, res) => {
  const username = req.body.username?.trim().toLowerCase();
  const { password } = req.body;
  const user = await findOne(users, { username });
  if (!user || !(await bcrypt.compare(password, user.password))) {
    return res.status(401).json({ error: 'Falscher Benutzername oder Passwort' });
  }
  req.session.username = user.username;
  res.json({ ok: true, username: user.username });
});

app.post('/api/logout', (req, res) => {
  req.session.destroy();
  res.json({ ok: true });
});

app.get('/api/me', (req, res) => {
  res.json({ user: req.session.username || null });
});

// ── Posts ─────────────────────────────────────────

app.get('/api/posts', requireAuth, async (req, res) => {
  const query = req.query.author ? { author: req.query.author.toLowerCase() } : {};
  const docs = await find(posts, query, { createdAt: -1 });

  const postIds = docs.map(p => p._id);
  const allVotes = postIds.length ? await find(votes, { postId: { $in: postIds } }) : [];

  const result = docs.map(post => {
    const pv = allVotes.filter(v => v.postId === post._id);
    const userVoteObj = pv.find(v => v.username === req.session.username);
    return {
      ...post,
      upvotes:   pv.filter(v => v.vote === 'up').length,
      downvotes: pv.filter(v => v.vote === 'down').length,
      userVote:  userVoteObj?.vote || null
    };
  });

  res.json(result);
});

app.post('/api/posts', requireAuth, async (req, res) => {
  const { title, body } = req.body;
  if (!title || !body) return res.status(400).json({ error: 'Titel und Inhalt erforderlich' });
  const post = await insert(posts, { title, body, author: req.session.username, createdAt: new Date() });
  res.json({ ...post, upvotes: 0, downvotes: 0, userVote: null });
});

app.post('/api/posts/:id/vote', requireAuth, async (req, res) => {
  const postId  = req.params.id;
  const { vote: voteValue } = req.body;
  const username = req.session.username;

  const existing = await findOne(votes, { postId, username });

  if (!voteValue) {
    await remove(votes, { postId, username });
  } else if (existing) {
    await update(votes, { postId, username }, { $set: { vote: voteValue } });
  } else {
    await insert(votes, { postId, username, vote: voteValue });
  }

  res.json({ ok: true });
});

// ── Profil ────────────────────────────────────────

app.get('/api/profile/:username', requireAuth, async (req, res) => {
  const username = req.params.username.toLowerCase();
  const user = await findOne(users, { username });
  if (!user) return res.status(404).json({ error: 'User nicht gefunden' });

  const userPosts = await find(posts, { author: username });
  const postIds   = userPosts.map(p => p._id);
  const allVotes  = postIds.length ? await find(votes, { postId: { $in: postIds } }) : [];

  res.json({
    username:         user.username,
    postCount:        userPosts.length,
    likesReceived:    allVotes.filter(v => v.vote === 'up').length,
    dislikesReceived: allVotes.filter(v => v.vote === 'down').length,
    createdAt:        user.createdAt
  });
});

// ── Start ─────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server läuft auf http://localhost:${PORT}`));
