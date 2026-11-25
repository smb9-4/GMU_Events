const mongoose = require('mongoose');

const highlightSchema = new mongoose.Schema(
  {
    title: { type: String, trim: true, maxlength: 120, required: true },
    description: { type: String, trim: true, maxlength: 400, default: '' },
  },
  { _id: false }
);

const speakerSchema = new mongoose.Schema(
  {
    role: { type: String, enum: ['speaker', 'guest'], default: 'speaker' },
    name: { type: String, trim: true, maxlength: 120, required: true },
    photo: { type: String, default: '' },
    designation: { type: String, trim: true, maxlength: 120, default: '' },
    organization: { type: String, trim: true, maxlength: 160, default: '' },
    bio: { type: String, trim: true, maxlength: 800, default: '' },
  },
  { _id: false }
);

const scheduleItemSchema = new mongoose.Schema(
  {
    title: { type: String, trim: true, maxlength: 160, required: true },
    startTime: { type: String, trim: true, maxlength: 10, required: true },
    endTime: { type: String, trim: true, maxlength: 10, required: true },
    speaker: { type: String, trim: true, maxlength: 120, default: '' },
    description: { type: String, trim: true, maxlength: 500, default: '' },
  },
  { _id: false }
);

const eventSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 120 },
    tagline: { type: String, trim: true, maxlength: 180, default: '' },
    category: { type: String, trim: true, maxlength: 80, default: '' },
    venue: { type: String, trim: true, default: 'Hallama Auditorium', maxlength: 120 },
    startsAt: { type: Date, required: true },
    description: { type: String, trim: true, maxlength: 2000, default: '' },
    overview: { type: String, trim: true, maxlength: 4000, default: '' },
    highlights: { type: [highlightSchema], default: [] },
    speakers: { type: [speakerSchema], default: [] },
    schedule: { type: [scheduleItemSchema], default: [] },
    participation: {
      audienceType: {
        type: String,
        enum: ['all', 'departments', 'semesters', 'faculty_students', 'custom'],
        default: 'all',
      },
      allDepartments: { type: Boolean, default: true },
      departments: { type: [String], default: [] },
      allSemesters: { type: Boolean, default: true },
      semesters: { type: [String], default: [] },
      customEligibility: { type: String, trim: true, maxlength: 400, default: '' },
    },
    organizer: {
      department: { type: String, trim: true, maxlength: 140, default: '' },
      facultyCoordinator: { type: String, trim: true, maxlength: 120, default: '' },
      studentCoordinator: { type: String, trim: true, maxlength: 120, default: '' },
      contactPhone: { type: String, trim: true, maxlength: 20, default: '' },
      contactEmail: { type: String, trim: true, maxlength: 140, default: '' },
    },
    poster: { type: String, select: false }, // data URL (resized in the browser before upload)
    hasPoster: { type: Boolean, default: false },
    published: { type: Boolean, default: true },
    bookingOpen: { type: Boolean, default: true },
    sequentialRows: { type: Boolean, default: true }, // next row opens only when the current one is full
    rowLimitEnabled: { type: Boolean, default: false },
    openRowCount: { type: Number, default: 5, min: 1, max: 20 },
    lockedSeats: { type: [String], default: [] }, // reserved for guests etc.
    layoutKey: { type: String, default: 'hallama' },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Event', eventSchema);
