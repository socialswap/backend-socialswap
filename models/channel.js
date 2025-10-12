const mongoose = require('mongoose');

const channelSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    index: true
  },
  customUrl: {
    type: String,
    required: true,
    unique: true
  },
  organicGrowth:{
    type:Boolean
  },
  imageUrls: {
    type: [String],
    validate: {
      validator: function(v) {
        return v && v.length >= 2 && v.length <= 4;
      },
      message: 'Between 2 and 4 images are required'
    },
    required: [true, 'Channel images are required']
  },
  price: {
    type: String,
    required: true,
  },
  paymentId:{
    type:String,
  },
  buyer:{
    type:String
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
  monetized: {
    type: Boolean,
    required: true
  },
  watchTimeHours: {
    type: Number,
    required: true,
    min: 0
  },
  banner: {
    type: String,
    default: ''
  },
  avatar: {
    type: String,
    default: ''
  },
  soldPrice: {
    type: Number,
    min: 0
  },
  seller:{
    type:String,
    required:true
  },
  status:{
    type:String,
  },
  bannerUrl: {
    type: String,
    required: [true, 'Banner image is required']
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
  banner:{
    type:String,
    // required:true
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
}, {
  timestamps: true // This will add createdAt and updatedAt fields
});

// Create text index for search functionality
channelSchema.index({ name: 'text', description: 'text' });

// Create compound index for common filter combinations
channelSchema.index({ category: 1, status: 1, monetized: 1, channelType: 1 });

const Channel = mongoose.model('YouTubeChannel', channelSchema);

module.exports = Channel;