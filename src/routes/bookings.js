const express = require('express');
const mongoose = require('mongoose');
const Booking = require('../models/Booking');
const { auth, httpError } = require('../middleware/auth');
const { qrDataUrl, streamTicketPdf } = require('../utils/ticket');

const router = express.Router();

async function loadOwnBooking(req) {
  if (!mongoose.isValidObjectId(req.params.id)) throw httpError(404, 'Ticket not found.');
  const booking = await Booking.findById(req.params.id)
    .populate('event', 'title venue startsAt')
    .populate('user', 'name email phone dept sem college');
  if (!booking || !booking.event) throw httpError(404, 'Ticket not found.');
  const isOwner = String(booking.user?._id) === String(req.user._id);
  if (!isOwner && req.user.role !== 'admin') throw httpError(404, 'Ticket not found.');
  return booking;
}

// My tickets
router.get('/mine', auth(), async (req, res) => {
  const list = await Booking.find({ user: req.user._id })
    .populate('event', 'title venue startsAt hasPoster updatedAt')
    .sort({ createdAt: -1 })
    .lean();
  res.json({
    bookings: list
      .filter((b) => b.event)
      .map((b) => ({
        id: b._id,
        seatId: b.seatId,
        row: b.row,
        scannedAt: b.scannedAt,
        createdAt: b.createdAt,
        event: { id: b.event._id, title: b.event.title, venue: b.event.venue, startsAt: b.event.startsAt, hasPoster: b.event.hasPoster },
      })),
  });
});

// Ticket details + QR image
router.get('/:id', auth(), async (req, res) => {
  const b = await loadOwnBooking(req);
  res.json({
    booking: {
      id: b._id,
      seatId: b.seatId,
      row: b.row,
      scannedAt: b.scannedAt,
      createdAt: b.createdAt,
      code: b.ticketCode,
      qr: await qrDataUrl(b.ticketCode),
      event: { id: b.event._id, title: b.event.title, venue: b.event.venue, startsAt: b.event.startsAt },
      user: { name: b.user.name, email: b.user.email, phone: b.user.phone, dept: b.user.dept, sem: b.user.sem, college: b.user.college },
    },
  });
});

// Downloadable PDF ticket
router.get('/:id/ticket.pdf', auth(), async (req, res) => {
  const b = await loadOwnBooking(req);
  await streamTicketPdf(res, { booking: b, event: b.event, user: b.user });
});

module.exports = router;
