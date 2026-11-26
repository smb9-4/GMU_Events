const mongoose = require('mongoose');

const DEFAULT_LOGIN_SLIDES = [
  {
    image: '/img/event-tedx-1.png',
    category: 'TEDx & Conferences',
    title: 'Ideas worth\nsharing.',
    date: 'GM University Auditorium',
    description: 'Experience inspiring talks, bold ideas and unforgettable moments on campus.',
  },
  {
    image: '/img/event-tedx-2.png',
    category: 'TEDx & Conferences',
    title: 'The stage\nis yours.',
    date: 'University Conference Season',
    description: 'A premier platform for speakers, learners and future leaders to exchange perspectives.',
  },
  {
    image: '/img/event-tedx-3.png',
    category: 'Cultural Festivals',
    title: 'Celebrate\ntogether.',
    date: 'Campus Cultural Showcase',
    description: 'Discover music, dance and performances that bring the university community together.',
  },
  {
    image: '/img/event-festival.png',
    category: 'University Events',
    title: 'Beyond the\nclassroom.',
    date: 'Campus Activities',
    description: 'From cultural festivals to student achievements, explore everything happening at GM University.',
  },
];

const slideSchema = new mongoose.Schema(
  {
    image: { type: String, required: true },
    category: { type: String, trim: true, maxlength: 80, default: 'University Events' },
    title: { type: String, trim: true, maxlength: 160, default: 'GM University' },
    date: { type: String, trim: true, maxlength: 120, default: 'Campus Activities' },
    description: { type: String, trim: true, maxlength: 400, default: '' },
  },
  { _id: false }
);

const settingsSchema = new mongoose.Schema(
  {
    key: { type: String, unique: true, default: 'global' },
    globalLockedSeats: { type: [String], default: [] },
    loginSlides: { type: [slideSchema], default: [] },
  },
  { timestamps: true }
);

const Settings = mongoose.model('Settings', settingsSchema);

async function getSettings() {
  let doc = await Settings.findOne({ key: 'global' }).lean();
  if (!doc) {
    doc = (await Settings.create({ key: 'global', globalLockedSeats: [], loginSlides: [] })).toObject();
  }
  return {
    globalLockedSeats: Array.isArray(doc.globalLockedSeats) ? doc.globalLockedSeats : [],
    loginSlides: Array.isArray(doc.loginSlides) && doc.loginSlides.length ? doc.loginSlides : DEFAULT_LOGIN_SLIDES,
    hasCustomSlides: Array.isArray(doc.loginSlides) && doc.loginSlides.length > 0,
  };
}

module.exports = { Settings, getSettings, DEFAULT_LOGIN_SLIDES };
