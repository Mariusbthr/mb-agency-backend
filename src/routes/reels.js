const express = require('express');
const path = require('path');
const fs = require('fs');
const { v4: uuid } = require('uuid');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');
const { generateReelConcept } = require('../services/claude');
const { generateVideo } = require('../services/higgsfield');

const router = express.Router();
const UPLOAD_ROOT = path.join(__dirname, '..', '..', 'uploads');

// Reel aus einem Bild generieren
router.post('/:creatorId/generate', requireAuth, async (req, res) => {
  const { creatorId } = req.params;
  const { imageId, trendContext } = req.body;

  const creator = db.prepare(`SELECT * FROM creators WHERE id = ?`).get(creatorId);
  if (!creator) return res.status(404).json({ error: 'Creator-Ordner nicht gefunden.' });

  const image = db.prepare(`SELECT * FROM images WHERE id = ? AND creator_id = ?`).get(imageId, creatorId);
  if (!image) return res.status(404).json({ error: 'Bild nicht gefunden.' });

  const reelId = uuid();
  db.prepare(
    `INSERT INTO reels (id, creator_id, source_image_id, requested_by, status) VALUES (?, ?, ?, ?, 'GENERATING')`
  ).run(reelId, creatorId, imageId, req.user.id);

  // Direkt antworten, Generierung laeuft im Hintergrund weiter (kann 1-3 Minuten dauern)
  res.json({ id: reelId, status: 'GENERATING' });

  try {
    const prompt = await generateReelConcept(
      trendContext || 'Aktuelle allgemeine Social-Media-Trends, kurze dynamische Reels mit starkem Hook in den ersten 2 Sekunden.',
      creator.name
    );

    const imageFullPath = path.join(UPLOAD_ROOT, image.file_path);
    const reelDir = path.join(UPLOAD_ROOT, creatorId, 'reels');
    fs.mkdirSync(reelDir, { recursive: true });
    const destPath = path.join(reelDir, `${Date.now()}-${reelId}.mp4`);

    await generateVideo(imageFullPath, prompt, destPath);

    const relativePath = path.relative(UPLOAD_ROOT, destPath);
    db.prepare(
      `UPDATE reels SET status = 'DONE', prompt_used = ?, file_path = ?, completed_at = datetime('now') WHERE id = ?`
    ).run(prompt, relativePath, reelId);
  } catch (err) {
    db.prepare(
      `UPDATE reels SET status = 'FAILED', error_message = ? WHERE id = ?`
    ).run(String(err.message || err), reelId);
    console.error('Reel-Generierung fehlgeschlagen:', err);
  }
});

// Alle Reels eines Creators auflisten (neueste zuerst), inkl. Zeitstempel
router.get('/:creatorId', requireAuth, (req, res) => {
  const reels = db
    .prepare(`SELECT * FROM reels WHERE creator_id = ? ORDER BY created_at DESC`)
    .all(req.params.creatorId);
  res.json(reels);
});

// Einzelnes Reel-Video herunterladen
router.get('/:creatorId/:reelId/download', requireAuth, (req, res) => {
  const reel = db.prepare(`SELECT * FROM reels WHERE id = ? AND creator_id = ?`).get(req.params.reelId, req.params.creatorId);
  if (!reel || reel.status !== 'DONE' || !reel.file_path) {
    return res.status(404).json({ error: 'Reel noch nicht fertig oder nicht gefunden.' });
  }
  const fullPath = path.join(UPLOAD_ROOT, reel.file_path);
  res.download(fullPath);
});

module.exports = router;
