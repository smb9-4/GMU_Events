require('dotenv').config();
const path = require('path');
const express = require('express');
const mongoose = require('mongoose');
const cookieParser = require('cookie-parser');
const bcrypt = require('bcryptjs');
const User = require('./src/models/User');
const Booking = require('./src/models/Booking');

const { MONGO_URI, MONGODB_URI: MONGODB_URI_ALT, JWT_SECRET, PORT = 3000 } = process.env;
const MONGODB_URI = MONGO_URI || MONGODB_URI_ALT;
const app = express();
app.set('trust proxy', 1); // needed on Render/Railway/Vercel so HTTPS cookies work
app.disable('x-powered-by');
app.use(express.json({ limit: '4mb' }));
app.use(cookieParser());

let databaseReady;
async function ensureDatabase() {
  if (!MONGODB_URI || !JWT_SECRET) {
    throw new Error('Missing MONGODB_URI or JWT_SECRET. Configure both environment variables.');
  }
  if (mongoose.connection.readyState === 1) return;
  if (!databaseReady) {
    databaseReady = (async () => {
      await mongoose.connect(MONGODB_URI);
      await Promise.all([User.syncIndexes(), Booking.syncIndexes()]);
      await ensureAdmin();
    })().catch((error) => {
      databaseReady = undefined;
      throw error;
    });
  }
  await databaseReady;
}

app.use(async (req, res, next) => {
  try {
    await ensureDatabase();
    next();
  } catch (error) {
    console.error('Database initialization failed:', error.message);
    res.status(500).json({ error: 'The service is temporarily unavailable. Please try again.' });
  }
});

app.use('/api/auth', require('./src/routes/auth'));
app.use('/api/events', require('./src/routes/events'));
app.use('/api/bookings', require('./src/routes/bookings'));
app.use('/api/admin', require('./src/routes/admin'));
app.use('/api/volunteer', require('./src/routes/volunteer'));
app.use('/api', (req, res) => res.status(404).json({ error: 'Not found' }));

const NO_CACHE_PAGES = new Set([
  '/admin', '/admin.html',
  '/student', '/student.html',
  '/volunteer', '/volunteer.html',
  '/event', '/event.html',
  '/event-details', '/event-details.html',
  '/ticket', '/ticket.html',
]);
app.use((req, res, next) => {
  if (NO_CACHE_PAGES.has(req.path)) {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
  }
  next();
});
app.use(express.static(path.join(__dirname, 'public'), { extensions: ['html'] }));

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  if (!err.expose) console.error(err);
  if (res.headersSent) return res.end();
  res.status(err.status || 500).json({ error: err.expose ? err.message : 'Something went wrong. Please try again.' });
});

async function ensureAdmin() {
  const { ADMIN_EMAIL, ADMIN_PASSWORD, ADMIN_NAME = 'Admin' } = process.env;
  if (!ADMIN_EMAIL || !ADMIN_PASSWORD) return;
  const email = ADMIN_EMAIL.trim().toLowerCase();
  if (await User.exists({ email })) return;
  await User.create({ name: ADMIN_NAME, email, role: 'admin', passwordHash: await bcrypt.hash(ADMIN_PASSWORD, 10) });
  console.log(`  Admin account created: ${email}`);
}

if (require.main === module) {
  ensureDatabase()
    .then(() => app.listen(PORT, () => console.log(`  Running on http://localhost:${PORT}`)))
    .catch((error) => {
      console.error('Failed to start:', error.message);
      process.exit(1);
    });
}

module.exports = app;
