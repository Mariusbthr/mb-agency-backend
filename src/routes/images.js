const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuid } = require('uuid');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
const UPLOAD_ROOT = path.join(__dirname, '..', '..', 'uploads');

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const creatorId = req.params.creatorId;
    const dir = path.join(UPLOAD_ROOT, creatorId, 'images');
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname) || '.jpg';
    cb(null, `${Date.now()}-${uuid()}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024 }, // 20 MB pro Bild
  fileFilter: (req, file, cb) => {
    if (!file.mimetype.startsWith('image/')) {
      return cb(new Error('Nur Bilddateien sind erlaubt.'));
    }
    cb(null, true);
  },
});

// Bild in einen Creator-Ordner hochladen
router.post('/:creatorId/images', requireAuth, upload.single('image'), (req, res) => {
  const creator = db.prepare(`SELECT * FROM creators WHERE id = ?`).get(req.params.creatorId);
  if (!creator) return res.status(404).json({ error: 'Creator-Ordner nicht gefunden.' });
  if (!req.file) return res.status(400).json({ error: 'Kein Bild erhalten.' });

  const id = uuid();
  const relativePath = path.relative(UPLOAD_ROOT, req.file.path);
  db.prepare(
    `INSERT INTO images (id, creator_id, uploaded_by, file_path, original_name) VALUES (?, ?, ?, ?, ?)`
  ).run(id, creator.id, req.user.id, relativePath, req.file.originalname);

  res.json({ id, creatorId: creator.id, filePath: relativePath });
});

// Alle Bilder eines Creators auflisten
router.get('/:creatorId/images', requireAuth, (req, res) => {
  const images = db
    .prepare(`SELECT * FROM images WHERE creator_id = ? ORDER BY created_at DESC`)
    .all(req.params.creatorId);
  res.json(images);
});

module.exports = router;
