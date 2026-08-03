const mongoose = require('mongoose');


const channelSchema = new mongoose.Schema({
  // Who created/listed this channel (reference to User)
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  // Legacy seller field kept for backward compatibility
  seller: {
    type: String,
    required: true
  },
  name: {
    type: String,
    required: true,
    index: true
  },
  // Public YouTube channel link (e.g. https://youtube.com/@channelname)
  channelLink: {
    type: String,
    required: true
  },
  customUrl: {
    type: String,
    required: true,
    unique: true
  },
  organicGrowth: {
    type: Boolean
  },
  imageUrls: {
    type: [String],
    validate: {
      validator: function(v) {
        return v && v.length >= 2 && v.length <= 10;
      },
      message: 'Between 2 and 10 images are required'
    },
    required: [true, 'Channel images are required']
  },
  bannerUrl: {
    type: String,
    default: ''  // Optional banner field
  },
  logoUrl: {
    type: String,
    default: ''
  },
  price: {
    type: String,
    required: true,
  },
  paymentId: {
    type: String,
  },
  description: {
    type: String,
    required: true
  },
  subscriberCount: {
    type: Number,
    required: true,
    min: 0
  },
  viewCount: {
    type: Number,
    required: true,
    min: 0
  },
  videoCount: {
    type: Number,
    required: true,
    min: 0
  },
  estimatedEarnings: {
    type: Number,
    required: true,
    min: 0
  },
  category: {
    type: String,
    required: true,
  },
  channelType: {
    type: String,
    required: true,
    enum: ['Long Videos', 'Short Videos', 'Both Long & Short Videos']
  },
  joinedDate: {
    type: Date,
    required: true
  },
  country: {
    type: String,
    required: true
  },
  averageViewsPerVideo: {
    type: Number,
    required: true,
    min: 0
  },
  my_language: {
    type: String,
  },
  recentViews: {
    type: Number,
    required: true,
    min: 0
  },
  copyrightStrike: {
    type: String,
    required: true
  },
  communityStrike: {
    type: String,
    required: true
  },
  monetized: {
    type: Boolean,
    required: true
  },
  watchTimeHours: {
    type: Number,
    required: true,
    min: 0
  },
  avatar: {
    type: String,
    default: ''
  },
  sold: {
    type: Boolean,
    default: false
  },
  soldPrice: {
    type: Number,
    min: 0
  },
  buyer: {
    type: String,
    validate: {
      validator: function(v) {
        return /^[\w-\.]+@([\w-]+\.)+[\w-]{2,4}$/.test(v);
      },
      message: props => `${props.value} is not a valid email address!`
    }
  },
  status: {
    type: String,
    default: 'Available'
  },
  contactInfo: {
    email: {
      type: String,
      required: true,
      match: [/^[^\s@]+@[^\s@]+\.[^\s@]+$/, 'Please enter a valid email address']
    },
    phone: {
      type: String,
      required: true,
      match: [/^[+]?[\d\s-]+$/, 'Please enter a valid phone number']
    }
  },
  mostDemanding: {
    type: Boolean,
    default: false
  },
  // SEO fields
  metaTitle: { type: String, trim: true, maxlength: 60 },
  metaDescription: { type: String, trim: true, maxlength: 160 },
  seoKeywords: [{ type: String, trim: true }],
  noIndex: { type: Boolean, default: false },
}, {
  timestamps: true // Adds createdAt and updatedAt fields
});

// Text index for search
channelSchema.index({ name: 'text', description: 'text' });

// Compound index for common filter combinations
channelSchema.index({ category: 1, status: 1, monetized: 1, channelType: 1 });
channelSchema.index({ createdBy: 1, createdAt: -1 });
channelSchema.index({ customUrl: 1 }, { unique: true, sparse: true }); // fast username lookup

const Channel = mongoose.model('YouTubeChannel', channelSchema);

module.exports = Channel;