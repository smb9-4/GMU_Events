const express = require('express');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const Event = require('../models/Event');
const Booking = require('../models/Booking');
const User = require('../models/User');
const { auth, httpError } = require('../middleware/auth');
const { SEAT_INDEX, seatsInRow } = require('../config/seatLayout');
const { seatCounts, currentOpenRow } = require('../utils/seats');

const router = express.Router();
router.use(auth('admin'));

const POSTER_RE = /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/;
const MAX_POSTER_CHARS = 2.5 * 1024 * 1024;
const MAX_SPEAKER_PHOTO_CHARS = 1.5 * 1024 * 1024;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const AUDIENCE_TYPES = new Set(['all', 'departments', 'semesters', 'faculty_students', 'custom']);

function readEventBody(b, { partial }) {
  const out = {};
  if (b.title !== undefined) {
    out.title = String(b.title).trim();
    if (!out.title) throw httpError(400, 'Event title is required.');
  } else if (!partial) throw httpError(400, 'Event title is required.');

  if (b.startsAt !== undefined) {
    const d = new Date(b.startsAt);
    if (Number.isNaN(d.getTime())) throw httpError(400, 'Please set a valid date and time.');
    out.startsAt = d;
  } else if (!partial) throw httpError(400, 'Please set the event date and time.');

  if (b.venue !== undefined) out.venue = String(b.venue).trim() || 'Hallama Auditorium';
  if (b.description !== undefined) out.description = String(b.description).trim();
  if (b.tagline !== undefined) out.tagline = String(b.tagline).trim().slice(0, 180);
  if (b.category !== undefined) out.category = String(b.category).trim().slice(0, 80);
  if (b.overview !== undefined) out.overview = String(b.overview).trim().slice(0, 4000);

  if (Array.isArray(b.highlights)) {
    out.highlights = b.highlights
      .map((h) => ({
        title: String(h?.title || '').trim().slice(0, 120),
        description: String(h?.description || '').trim().slice(0, 400),
      }))
      .filter((h) => h.title);
  }

  if (Array.isArray(b.speakers)) {
    out.speakers = b.speakers
      .map((s) => {
        const name = String(s?.name || '').trim().slice(0, 120);
        if (!name) return null;
        let photo = '';
        if (typeof s?.photo === 'string' && s.photo.trim()) {
          const p = s.photo.trim();
          if (!POSTER_RE.test(p)) throw httpError(400, `Speaker photo for ${name} must be a PNG, JPG or WEBP image.`);
          if (p.length > MAX_SPEAKER_PHOTO_CHARS) throw httpError(400, `Speaker photo for ${name} is too large.`);
          photo = p;
        }
        return {
          role: s?.role === 'guest' ? 'guest' : 'speaker',
          name,
          photo,
          designation: String(s?.designation || '').trim().slice(0, 120),
          organization: String(s?.organization || '').trim().slice(0, 160),
          bio: String(s?.bio || '').trim().slice(0, 800),
        };
      })
      .filter(Boolean);
  }

  if (Array.isArray(b.schedule)) {
    const items = [];
    for (const item of b.schedule) {
      const title = String(item?.title || '').trim().slice(0, 160);
      const startTime = String(item?.startTime || '').trim();
      const endTime = String(item?.endTime || '').trim();
      if (!title && !startTime && !endTime) continue;
      if (!title) throw httpError(400, 'Every schedule item must have a session title.');
      if (!TIME_RE.test(startTime) || !TIME_RE.test(endTime)) {
        throw httpError(400, `Please set valid start and end times for "${title}".`);
      }
      if (endTime <= startTime) {
        throw httpError(400, `End time must be after start time for "${title}".`);
      }
      items.push({
        title,
        startTime,
        endTime,
        speaker: String(item?.speaker || '').trim().slice(0, 120),
        description: String(item?.description || '').trim().slice(0, 500),
      });
    }
    items.sort((a, c) => a.startTime.localeCompare(c.startTime));
    out.schedule = items;
  }

  if (b.participation && typeof b.participation === 'object') {
    const p = b.participation;
    const audienceType = AUDIENCE_TYPES.has(p.audienceType) ? p.audienceType : 'all';
    const allDepartments = p.allDepartments !== undefined ? Boolean(p.allDepartments) : true;
    const allSemesters = p.allSemesters !== undefined ? Boolean(p.allSemesters) : true;
    out.participation = {
      audienceType,
      allDepartments,
      departments: allDepartments || !Array.isArray(p.departments)
        ? []
        : [...new Set(p.departments.map((d) => String(d).trim()).filter(Boolean))],
      allSemesters,
      semesters: allSemesters || !Array.isArray(p.semesters)
        ? []
        : [...new Set(p.semesters.map((s) => String(s).trim()).filter(Boolean))],
      customEligibility: String(p.customEligibility || '').trim().slice(0, 400),
    };
  }

  if (b.organizer && typeof b.organizer === 'object') {
    const o = b.organizer;
    out.organizer = {
      department: String(o.department || '').trim().slice(0, 140),
      facultyCoordinator: String(o.facultyCoordinator || '').trim().slice(0, 120),
      studentCoordinator: String(o.studentCoordinator || '').trim().slice(0, 120),
      contactPhone: String(o.contactPhone || '').trim().slice(0, 20),
      contactEmail: String(o.contactEmail || '').trim().slice(0, 140),
    };
  }

  for (const k of ['published', 'bookingOpen', 'sequentialRows']) {
    if (b[k] !== undefined) out[k] = Boolean(b[k]);
  }
  if (b.poster === null || b.poster === '') {
    out.poster = undefined;
    out.hasPoster = false;
  } else if (typeof b.poster === 'string') {
    if (!POSTER_RE.test(b.poster)) throw httpError(400, 'Poster must be a PNG, JPG or WEBP image.');
    if (b.poster.length > MAX_POSTER_CHARS) throw httpError(400, 'Poster image is too large.');
    out.poster = b.poster;
    out.hasPoster = true;
  }
  return out;
}

async function findEvent(id) {
  if (!mongoose.isValidObjectId(id)) throw httpError(404, 'Event not found.');
  const e = await Event.findById(id);
  if (!e) throw httpError(404, 'Event not found.');
  return e;
}

// ---------- Dashboard overview ----------
router.get('/overview', async (req, res) => {
  const since = new Date(Date.now() - 6 * 864e5);
  since.setHours(0, 0, 0, 0);
  const [students, staff, events, bookings, scanned, recent, signups] = await Promise.all([
    User.countDocuments({ role: 'student' }),
    User.countDocuments({ role: { $in: ['volunteer', 'admin'] } }),
    Event.countDocuments({}),
    Booking.countDocuments({}),
    Booking.countDocuments({ scannedAt: { $ne: null } }),
    Booking.find({}).sort({ createdAt: -1 }).limit(8)
      .populate('user', 'name dept sem').populate('event', 'title').lean(),
    User.aggregate([
      { $match: { role: 'student', createdAt: { $gte: since } } },
      { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt', timezone: 'Asia/Kolkata' } }, n: { $sum: 1 } } },
    ]),
  ]);
  const byDay = new Map(signups.map((s) => [s._id, s.n]));
  const days = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(Date.now() - i * 864e5);
    const key = d.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
    days.push({ day: key, n: byDay.get(key) || 0 });
  }
  res.json({
    totals: { students, staff, events, bookings, scanned },
    signups: days,
    recent: recent.map((b) => ({
      name: b.user?.name || '(deleted user)', dept: b.user?.dept, sem: b.user?.sem,
      seatId: b.seatId, eventTitle: b.event?.title || '', createdAt: b.createdAt, scannedAt: b.scannedAt,
    })),
  });
});

// ---------- Events ----------
router.post('/events', async (req, res) => {
  const data = readEventBody(req.body || {}, { partial: false });
  const guestRows = Array.isArray(req.body.guestRows) ? req.body.guestRows : ['A'];
  data.lockedSeats = guestRows.flatMap((r) => seatsInRow(String(r).toUpperCase()));
  data.createdBy = req.user._id;
  const event = await Event.create(data);
  res.status(201).json({ event: { id: event._id } });
});

router.put('/events/:id', async (req, res) => {
  const event = await findEvent(req.params.id);
  const data = readEventBody(req.body || {}, { partial: true });
  if ('poster' in data && data.poster === undefined) {
    event.poster = undefined;
    delete data.poster;
  }
  Object.assign(event, data);
  await event.save();
  res.json({ ok: true });
});

router.delete('/events/:id', async (req, res) => {
  const event = await findEvent(req.params.id);
  await Booking.deleteMany({ event: event._id });
  await event.deleteOne();
  res.json({ ok: true });
});

router.get('/events/:id/summary', async (req, res) => {
  const event = await findEvent(req.params.id);
  const bookings = await Booking.find({ event: event._id }).select('seatId scannedAt').lean();
  const ids = bookings.map((b) => b.seatId);
  res.json({
    counts: { ...seatCounts(event, ids), scanned: bookings.filter((b) => b.scannedAt).length },
    openRow: event.sequentialRows ? currentOpenRow(event, ids) : null,
  });
});

// Lock / unlock seats (guests, VIPs, broken seats...)
router.post('/events/:id/locks', async (req, res) => {
  const event = await findEvent(req.params.id);
  const lock = Boolean(req.body?.lock);
  let seatIds = [];
  if (req.body?.row) seatIds = seatsInRow(String(req.body.row).toUpperCase());
  else if (Array.isArray(req.body?.seatIds)) seatIds = req.body.seatIds.map((s) => String(s).toUpperCase()).filter((s) => SEAT_INDEX.has(s));
  if (!seatIds.length) throw httpError(400, 'No valid seats selected.');

  let skipped = [];
  if (lock) {
    const booked = new Set(await Booking.distinct('seatId', { event: event._id, seatId: { $in: seatIds } }));
    skipped = seatIds.filter((s) => booked.has(s));
    seatIds = seatIds.filter((s) => !booked.has(s));
    await Event.updateOne({ _id: event._id }, { $addToSet: { lockedSeats: { $each: seatIds } } });
  } else {
    await Event.updateOne({ _id: event._id }, { $pullAll: { lockedSeats: seatIds } });
  }
  res.json({ ok: true, changed: seatIds.length, skipped });
});

// All bookings of an event
router.get('/events/:id/bookings', async (req, res) => {
  const event = await findEvent(req.params.id);
  const list = await Booking.find({ event: event._id })
    .populate('user', 'name email phone dept sem college')
    .populate('scannedBy', 'name')
    .sort({ createdAt: 1 })
    .lean();
  res.json({
    bookings: list.map((b) => ({
      id: b._id,
      seatId: b.seatId,
      row: b.row,
      createdAt: b.createdAt,
      scannedAt: b.scannedAt,
      scannedBy: b.scannedBy?.name || null,
      user: b.user || { name: '(deleted user)' },
    })),
  });
});

// Cancel a booking (frees the seat)
router.delete('/bookings/:id', async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) throw httpError(404, 'Booking not found.');
  const r = await Booking.deleteOne({ _id: req.params.id });
  if (!r.deletedCount) throw httpError(404, 'Booking not found.');
  res.json({ ok: true });
});

// ---------- Students ----------
router.get('/students', async (req, res) => {
  const students = await User.find({ role: 'student' }).sort({ createdAt: -1 }).lean();
  let bookingByUser = new Map();
  if (req.query.eventId && mongoose.isValidObjectId(req.query.eventId)) {
    const bookings = await Booking.find({ event: req.query.eventId }).select('user seatId scannedAt').lean();
    bookingByUser = new Map(bookings.map((b) => [String(b.user), b]));
  }
  res.json({
    students: students.map((u) => {
      const b = bookingByUser.get(String(u._id));
      return {
        id: u._id, name: u.name, email: u.email, phone: u.phone, dept: u.dept, sem: u.sem, college: u.college,
        createdAt: u.createdAt, lastLoginAt: u.lastLoginAt,
        booking: b ? { id: b._id, seatId: b.seatId, scannedAt: b.scannedAt } : null,
      };
    }),
  });
});

// ---------- Staff (volunteers & admins) ----------
router.get('/staff', async (req, res) => {
  const staff = await User.find({ role: { $in: ['volunteer', 'admin'] } }).sort({ role: 1, name: 1 });
  res.json({ staff: staff.map((u) => u.toPublic()) });
});

router.post('/staff', async (req, res) => {
  const b = req.body || {};
  const name = String(b.name || '').trim();
  const email = String(b.email || '').trim().toLowerCase();
  const phone = String(b.phone || '').replace(/\D/g, '').slice(-10);
  const password = String(b.password || '');
  const role = b.role === 'admin' ? 'admin' : 'volunteer';
  if (name.length < 2) throw httpError(400, 'Name is required.');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) throw httpError(400, 'A valid email is required.');
  if (phone && phone.length !== 10) throw httpError(400, 'Phone must be 10 digits.');
  if (password.length < 6) throw httpError(400, 'Password must be at least 6 characters.');
  try {
    const user = await User.create({
      name, email, phone: phone || undefined, role,
      passwordHash: await bcrypt.hash(password, 10),
    });
    res.status(201).json({ user: user.toPublic() });
  } catch (e) {
    if (e.code === 11000) throw httpError(409, 'This email or phone is already used by another account.');
    throw e;
  }
});

router.delete('/staff/:id', async (req, res) => {
  if (String(req.params.id) === String(req.user._id)) throw httpError(400, 'You cannot remove your own account.');
  if (!mongoose.isValidObjectId(req.params.id)) throw httpError(404, 'Account not found.');
  const r = await User.deleteOne({ _id: req.params.id, role: { $in: ['volunteer', 'admin'] } });
  if (!r.deletedCount) throw httpError(404, 'Account not found.');
  res.json({ ok: true });
});

module.exports = router;
