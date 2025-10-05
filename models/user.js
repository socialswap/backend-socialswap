// models/user.js
const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
  name: {
    type: String,
    default: ''
  },
  email: {
    type: String,
    lowercase: true,
    unique: false // Not required for OTP login
  },
  password: {
    type: String,
    select: false // Not needed for OTP login, but kept for compatibility if you add password in future
  },
  mobile: {
    type: String,
    required: true,
    unique: true
  },
  role: {
    type: String,
    default: 'user'
  }
}, { timestamps: true });

module.exports = mongoose.model('User', UserSchema);
