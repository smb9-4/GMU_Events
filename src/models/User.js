const mongoose = require('mongoose');

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 80 },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    phone: { type: String, trim: true, unique: true, sparse: true },
    dept: { type: String, trim: true, maxlength: 60 },
    sem: { type: Number, min: 1, max: 8 },
    college: { type: String, trim: true, maxlength: 120 },
    passwordHash: { type: String, required: true },
    role: { type: String, enum: ['student', 'volunteer', 'admin'], default: 'student', index: true },
    lastLoginAt: { type: Date },
  },
  { timestamps: true }
);

userSchema.methods.toPublic = function toPublic() {
  return {
    id: this._id,
    name: this.name,
    email: this.email,
    phone: this.phone,
    dept: this.dept,
    sem: this.sem,
    college: this.college,
    role: this.role,
    createdAt: this.createdAt,
    lastLoginAt: this.lastLoginAt,
  };
};

module.exports = mongoose.model('User', userSchema);
