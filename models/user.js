// models/user.js

const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true
  },
  email: {
    type: String,
    required: true,
    unique: true  
  },
  password: {
    type: String,
    // Password not required for OAuth or OTP-only users
    required: function() {
      return !this.googleId && this.authProvider !== 'email-otp';
    }
  },
  googleId: {
    type: String,
    unique: true,
    sparse: true // Allows null values but ensures uniqueness when present
  },
  authProvider: {
    type: String,
    enum: ['local', 'google', 'phone', 'email-otp'],
    default: 'local'
  },
  avatar: {
    type: String
  },
  mobile:{
    type:String
  },
  role:{
    type:String,
    required:true,
    default: 'buyer'
  },
  emailOtpHash: {
    type: String,
    select: false
  },
  emailOtpExpires: {
    type: Date,
    select: false
  }
  // ... other fields
});

module.exports = mongoose.model('User', UserSchema);