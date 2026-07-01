const express = require('express');
const bcrypt = require('bcryptjs');
const { v4: uuid } = require('uuid');
const db = require('../db');
const { requireAuth, requireOwner, signToken } = require('../middleware/auth');

const router = express.Router();

// Einmaliges Setup: legt den ersten Owner-Account an.
// Funktioniert nur, wenn noch KEIN Owner existiert (Schutz gegen Missbrauch).
router.post('/setup-owner', (req, res) => {
  const existingOwner = db.prepare(`SELECT id FROM users WHERE role = 'OWNER' LIMIT 1`).get();
  if (existingOwner) {
    return res.status(400).json({ error: 'Es gibt bereits einen Owner-Account.' });
  }
  const { email, password, name } = req.body;
  if (!email || !password || !name) {
    return res.status(400).json({ error: 'email, password und name sind erforderlich.' });
  }
  const id = uuid();
  const passwordHash = bcrypt.hashSync(password, 10);
  db.prepare(
    `INSERT INTO users (id, email, password_hash, name, role) VALUES (?, ?, ?, ?, 'OWNER')`
  ).run(id, email.toLowerCase().trim(), passwordHash, name);

  const user = { id, email, name, role: 'OWNER' };
  res.json({ token: signToken(user), user });
});

// Login fuer Owner und Mitarbeiter
router.post('/login', (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'email und password sind erforderlich.' });
  }
  const row = db.prepare(`SELECT * FROM users WHERE email = ?`).get(email.toLowerCase().trim());
  if (!row || !bcrypt.compareSync(password, row.password_hash)) {
    return res.status(401).json({ error: 'E-Mail oder Passwort ist falsch.' });
  }
  const user = { id: row.id, email: row.email, name: row.name, role: row.role };
  res.json({ token: signToken(user), user });
});

// Owner legt einen Mitarbeiter-Account an
router.post('/employees', requireAuth, requireOwner, (req, res) => {
  const { email, password, name } = req.body;
  if (!email || !password || !name) {
    return res.status(400).json({ error: 'email, password und name sind erforderlich.' });
  }
  const existing = db.prepare(`SELECT id FROM users WHERE email = ?`).get(email.toLowerCase().trim());
  if (existing) {
    return res.status(400).json({ error: 'Diese E-Mail ist bereits vergeben.' });
  }
  const id = uuid();
  const passwordHash = bcrypt.hashSync(password, 10);
  db.prepare(
    `INSERT INTO users (id, email, password_hash, name, role) VALUES (?, ?, ?, ?, 'EMPLOYEE')`
  ).run(id, email.toLowerCase().trim(), passwordHash, name);

  res.json({ id, email, name, role: 'EMPLOYEE' });
});

// Owner sieht alle Mitarbeiter
router.get('/employees', requireAuth, requireOwner, (req, res) => {
  const rows = db.prepare(`SELECT id, email, name, role, created_at FROM users WHERE role = 'EMPLOYEE'`).all();
  res.json(rows);
});

router.get('/me', requireAuth, (req, res) => {
  res.json(req.user);
});

module.exports = router;
