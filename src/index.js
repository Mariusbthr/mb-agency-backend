// Absoluter Pfad, damit die .env-Datei unabhaengig vom Arbeitsverzeichnis
// gefunden wird (z.B. wenn der Server nicht direkt aus diesem Ordner heraus
// gestartet wird). Auf Render sind die Variablen ohnehin echte Environment
// Variables, dotenv ueberschreibt dort nichts.
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const express = require('express');
const cors = require('cors');

require('./db'); // stellt sicher, dass die Datenbank+Tabellen beim Start existieren

const authRoutes = require('./routes/auth');
const creatorRoutes = require('./routes/creators');
const imageRoutes = require('./routes/images');
const reelRoutes = require('./routes/reels');
const motionVideoRoutes = require('./routes/motionVideos');
const trendRoutes = require('./routes/trends');

const app = express();
app.use(cors());
app.use(express.json());

// Bilder/Videos werden dem Dashboard als statische Dateien bereitgestellt.
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
app.use('/motion-videos', motionVideoRoutes);
app.use('/trends', trendRoutes);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`MB Agency Backend laeuft auf http://localhost:${PORT}`);
});
