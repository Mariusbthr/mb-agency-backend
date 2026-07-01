const Database = require('better-sqlite3');
const path = require('path');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', '..');
const dbPath = path.join(DATA_DIR, 'data.sqlite');
const db = new Database(dbPath);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

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

CREATE TABLE IF NOT EXISTS reels (
  id TEXT PRIMARY KEY,
  creator_id TEXT NOT NULL,
  source_image_id TEXT NOT NULL,
  requested_by TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'GENERATING', 'DONE', 'FAILED')),
  prompt_used TEXT,
  file_path TEXT,
  error_message TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  completed_at TEXT,
  FOREIGN KEY (creator_id) REFERENCES creators(id) ON DELETE CASCADE,
  FOREIGN KEY (source_image_id) REFERENCES images(id),
  FOREIGN KEY (requested_by) REFERENCES users(id)
);
`);

module.exports = db;
