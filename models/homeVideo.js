const mongoose = require('mongoose');

const HomeVideoSchema = new mongoose.Schema({
  url: {
    type: String,
    required: true,
    default: 'https://www.youtube.com/embed/dQw4w9WgXcQ' // Default video
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('HomeVideo', HomeVideoSchema);
