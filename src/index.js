require('dotenv').config();
const express = require('express');
const cors = require('cors');

require('./db'); // stellt sicher, dass die Datenbank+Tabellen beim Start existieren

const authRoutes = require('./routes/auth');
const creatorRoutes = require('./routes/creators');
const imageRoutes = require('./routes/images');
const reelRoutes = require('./routes/reels');

const app = express();
app.use(cors());
app.use(express.json());

// Higgsfield braucht eine oeffentlich erreichbare Bild-URL (kein Datei-Upload).
// Deshalb stellen wir den uploads-Ordner als statische Dateien bereit.
// DATA_DIR zeigt (falls gesetzt) auf die Persistent Disk bei Render.
const path = require('path');
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..');
app.use('/files', express.static(path.join(DATA_DIR, 'uploads')));

app.get('/', (req, res) => {
  res.json({ ok: true, agency: process.env.AGENCY_NAME || 'MB Agency' });
});

app.use('/auth', authRoutes);
app.use('/creators', creatorRoutes);
app.use('/creators', imageRoutes); // /creators/:creatorId/images
app.use('/reels', reelRoutes); // /reels/:creatorId/...

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`MB Agency Backend laeuft auf http://localhost:${PORT}`);
});
