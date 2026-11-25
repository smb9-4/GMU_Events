const mongoose = require('mongoose');

const bookingSchema = new mongoose.Schema(
  {
    event: { type: mongoose.Schema.Types.ObjectId, ref: 'Event', required: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    seatId: { type: String, required: true },
    row: { type: String, required: true },
    ticketCode: { type: String, required: true, unique: true }, // random, unguessable — this is what the QR holds
    scannedAt: { type: Date, default: null },
    scannedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true }
);

// One seat can be booked once per event, and one student books one seat per event.
// These unique indexes make double-booking impossible even if two people tap at the same moment.
bookingSchema.index({ event: 1, seatId: 1 }, { unique: true });
bookingSchema.index({ event: 1, user: 1 }, { unique: true });

module.exports = mongoose.model('Booking', bookingSchema);
