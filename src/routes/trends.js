const express = require('express');
const { v4: uuid } = require('uuid');
const db = require('../db');
const { requireAuth, requireOwner } = require('../middleware/auth');
const { refreshTrendRecipes } = require('../services/claude');

const router = express.Router();

// Aktuell aktive Reel-Rezepte auflisten
router.get('/', requireAuth, (req, res) => {
  const recipes = db
    .prepare(`SELECT * FROM trend_recipes WHERE active = 1 ORDER BY created_at DESC`)
    .all();
  res.json(recipes);
});

// Trend-Rezepte per Claude + Websuche neu recherchieren (nur Owner, da es
// API-Kosten verursacht). Alte Rezepte werden deaktiviert statt geloescht,
// damit bereits zugewiesene Reels ihren urspruenglichen Kontext behalten.
router.post('/refresh', requireAuth, requireOwner, async (req, res) => {
  try {
    const recipes = await refreshTrendRecipes();

    const deactivate = db.prepare(`UPDATE trend_recipes SET active = 0 WHERE active = 1`);
    const insert = db.prepare(
      `INSERT INTO trend_recipes (id, style_name, description, audio_suggestion, hook_suggestion, cut_pace)
       VALUES (?, ?, ?, ?, ?, ?)`
    );

    const inserted = db.transaction((items) => {
      deactivate.run();
      return items.map((r) => {
        const id = uuid();
        insert.run(id, r.styleName, r.description, r.audioSuggestion || null, r.hookSuggestion || null, r.cutPace || null);
        return { id, ...r };
      });
    })(recipes);

    res.json(inserted);
  } catch (err) {
    console.error('Trend-Refresh fehlgeschlagen:', err);
    res.status(500).json({ error: String(err.message || err) });
  }
});

module.exports = router;
