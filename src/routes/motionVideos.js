const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuid } = require('uuid');
const db = require('../db');
const { requireAuth, requireOwner } = require('../middleware/auth');

const router = express.Router();
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', '..');
const UPLOAD_ROOT = path.join(DATA_DIR, 'uploads');
const MOTION_DIR = path.join(UPLOAD_ROOT, 'motion-videos');

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    fs.mkdirSync(MOTION_DIR, { recursive: true });
    cb(null, MOTION_DIR);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname) || '.mp4';
    cb(null, `${Date.now()}-${uuid()}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 200 * 1024 * 1024 }, // 200 MB pro Bewegungs-Video
  fileFilter: (req, file, cb) => {
    if (!file.mimetype.startsWith('video/')) {
      return cb(new Error('Nur Videodateien sind erlaubt.'));
    }
    cb(null, true);
  },
});

// Bewegungs-Video-Bibliothek auflisten (Owner + Mitarbeiter, da Mitarbeiter
// die Videos zum manuellen Face-Swap herunterladen muessen)
router.get('/', requireAuth, (req, res) => {
  const videos = db.prepare(`SELECT * FROM motion_videos ORDER BY created_at DESC`).all();
  res.json(videos);
});

// Neues Bewegungs-Video hochladen (nur Owner - das ist die kuratierte,
// lizenzierte/eigene Vorlagen-Bibliothek der Agentur)
router.post('/', requireAuth, requireOwner, upload.single('video'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Kein Video erhalten.' });
  const { name, styleTag } = req.body;
  if (!styleTag || !styleTag.trim()) {
    return res.status(400).json({ error: 'styleTag ist erforderlich (z.B. "Tanz", "GRWM", "Walk").' });
  }

  const id = uuid();
  const relativePath = path.relative(UPLOAD_ROOT, req.file.path);
  db.prepare(
    `INSERT INTO motion_videos (id, name, style_tag, file_path, uploaded_by) VALUES (?, ?, ?, ?, ?)`
  ).run(id, (name || req.file.originalname || '').trim() || req.file.originalname, styleTag.trim(), relativePath, req.user.id);

  res.json({ id, name, styleTag, filePath: relativePath });
});

// Bewegungs-Video loeschen (nur Owner)
router.delete('/:id', requireAuth, requireOwner, (req, res) => {
  const video = db.prepare(`SELECT * FROM motion_videos WHERE id = ?`).get(req.params.id);
  if (!video) return res.status(404).json({ error: 'Bewegungs-Video nicht gefunden.' });

  const fullPath = path.join(UPLOAD_ROOT, video.file_path);
  fs.unlink(fullPath, (err) => {
    if (err && err.code !== 'ENOENT') console.error('Konnte Bewegungs-Video-Datei nicht loeschen:', err);
  });

  db.prepare(`DELETE FROM motion_videos WHERE id = ?`).run(req.params.id);
  res.json({ ok: true });
});

module.exports = router;
