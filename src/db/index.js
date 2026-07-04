const Database = require('better-sqlite3');
const path = require('path');

// Wenn DATA_DIR gesetzt ist (z.B. auf Render's Persistent Disk Mount-Pfad),
// liegt die Datenbank dort - ueberlebt dann Neustarts/Deploys.
// Ohne DATA_DIR (z.B. lokal auf deinem Rechner) bleibt es wie bisher.
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', '..');
const dbPath = path.join(DATA_DIR, 'data.sqlite');
const db = new Database(dbPath);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// --- Schema ---
// Wird beim Serverstart automatisch angelegt, falls noch nicht vorhanden.

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('OWNER', 'EMPLOYEE')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS creators (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (created_by) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS images (
  id TEXT PRIMARY KEY,
  creator_id TEXT NOT NULL,
  uploaded_by TEXT NOT NULL,
  file_path TEXT NOT NULL,
  original_name TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (creator_id) REFERENCES creators(id) ON DELETE CASCADE,
  FOREIGN KEY (uploaded_by) REFERENCES users(id)
);

-- Bibliothek mit echten, bereits dynamischen Bewegungs-Videos (Tanzen, Laufen,
-- GRWM etc.), die als Vorlage fuer den manuellen Face-Swap in Higgsfields
-- Web-Oberflaeche dienen. Agentur-weit, nicht pro Creator, damit sie fuer
-- alle Creatorinnen wiederverwendet werden koennen.
CREATE TABLE IF NOT EXISTS motion_videos (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  style_tag TEXT NOT NULL,
  file_path TEXT NOT NULL,
  uploaded_by TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (uploaded_by) REFERENCES users(id)
);

-- Regelmaessig per Claude+Websuche aktualisierte "Reel-Rezepte" (Sound-Art,
-- Hook-Idee, Schnitttempo) fuer aktuelle virale Trends. Bei jeder Aktualisierung
-- werden alte Rezepte deaktiviert (active = 0) statt geloescht, damit bereits
-- zugewiesene Reels ihren urspruenglichen Kontext behalten.
CREATE TABLE IF NOT EXISTS trend_recipes (
  id TEXT PRIMARY KEY,
  style_name TEXT NOT NULL,
  description TEXT NOT NULL,
  audio_suggestion TEXT,
  hook_suggestion TEXT,
  cut_pace TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS reels (
  id TEXT PRIMARY KEY,
  creator_id TEXT NOT NULL,
  source_image_id TEXT NOT NULL,
  requested_by TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'ASSIGNED' CHECK (status IN ('ASSIGNED', 'DONE', 'FAILED')),
  motion_video_id TEXT,
  recipe_snapshot TEXT,
  prompt_used TEXT,
  file_path TEXT,
  error_message TEXT,
  downloaded INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  completed_at TEXT,
  FOREIGN KEY (creator_id) REFERENCES creators(id) ON DELETE CASCADE,
  FOREIGN KEY (source_image_id) REFERENCES images(id),
  FOREIGN KEY (requested_by) REFERENCES users(id),
  FOREIGN KEY (motion_video_id) REFERENCES motion_videos(id)
);
`);

// Migration: bestehende (aeltere) reels-Tabelle auf das neue Schema heben -
// noetig fuer die bereits auf Render laufende Datenbank, die noch die alten
// Higgsfield-Status (PENDING/GENERATING) und keine motion_video_id/recipe_snapshot
// Spalten kennt. CHECK-Constraints lassen sich in SQLite nicht per ALTER aendern,
// deshalb wird die Tabelle bei Bedarf neu angelegt und die Daten uebernommen.
const reelsTableInfo = db.prepare(`SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'reels'`).get();
if (reelsTableInfo && !reelsTableInfo.sql.includes('ASSIGNED')) {
  db.exec(`
    ALTER TABLE reels RENAME TO reels_old;

    CREATE TABLE reels (
      id TEXT PRIMARY KEY,
      creator_id TEXT NOT NULL,
      source_image_id TEXT NOT NULL,
      requested_by TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'ASSIGNED' CHECK (status IN ('ASSIGNED', 'DONE', 'FAILED')),
      motion_video_id TEXT,
      recipe_snapshot TEXT,
      prompt_used TEXT,
      file_path TEXT,
      error_message TEXT,
      downloaded INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      completed_at TEXT,
      FOREIGN KEY (creator_id) REFERENCES creators(id) ON DELETE CASCADE,
      FOREIGN KEY (source_image_id) REFERENCES images(id),
      FOREIGN KEY (requested_by) REFERENCES users(id),
      FOREIGN KEY (motion_video_id) REFERENCES motion_videos(id)
    );

    INSERT INTO reels (id, creator_id, source_image_id, requested_by, status, prompt_used, file_path, error_message, downloaded, created_at, completed_at)
      SELECT id, creator_id, source_image_id, requested_by,
        CASE status WHEN 'DONE' THEN 'DONE' WHEN 'FAILED' THEN 'FAILED' ELSE 'ASSIGNED' END,
        prompt_used, file_path, error_message, downloaded, created_at, completed_at
      FROM reels_old;

    DROP TABLE reels_old;
  `);
}

// Alte Einzelspalten-Migration (aus einer frueheren Version, vor Einfuehrung
// des obigen vollstaendigen Migrationspfads) - bleibt als Absicherung stehen,
// falls sie in einer Zwischenversion schon einmal separat gelaufen ist.
try {
  db.exec(`ALTER TABLE reels ADD COLUMN downloaded INTEGER NOT NULL DEFAULT 0`);
} catch (e) {
  // Spalte existiert schon - kein Problem, einfach ignorieren
}

module.exports = db;
