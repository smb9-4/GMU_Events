const jwt = require('jsonwebtoken');
const User = require('../models/User');

const COOKIE = 'gmu_token';
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

function setSession(req, res, user) {
  const token = jwt.sign({ id: String(user._id), role: user.role }, process.env.JWT_SECRET, { expiresIn: '7d' });
  res.cookie(COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: req.secure, // true automatically when served over HTTPS (trust proxy is on)
    maxAge: MAX_AGE_MS,
  });
  return token;
}

function clearSession(res) {
  res.clearCookie(COOKIE);
}

async function currentUser(req) {
  const authHdr = String(req.headers.authorization || '');
  const bearer = authHdr.startsWith('Bearer ') ? authHdr.slice(7).trim() : '';
  const token = req.cookies?.[COOKIE] || bearer;
  if (!token) return null;
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    return await User.findById(payload.id);
  } catch {
    return null;
  }
}

/** auth() = any logged-in user; auth('admin') or auth('volunteer','admin') = only those roles. */
function auth(...roles) {
  return async (req, res, next) => {
    const user = await currentUser(req);
    if (!user) return res.status(401).json({ error: 'Please log in to continue.' });
    if (roles.length && !roles.includes(user.role)) {
      return res.status(403).json({ error: 'You do not have access to this.' });
    }
    req.user = user;
    next();
  };
}

function httpError(status, message) {
  const err = new Error(message);
  err.status = status;
  err.expose = true;
  return err;
}

module.exports = { auth, setSession, clearSession, httpError };
