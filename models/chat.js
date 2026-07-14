const mongoose = require('mongoose');

const MessageSchema = new mongoose.Schema({
  sender: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  text: {
    type: String,
    default: ''
  },
  imageUrl: {
    type: String,
    default: ''
  },
  isDealCard: {
    type: Boolean,
    default: false
  },
  dealId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'EscrowDeal'
  },
  isChannelCard: {
    type: Boolean,
    default: false
  },
  channelId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'YouTubeChannel'
  },
  read: {
    type: Boolean,
    default: false
  }
}, { timestamps: true });

const ChatThreadSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  admin: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    // Could be null initially if an admin hasn't joined, but let's say it's required when an admin replies
  },
  messages: [MessageSchema],
  lastMessageAt: {
    type: Date,
    default: Date.now
  }
}, { timestamps: true });

// Compound index for quick lookup
ChatThreadSchema.index({ user: 1 });

const ChatThread = mongoose.model('ChatThread', ChatThreadSchema);
module.exports = ChatThread;
