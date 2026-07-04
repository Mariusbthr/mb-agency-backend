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

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 200 * 1024 * 1024 }, // 200 MB pro fertigem Reel
  fileFilter: (req, file, cb) => {
    if (!file.mimetype.startsWith('video/')) {
      return cb(new Error('Nur Videodateien sind erlaubt.'));
    }
    cb(null, true);
  },
});

function formatRecipeText(recipe) {
  if (!recipe) return null;
  return [
    `Stil: ${recipe.style_name}`,
    recipe.description,
    recipe.audio_suggestion ? `Sound-Idee: ${recipe.audio_suggestion}` : null,
    recipe.hook_suggestion ? `Hook: ${recipe.hook_suggestion}` : null,
    recipe.cut_pace ? `Schnitttempo: ${recipe.cut_pace}` : null,
  ]
    .filter(Boolean)
    .join('\n');
}

// Ein Reel "anlegen": weist dem Quellbild ein zufaelliges Bewegungs-Video +
// ein aktuelles Trend-Rezept zu. Der eigentliche Face-Swap passiert danach
// manuell in Higgsfields Web-Oberflaeche - siehe Uebergabe-Dokument, Abschnitt
// "Hybrid-Workflow". Deshalb ist das hier (anders als frueher mit Higgsfields
// Image-to-Video-API) ein schneller, synchroner Vorgang ohne Wartezeit.
router.post('/:creatorId/assign', requireAuth, (req, res) => {
  const { creatorId } = req.params;
  const { imageId } = req.body;

  const creator = db.prepare(`SELECT * FROM creators WHERE id = ?`).get(creatorId);
  if (!creator) return res.status(404).json({ error: 'Creator-Ordner nicht gefunden.' });

  const image = db.prepare(`SELECT * FROM images WHERE id = ? AND creator_id = ?`).get(imageId, creatorId);
  if (!image) return res.status(404).json({ error: 'Bild nicht gefunden.' });

  const motionVideo = db
    .prepare(`SELECT * FROM motion_videos ORDER BY RANDOM() LIMIT 1`)
    .get();
  if (!motionVideo) {
    return res.status(400).json({
      error: 'Noch kein Bewegungs-Video in der Bibliothek. Bitte zuerst unter "Bewegungs-Videos" eins hochladen.',
    });
  }

  const recipe = db
    .prepare(`SELECT * FROM trend_recipes WHERE active = 1 ORDER BY RANDOM() LIMIT 1`)
    .get();

  const reelId = uuid();
  const recipeSnapshot = formatRecipeText(recipe);
  db.prepare(
    `INSERT INTO reels (id, creator_id, source_image_id, requested_by, status, motion_video_id, recipe_snapshot)
     VALUES (?, ?, ?, ?, 'ASSIGNED', ?, ?)`
  ).run(reelId, creatorId, imageId, req.user.id, motionVideo.id, recipeSnapshot);

  const reel = db.prepare(`SELECT * FROM reels WHERE id = ?`).get(reelId);
  res.json({ ...reel, motionVideo });
});

// Alle Reels eines Creators auflisten (neueste zuerst), inkl. zugewiesenem
// Bewegungs-Video fuer die Anzeige im Dashboard
router.get('/:creatorId', requireAuth, (req, res) => {
  const reels = db
    .prepare(
      `SELECT reels.*, motion_videos.file_path AS motion_video_path, motion_videos.name AS motion_video_name,
              motion_videos.style_tag AS motion_video_style
       FROM reels
       LEFT JOIN motion_videos ON motion_videos.id = reels.motion_video_id
       WHERE reels.creator_id = ?
       ORDER BY reels.created_at DESC`
    )
    .all(req.params.creatorId);
  res.json(reels);
});

// Fertigen, manuell per Face-Swap erstellten Reel-Clip hochladen
router.post('/:creatorId/:reelId/upload', requireAuth, upload.single('video'), (req, res) => {
  const reel = db
    .prepare(`SELECT * FROM reels WHERE id = ? AND creator_id = ?`)
    .get(req.params.reelId, req.params.creatorId);
  if (!reel) return res.status(404).json({ error: 'Reel nicht gefunden.' });
  if (!req.file) return res.status(400).json({ error: 'Kein Video erhalten.' });

  const reelDir = path.join(UPLOAD_ROOT, req.params.creatorId, 'reels');
  fs.mkdirSync(reelDir, { recursive: true });
  const ext = path.extname(req.file.originalname) || '.mp4';
  const destPath = path.join(reelDir, `${Date.now()}-${reel.id}${ext}`);
  fs.writeFileSync(destPath, req.file.buffer);

  const relativePath = path.relative(UPLOAD_ROOT, destPath);
  db.prepare(
    `UPDATE reels SET status = 'DONE', file_path = ?, completed_at = datetime('now') WHERE id = ?`
  ).run(relativePath, reel.id);

  const updated = db.prepare(`SELECT * FROM reels WHERE id = ?`).get(reel.id);
  res.json(updated);
});

// Einzelnes Reel-Video herunterladen
router.get('/:creatorId/:reelId/download', requireAuth, (req, res) => {
  const reel = db.prepare(`SELECT * FROM reels WHERE id = ? AND creator_id = ?`).get(req.params.reelId, req.params.creatorId);
  if (!reel || reel.status !== 'DONE' || !reel.file_path) {
    return res.status(404).json({ error: 'Reel noch nicht fertig oder nicht gefunden.' });
  }
  db.prepare(`UPDATE reels SET downloaded = 1 WHERE id = ?`).run(reel.id);
  const fullPath = path.join(UPLOAD_ROOT, reel.file_path);
  res.download(fullPath);
});

// Download-Status manuell setzen/umschalten (z.B. falls jemand es woanders
// heruntergeladen hat oder die Markierung zuruecksetzen will)
router.patch('/:creatorId/:reelId/downloaded', requireAuth, (req, res) => {
  const { downloaded } = req.body;
  const reel = db.prepare(`SELECT * FROM reels WHERE id = ? AND creator_id = ?`).get(req.params.reelId, req.params.creatorId);
  if (!reel) return res.status(404).json({ error: 'Reel nicht gefunden.' });

  db.prepare(`UPDATE reels SET downloaded = ? WHERE id = ?`).run(downloaded ? 1 : 0, reel.id);
  res.json({ ok: true, downloaded: Boolean(downloaded) });
});

// Reel loeschen (nur Owner) - loescht die Datei UND den Datenbank-Eintrag,
// damit tatsaechlich Speicherplatz frei wird
router.delete('/:creatorId/:reelId', requireAuth, requireOwner, (req, res) => {
  const reel = db.prepare(`SELECT * FROM reels WHERE id = ? AND creator_id = ?`).get(req.params.reelId, req.params.creatorId);
  if (!reel) return res.status(404).json({ error: 'Reel nicht gefunden.' });

  if (reel.file_path) {
    const fullPath = path.join(UPLOAD_ROOT, reel.file_path);
    fs.unlink(fullPath, (err) => {
      if (err && err.code !== 'ENOENT') console.error('Konnte Reel-Datei nicht loeschen:', err);
    });
  }

  db.prepare(`DELETE FROM reels WHERE id = ?`).run(reel.id);
  res.json({ ok: true });
});

module.exports = router;
