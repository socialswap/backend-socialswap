const mongoose = require('mongoose');

const ConversationSchema = new mongoose.Schema({
  participants: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  lastMessage: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Message'
  }
}, { timestamps: true });

// Compound index for quick lookup by participant
ConversationSchema.index({ participants: 1 });

const Conversation = mongoose.model('Conversation', ConversationSchema);
module.exports = Conversation;
