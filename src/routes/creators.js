const express = require('express');
const { v4: uuid } = require('uuid');
const db = require('../db');
const { requireAuth, requireOwner } = require('../middleware/auth');

const router = express.Router();

// Alle Creator-Ordner auflisten (Owner + Mitarbeiter duerfen das sehen)
router.get('/', requireAuth, (req, res) => {
  const creators = db.prepare(`SELECT * FROM creators ORDER BY created_at DESC`).all();
  const withCounts = creators.map((c) => {
    const imageCount = db.prepare(`SELECT COUNT(*) AS n FROM images WHERE creator_id = ?`).get(c.id).n;
    const reelCount = db.prepare(`SELECT COUNT(*) AS n FROM reels WHERE creator_id = ? AND status = 'DONE'`).get(c.id).n;
    return { ...c, imageCount, reelCount };
  });
  res.json(withCounts);
});

// Neuen Creator-Ordner anlegen (nur Owner)
router.post('/', requireAuth, requireOwner, (req, res) => {
  const { name } = req.body;
  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'name ist erforderlich.' });
  }
  const id = uuid();
  db.prepare(`INSERT INTO creators (id, name, created_by) VALUES (?, ?, ?)`).run(id, name.trim(), req.user.id);
  res.json({ id, name: name.trim() });
});

// Creator-Ordner loeschen (nur Owner)
router.delete('/:id', requireAuth, requireOwner, (req, res) => {
  db.prepare(`DELETE FROM creators WHERE id = ?`).run(req.params.id);
  res.json({ ok: true });
});

module.exports = router;
