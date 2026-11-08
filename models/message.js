const mongoose = require('mongoose');

const MessageSchema = new mongoose.Schema({
  conversationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Conversation',
    required: true
  },
  sender: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  type: {
    type: String,
    enum: ["text", "image", "video", "file", "deal", "channel"],
    default: "text"
  },
  text: {
    type: String,
    default: ''
  },
  mediaUrl: {
    type: String,
    default: ''
  },
  isDeal: {
    type: Boolean,
    default: false
  },
  dealId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'EscrowDeal'
  },
  isChannel: {
    type: Boolean,
    default: false
  },
  channelId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'YouTubeChannel'
  },
  status: {
    type: String,
    enum: ["sent", "delivered", "seen"],
    default: "sent"
  },
  reactions: [{
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    reaction: String
  }],
  replyTo: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Message'
  },
  read: {
    type: Boolean,
    default: false
  }
}, { timestamps: true });

MessageSchema.index({ conversationId: 1, createdAt: 1 }); // load a thread
MessageSchema.index({ read: 1, sender: 1 }); // unread counts

const Message = mongoose.model('Message', MessageSchema);
module.exports = Message;
