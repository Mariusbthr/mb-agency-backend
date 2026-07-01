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
