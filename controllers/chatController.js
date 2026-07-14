const ChatThread = require('../models/chat');
const User = require('../models/user');
const { uploadToR2 } = require('../config/r2');

// Fetch chat thread for a user (or create if it doesn't exist)
exports.getChatThread = async (req, res) => {
  try {
    const userId = req.user.userId || req.user._id; 
    let thread = await ChatThread.findOne({ user: userId })
      .populate('messages.sender', 'name avatar role')
      .populate({
        path: 'messages.dealId',
        populate: { path: 'channel', select: 'name price bannerUrl' }
      })
      .populate('messages.channelId', 'name price category subscriberCount imageUrls customUrl');
    
    if (!thread) {
      thread = new ChatThread({ user: userId });
      await thread.save();
    }
    
    res.status(200).json({ success: true, thread });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Admin fetching all chat threads
exports.getAllThreads = async (req, res) => {
  try {
    const threads = await ChatThread.find()
      .populate('user', 'name email avatar')
      .sort({ lastMessageAt: -1 });
    res.status(200).json({ success: true, threads });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Admin fetching a specific chat thread
exports.getThreadById = async (req, res) => {
  try {
    const { threadId } = req.params;
    const thread = await ChatThread.findById(threadId)
      .populate('user', 'name email avatar')
      .populate('messages.sender', 'name avatar role')
      .populate({
        path: 'messages.dealId',
        populate: { path: 'channel', select: 'name price bannerUrl' }
      })
      .populate('messages.channelId', 'name price category subscriberCount imageUrls customUrl');
      
    if (!thread) return res.status(404).json({ success: false, message: 'Thread not found' });
    
    res.status(200).json({ success: true, thread });
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
