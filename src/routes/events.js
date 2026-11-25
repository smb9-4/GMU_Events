const express = require('express');
const mongoose = require('mongoose');
const Event = require('../models/Event');
const Booking = require('../models/Booking');
const { auth, httpError } = require('../middleware/auth');
const { PUBLIC_LAYOUT, SEAT_INDEX } = require('../config/seatLayout');
const { currentOpenRow, seatCounts } = require('../utils/seats');
const { newTicketCode } = require('../utils/ticket');

const router = express.Router();

function eventSummary(e) {
  return {
    id: e._id,
    title: e.title,
    venue: e.venue,
    startsAt: e.startsAt,
    description: e.description,
    hasPoster: e.hasPoster,
    posterVersion: new Date(e.updatedAt || Date.now()).getTime(),
    published: e.published,
    bookingOpen: e.bookingOpen,
    sequentialRows: e.sequentialRows,
  };
}

async function loadEvent(id, user) {
  if (!mongoose.isValidObjectId(id)) throw httpError(404, 'Event not found.');
  const event = await Event.findById(id);
  if (!event || (!event.published && user?.role !== 'admin')) throw httpError(404, 'Event not found.');
  return event;
}

// List events (students only see published ones)
router.get('/', auth(), async (req, res) => {
  const filter = req.user.role === 'admin' ? {} : { published: true };
  const events = await Event.find(filter).sort({ startsAt: 1 }).lean();
  const ids = events.map((e) => e._id);
  const bookings = await Booking.find({ event: { $in: ids } }).select('event seatId user').lean();

  const byEvent = new Map();
  for (const b of bookings) {
    const k = String(b.event);
    if (!byEvent.has(k)) byEvent.set(k, []);
    byEvent.get(k).push(b);
  }

  res.json({
    events: events.map((e) => {
      const list = byEvent.get(String(e._id)) || [];
      const mine = list.find((b) => String(b.user) === String(req.user._id));
      return {
        ...eventSummary(e),
        counts: seatCounts(e, list.map((b) => b.seatId)),
        myBooking: mine ? { id: mine._id, seatId: mine.seatId } : null,
      };
    }),
  });
});

router.get('/:id', auth(), async (req, res) => {
  const event = await loadEvent(req.params.id, req.user);
  res.json({ event: eventSummary(event) });
});

// Poster image (public so <img> tags work everywhere)
router.get('/:id/poster', async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).end();
  const e = await Event.findById(req.params.id).select('+poster').lean();
  const m = e?.poster && /^data:(image\/(?:png|jpeg|webp));base64,(.+)$/.exec(e.poster);
  if (!m) return res.status(404).end();
  res.setHeader('Content-Type', m[1]);
  res.setHeader('Cache-Control', 'public, max-age=86400');
  res.send(Buffer.from(m[2], 'base64'));
});

// Seat map state
router.get('/:id/seats', auth(), async (req, res) => {
  const event = await loadEvent(req.params.id, req.user);
  const staff = req.user.role !== 'student';
  const q = Booking.find({ event: event._id }).select('seatId user scannedAt');
  if (staff) q.populate('user', 'name dept sem phone email college');
  const bookings = await q.lean();

  const bookedIds = bookings.map((b) => b.seatId);
  const mine = bookings.find((b) => String(b.user?._id || b.user) === String(req.user._id));

  const payload = {
    event: eventSummary(event),
    layout: PUBLIC_LAYOUT,
    booked: bookedIds,
    locked: event.lockedSeats,
    openRow: event.sequentialRows ? currentOpenRow(event, bookedIds) : null,
    counts: seatCounts(event, bookedIds),
    myBooking: mine ? { id: mine._id, seatId: mine.seatId } : null,
  };

  if (staff) {
    payload.details = {};
    for (const b of bookings) {
      payload.details[b.seatId] = {
        bookingId: b._id,
        name: b.user?.name,
        dept: b.user?.dept,
        sem: b.user?.sem,
        phone: b.user?.phone,
        email: b.user?.email,
        scannedAt: b.scannedAt,
      };
    }
  }
  res.json(payload);
});

// Book one seat (students only)
router.post('/:id/book', auth('student'), async (req, res) => {
  const seatId = String(req.body?.seatId || '').toUpperCase();
  const seat = SEAT_INDEX.get(seatId);
  if (!seat) throw httpError(400, 'Please pick a valid seat.');

  const event = await loadEvent(req.params.id, req.user);
  if (!event.bookingOpen) throw httpError(409, 'Booking is closed for this event.');
  if (event.lockedSeats.includes(seatId)) throw httpError(409, `Seat ${seatId} is reserved and cannot be booked.`);

  const already = await Booking.findOne({ event: event._id, user: req.user._id }).lean();
  if (already) {
    return res.status(409).json({ error: `You have already booked seat ${already.seatId} for this event.`, bookingId: already._id });
  }

  if (event.sequentialRows) {
    const bookedIds = await Booking.distinct('seatId', { event: event._id });
    const openRow = currentOpenRow(event, bookedIds);
    if (!openRow) throw httpError(409, 'Sorry, this event is fully booked.');
    if (seat.row !== openRow) {
      throw httpError(409, `Row ${openRow} is being filled right now. Please pick a seat in row ${openRow}.`);
    }
  }

  try {
    const booking = await Booking.create({
      event: event._id,
      user: req.user._id,
      seatId,
      row: seat.row,
      ticketCode: newTicketCode(),
    });
    res.status(201).json({ booking: { id: booking._id, seatId: booking.seatId } });
  } catch (e) {
    if (e.code === 11000) {
      if (e.keyPattern?.user) throw httpError(409, 'You have already booked a seat for this event.');
      throw httpError(409, `Seat ${seatId} was just taken by someone else. Please pick another seat.`);
    }
    throw e;
  }
});

module.exports = router;
