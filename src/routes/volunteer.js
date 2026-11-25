const express = require('express');
const mongoose = require('mongoose');
const Event = require('../models/Event');
const Booking = require('../models/Booking');
const { auth, httpError } = require('../middleware/auth');
const { parseTicketCode } = require('../utils/ticket');

const router = express.Router();
router.use(auth('volunteer', 'admin'));

function person(b) {
  const u = b.user || {};
  return { name: u.name || '(unknown)', dept: u.dept, sem: u.sem, phone: u.phone, college: u.college };
}

router.get('/events', async (req, res) => {
  const events = await Event.find({ published: true }).sort({ startsAt: 1 }).select('title venue startsAt').lean();
  res.json({ events: events.map((e) => ({ id: e._id, title: e.title, venue: e.venue, startsAt: e.startsAt })) });
});

/**
 * Scan a QR code.
 * Always answers 200 with a status the scanner screen can show:
 *   ok          → valid ticket, now checked in ("DONE")
 *   already     → valid ticket but it was already used
 *   wrong_event → a real ticket, but for another event
 *   invalid     → not one of our tickets
 */
router.post('/scan', async (req, res) => {
  const eventId = req.body?.eventId;
  if (!mongoose.isValidObjectId(eventId)) throw httpError(400, 'Choose an event first.');
  const code = parseTicketCode(req.body?.code);
  if (!code) return res.json({ status: 'invalid' });

  const booking = await Booking.findOne({ ticketCode: code }).populate('user', 'name dept sem phone college').populate('event', 'title');
  if (!booking || !booking.event) return res.json({ status: 'invalid' });

  if (String(booking.event._id) !== String(eventId)) {
    return res.json({ status: 'wrong_event', seatId: booking.seatId, eventTitle: booking.event.title, person: person(booking) });
  }

  // Atomic: only the first scan wins, even if two volunteers scan at the same time
  const updated = await Booking.findOneAndUpdate(
    { _id: booking._id, scannedAt: null },
    { $set: { scannedAt: new Date(), scannedBy: req.user._id } },
    { new: true }
  );
  if (!updated) {
    const fresh = await Booking.findById(booking._id).populate('scannedBy', 'name').lean();
    return res.json({
      status: 'already',
      seatId: booking.seatId,
      person: person(booking),
      scannedAt: fresh?.scannedAt,
      scannedBy: fresh?.scannedBy?.name || null,
    });
  }
  res.json({ status: 'ok', seatId: booking.seatId, person: person(booking), scannedAt: updated.scannedAt });
});

// Manual check-in (when a phone screen can't be scanned)
router.post('/checkin/:bookingId', async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.bookingId)) throw httpError(404, 'Booking not found.');
  const updated = await Booking.findOneAndUpdate(
    { _id: req.params.bookingId, scannedAt: null },
    { $set: { scannedAt: new Date(), scannedBy: req.user._id } },
    { new: true }
  );
  if (!updated) {
    const exists = await Booking.exists({ _id: req.params.bookingId });
    throw httpError(exists ? 409 : 404, exists ? 'Already checked in.' : 'Booking not found.');
  }
  res.json({ ok: true, scannedAt: updated.scannedAt });
});

// Everyone booked for an event, with scanned / not scanned
router.get('/events/:id/attendees', async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) throw httpError(404, 'Event not found.');
  const list = await Booking.find({ event: req.params.id })
    .populate('user', 'name dept sem phone college')
    .populate('scannedBy', 'name')
    .sort({ row: 1, seatId: 1 })
    .lean();
  res.json({
    attendees: list.map((b) => ({
      id: b._id,
      seatId: b.seatId,
      row: b.row,
      scannedAt: b.scannedAt,
      scannedBy: b.scannedBy?.name || null,
      ...person(b),
    })),
  });
});

module.exports = router;
