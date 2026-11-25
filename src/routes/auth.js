const express = require('express');
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const { auth, setSession, clearSession, httpError } = require('../middleware/auth');

const router = express.Router();

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function cleanPhone(p) {
  const digits = String(p || '').replace(/\D/g, '');
  return digits.length > 10 ? digits.slice(-10) : digits;
}

router.post('/signup', async (req, res) => {
  const b = req.body || {};
  const name = String(b.name || '').trim();
  const email = String(b.email || '').trim().toLowerCase();
  const phone = cleanPhone(b.phone);
  const dept = String(b.dept || '').trim();
  const sem = Number(b.sem);
  const college = String(b.college || '').trim();
  const password = String(b.password || '');

  if (name.length < 2) throw httpError(400, 'Please enter your full name.');
  if (!/^[6-9]\d{9}$/.test(phone)) throw httpError(400, 'Please enter a valid 10-digit mobile number.');
  if (!EMAIL_RE.test(email)) throw httpError(400, 'Please enter a valid email address.');
  if (!dept) throw httpError(400, 'Please enter your department.');
  if (!Number.isInteger(sem) || sem < 1 || sem > 10) throw httpError(400, 'Please choose your semester.');
  if (!college) throw httpError(400, 'Please enter your college.');
  if (password.length < 6) throw httpError(400, 'Password must be at least 6 characters.');

  const existing = await User.findOne({ $or: [{ email }, { phone }] }).lean();
  if (existing) {
    throw httpError(409, existing.email === email ? 'An account with this email already exists. Please log in.' : 'This phone number is already registered. Please log in.');
  }

  let user;
  try {
    user = await User.create({
      name, email, phone, dept, sem, college,
      passwordHash: await bcrypt.hash(password, 10),
      role: 'student',
      lastLoginAt: new Date(),
    });
  } catch (e) {
    if (e.code === 11000) throw httpError(409, 'This email or phone number is already registered.');
    throw e;
  }
  setSession(req, res, user);
  res.status(201).json({ user: user.toPublic() });
});

router.post('/login', async (req, res) => {
  const id = String(req.body?.identifier || '').trim();
  const password = String(req.body?.password || '');
  if (!id || !password) throw httpError(400, 'Enter your email/phone and password.');

  const query = id.includes('@') ? { email: id.toLowerCase() } : { phone: cleanPhone(id) };
  const user = await User.findOne(query);
  if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
    throw httpError(401, 'Incorrect email/phone or password.');
  }
  user.lastLoginAt = new Date();
  await user.save();
  setSession(req, res, user);
  res.json({ user: user.toPublic() });
});

router.post('/logout', (req, res) => {
  clearSession(res);
  res.json({ ok: true });
});

router.get('/me', auth(), (req, res) => {
  res.json({ user: req.user.toPublic() });
});

module.exports = router;
