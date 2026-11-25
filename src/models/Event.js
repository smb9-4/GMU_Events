const mongoose = require('mongoose');

const eventSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 120 },
    venue: { type: String, trim: true, default: 'Hallama Auditorium', maxlength: 120 },
    startsAt: { type: Date, required: true },
    description: { type: String, trim: true, maxlength: 2000, default: '' },
    poster: { type: String, select: false }, // data URL (resized in the browser before upload)
    hasPoster: { type: Boolean, default: false },
    published: { type: Boolean, default: true },
    bookingOpen: { type: Boolean, default: true },
    sequentialRows: { type: Boolean, default: true }, // next row opens only when the current one is full
    lockedSeats: { type: [String], default: [] }, // reserved for guests etc.
    layoutKey: { type: String, default: 'hallama' },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Event', eventSchema);
