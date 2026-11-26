const mongoose = require('mongoose');

const showcaseSlideSchema = new mongoose.Schema(
  {
    order:       { type: Number, default: 0 },
    image:       { type: String, required: true },   // base64 data-URL or /img/... path
    category:    { type: String, trim: true, maxlength: 80,  default: 'University Events' },
    title:       { type: String, trim: true, maxlength: 120, default: 'Campus moments' },
    date:        { type: String, trim: true, maxlength: 120, default: '' },
    description: { type: String, trim: true, maxlength: 400, default: '' },
  },
  { timestamps: true }
);

module.exports = mongoose.model('ShowcaseSlide', showcaseSlideSchema);
