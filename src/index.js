require('dotenv').config();
const express = require('express');
const cors = require('cors');

require('./db');

const authRoutes = require('./routes/auth');
const creatorRoutes = require('./routes/creators');
const imageRoutes = require('./routes/images');
const reelRoutes = require('./routes/reels');

const app = express();
app.use(cors());
app.use(express.json());

const path = require('path');
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..');
app.use('/files', express.static(path.join(DATA_DIR, 'uploads')));

app.get('/', (req, res) => {
  res.json({ ok: true, agency: process.env.AGENCY_NAME || 'MB Agency' });
});

app.use('/auth', authRoutes);
app.use('/creators', creatorRoutes);
app.use('/creators', imageRoutes);
app.use('/reels', reelRoutes);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`MB Agency Backend laeuft auf http://localhost:${PORT}`);
});
