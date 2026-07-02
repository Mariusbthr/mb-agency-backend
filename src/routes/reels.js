const express = require('express');
const path = require('path');
const fs = require('fs');
const { v4: uuid } = require('uuid');
const db = require('../db');
const { requireAuth, requireOwner } = require('../middleware/auth');
const { generateReelConcept } = require('../services/claude');
const { generateVideo } = require('../services/higgsfield');

const router = express.Router();
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', '..');
const UPLOAD_ROOT = path.join(DATA_DIR, 'uploads');

// Mehrere Trend-Stile, zwischen denen automatisch abgewechselt wird. Wichtig:
// Diese unterscheiden sich nicht nur im Licht/Look, sondern bewusst auch im
// TEMPO der Bewegung - sonst wirken alle Reels trotz Zufallsauswahl gleich "slow motion".
// WICHTIG: Diese Liste sollte alle paar Wochen manuell aktualisiert werden, damit
// sie echte aktuelle Trends widerspiegelt (siehe Erklaerung im Chat).
const TREND_STYLES = [
  `- POV/erste-Person-Gefuehl, MITTLERES Tempo: Kamera wirkt wie die eigenen Augen der Person
- Spuerbare, aber kontrollierte Kamerabewegung (kein Zeitlupen-Gefuehl, aber auch nicht hektisch)
- Subtile Kamera-Drift mit klar wahrnehmbarem Vorwaertstempo`,
  `- Energiegeladener Trend-Stil, SCHNELLES Tempo: knackige, zuegige Bewegung, kein traeges Driften
- Schneller Zoom oder leichter Handheld-Wackler, wie ein spontan eingefangener Moment
- Zuegiger Haarschwung oder schnelles Kopfdrehen, Energie und Tempo klar spuerbar - explizit KEINE Zeitlupe`,
  `- GRWM-Stil (Get Ready With Me), MITTLERES bis ZUEGIGES Tempo: nahbar, direkt, lebendig
- Kamera bleibt nah, aber mit spuerbarer Eigenbewegung, nicht statisch-traege
- Natuerliche, zuegige Mimik: schnelles Blinzeln, spontanes Laecheln, aktive Praesenz`,
  `- Editorial/Hochglanz-Stil, SELBSTBEWUSSTES Tempo: entschlossene, zielgerichtete Kamerafahrt
- Klare, spuerbare Bewegung wie in einer Kampagne - nicht traege, sondern praezise und zuegig
- Kuehleres Licht, klare Konturen, Bewegung wirkt bewusst und schnell, nicht meditativ-langsam`,
];

function pickRandomTrendStyle() {
  return TREND_STYLES[Math.floor(Math.random() * TREND_STYLES.length)];
}

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
      trendContext || pickRandomTrendStyle(),
      creator.name
    );

    // Higgsfield braucht eine oeffentlich erreichbare Bild-URL, keinen Datei-Upload.
    // PUBLIC_BASE_URL muss auf deine Render-Adresse zeigen, z.B. https://mb-agency-backend.onrender.com
    const publicBaseUrl = process.env.PUBLIC_BASE_URL;
    if (!publicBaseUrl) {
      throw new Error('PUBLIC_BASE_URL ist nicht gesetzt. Bitte in den Environment Variables eintragen.');
    }
    const imageUrl = `${publicBaseUrl.replace(/\/$/, '')}/files/${image.file_path}`;

    const reelDir = path.join(UPLOAD_ROOT, creatorId, 'reels');
    fs.mkdirSync(reelDir, { recursive: true });
    const destPath = path.join(reelDir, `${Date.now()}-${reelId}.mp4`);

    await generateVideo(imageUrl, prompt, destPath);

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
