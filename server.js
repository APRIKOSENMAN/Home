const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const Datastore = require('@seald-io/nedb');
const path = require('path');

const app = express();

// Datenbank-Dateien
const users = new Datastore({ filename: 'users.db', autoload: true });
const posts = new Datastore({ filename: 'posts.db', autoload: true });

users.ensureIndex({ fieldName: 'username', unique: true });

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use(session({
  secret: 'geheim-schluessel-hier-aendern',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 1000 * 60 * 60 * 24 } // 1 Tag
}));

function requireAuth(req, res, next) {
  if (!req.session.username) return res.status(401).json({ error: 'Nicht eingeloggt' });
  next();
}

// ── Auth-Routen ──────────────────────────────────

app.post('/api/register', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Felder fehlen' });
  if (username.length < 3) return res.status(400).json({ error: 'Benutzername zu kurz (min. 3 Zeichen)' });
  if (password.length < 6) return res.status(400).json({ error: 'Passwort zu kurz (min. 6 Zeichen)' });

  const hash = await bcrypt.hash(password, 10);
  users.insert({ username, password: hash, createdAt: new Date() }, (err) => {
    if (err) return res.status(409).json({ error: 'Benutzername bereits vergeben' });
    res.json({ ok: true });
  });
});

app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;
  users.findOne({ username }, async (err, user) => {
    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.status(401).json({ error: 'Falscher Benutzername oder Passwort' });
    }
    req.session.username = user.username;
    res.json({ ok: true, username: user.username });
  });
});

app.post('/api/logout', (req, res) => {
  req.session.destroy();
  res.json({ ok: true });
});

app.get('/api/me', (req, res) => {
  res.json({ user: req.session.username || null });
});

// ── Post-Routen ──────────────────────────────────

app.get('/api/posts', requireAuth, (req, res) => {
  posts.find({}).sort({ createdAt: -1 }).exec((err, docs) => {
    res.json(docs);
  });
});

app.post('/api/posts', requireAuth, (req, res) => {
  const { title, body } = req.body;
  if (!title || !body) return res.status(400).json({ error: 'Titel und Inhalt erforderlich' });
  const post = { title, body, author: req.session.username, createdAt: new Date() };
  posts.insert(post, (err, doc) => {
    res.json(doc);
  });
});

// ── Start ─────────────────────────────────────────
const PORT = 3000;
app.listen(PORT, () => {
  console.log(`Server läuft auf http://localhost:${PORT}`);
});
