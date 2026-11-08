const mongoose = require('mongoose');
const Conversation = require('../models/chat');
const Message = require('../models/message');
const User = require('../models/user');
const { uploadToR2 } = require('../config/r2');

const MESSAGE_PAGE_SIZE = 50;

// Everything a chat bubble shows. Passing them together lets Mongoose fetch them in parallel.
const MESSAGE_POPULATE = [
  { path: 'sender', select: 'name avatar role' },
  { path: 'dealId', populate: { path: 'channel', select: 'name price bannerUrl' } },
  { path: 'channelId', select: 'name price category subscriberCount imageUrls customUrl' },
  { path: 'reactions.user', select: 'name avatar' },
  { path: 'replyTo', populate: { path: 'sender', select: 'name' } }
];

/**
 * Returns the newest messages first-page-style, like WhatsApp: the latest 50,
 * or the 50 before `before` (a message id) when the user scrolls up.
 * Message ids grow over time, so they work as a stable cursor.
 */
const loadMessages = async (conversationId, query = {}) => {
  const limit = Math.min(Math.max(parseInt(query.limit, 10) || MESSAGE_PAGE_SIZE, 1), 100);
  const filter = { conversationId };
  if (query.before && mongoose.Types.ObjectId.isValid(String(query.before))) {
    filter._id = { $lt: new mongoose.Types.ObjectId(String(query.before)) };
  }

  const page = await Message.find(filter)
    .sort({ _id: -1 })
    .limit(limit + 1)
    .populate(MESSAGE_POPULATE)
    .lean();

  const hasMore = page.length > limit;
  return { messages: page.slice(0, limit).reverse(), hasMore };
};

exports.MESSAGE_POPULATE = MESSAGE_POPULATE;

// Fetch chat conversation for a user (or create if it doesn't exist)
exports.getChatThread = async (req, res) => {
  try {
    const userId = req.user.userId || req.user._id; 
    let conversation = await Conversation.findOne({ participants: userId })
      .populate('participants', 'name email avatar role');
    
    if (!conversation) {
      // By default, it's a 1-on-1 with admin, but we can just add the user for now
      conversation = new Conversation({ participants: [userId] });
      await conversation.save();
      // fetch again to populate
      conversation = await Conversation.findById(conversation._id).populate('participants', 'name email avatar role');
    }
    
    const { messages, hasMore } = await loadMessages(conversation._id, req.query);

    res.status(200).json({ success: true, thread: conversation, messages, hasMore });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Admin fetching all chat threads
exports.getAllThreads = async (req, res) => {
  try {
    const threads = await Conversation.find()
      .populate('participants', 'name email avatar role')
      .populate('lastMessage')
      .sort({ updatedAt: -1 });
    res.status(200).json({ success: true, threads });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Admin fetching a specific chat thread
exports.getThreadById = async (req, res) => {
  try {
    const { threadId } = req.params;
    const conversation = await Conversation.findById(threadId)
      .populate('participants', 'name email avatar role');
      
    if (!conversation) return res.status(404).json({ success: false, message: 'Thread not found' });
    
    const { messages, hasMore } = await loadMessages(conversation._id, req.query);

    res.status(200).json({ success: true, thread: conversation, messages, hasMore });
  }catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Admin fetching or creating a chat thread for a specific user
exports.getThreadByUserId = async (req, res) => {
  try {
    const { userId } = req.params;
    let conversation = await Conversation.findOne({ participants: userId })
      .populate('participants', 'name email avatar role');
      
    if (!conversation) {
      conversation = new Conversation({ participants: [userId] });
      await conversation.save();
      conversation = await Conversation.findById(conversation._id).populate('participants', 'name email avatar role');
    }
    
    const { messages, hasMore } = await loadMessages(conversation._id, req.query);

    res.status(200).json({ success: true, thread: conversation, messages, hasMore });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Upload image from chat
exports.uploadChatImage = async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, message: 'No image provided' });
    
    const imageUrl = await uploadToR2(req.file.buffer, req.file.originalname, req.file.mimetype);
    res.status(200).json({ success: true, imageUrl });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Get global unread message count for a user or admin
exports.getUnreadCount = async (req, res) => {
  try {
    const userId = req.user.userId || req.user._id;
    const user = await User.findById(userId);
    let unreadCount = 0;

    if (user.role === 'admin') {
      // For admin: count unread messages from any normal user
      // Assuming normal users aren't admins, we can just find messages where sender is not an admin, or just read: false and not sent by current admin
      // Actually it's easier to find messages with read: false and sender not equal to this admin
      const adminUsers = await User.find({ role: 'admin' }).select('_id');
      const adminIds = adminUsers.map(a => a._id);
      unreadCount = await Message.countDocuments({
        read: false,
        sender: { $nin: adminIds }
      });
    } else {
      // For user: count unread messages in their thread sent by admin
      const conversation = await Conversation.findOne({ participants: userId });
      if (conversation) {
        unreadCount = await Message.countDocuments({
          conversationId: conversation._id,
          read: false,
          sender: { $ne: userId }
        });
      }
    }

    res.status(200).json({ success: true, unreadCount });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
