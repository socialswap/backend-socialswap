const mongoose = require('mongoose');

const bannerSchema = new mongoose.Schema({
  title: {
    type: String,
    default: '',
    trim: true
  },
  description: {
    type: String,
    trim: true
  },
  buttonText: {
    type: String,
    default: 'Shop Now'
  },
  buttonLink: {
    type: String,
    default: '/channels'
  },
  desktopImageUrl: {
    type: String,
    required: true
  },
  mobileImageUrl: {
    type: String,
    required: true
  },
  isActive: {
    type: Boolean,
    default: true
  },
  order: {
    type: Number,
    default: 0
  }
}, {
  timestamps: true
});

// Index for sorting
bannerSchema.index({ order: 1, createdAt: -1 });

const Banner = mongoose.model('Banner', bannerSchema);

module.exports = Banner;

