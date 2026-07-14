const EscrowDeal = require('../models/deal');
const ChatThread = require('../models/chat');
const Channel = require('../models/channel');

// Admin creates a deal
exports.createDeal = async (req, res) => {
  try {
    const { channelId, price, dealPrice, threadId, buyerId } = req.body;
    const finalDealPrice = dealPrice || price;

    const channel = await Channel.findById(channelId);
    if (!channel) return res.status(404).json({ success: false, message: 'Channel not found' });

    const adminId = req.user.userId || req.user._id;

    // The thread where the admin is creating the deal (Buyer's thread)
    let buyerThread;
    if (threadId) {
      buyerThread = await ChatThread.findById(threadId);
    }
    
    if (!buyerThread && buyerId) {
      buyerThread = await ChatThread.findOne({ user: buyerId });
    }

    if (!buyerThread && buyerId) {
      buyerThread = new ChatThread({ user: buyerId, messages: [] });
      await buyerThread.save();
    }

    if (!buyerThread) return res.status(400).json({ success: false, message: 'Buyer or Chat Thread is required' });
    
    const finalBuyerId = buyerId || buyerThread.user;
    const sellerId = channel.createdBy; // Reference to seller
    
    const deal = new EscrowDeal({
      channel: channelId,
      buyer: finalBuyerId,
      seller: sellerId,
      dealPrice: finalDealPrice,
      originalPrice: channel.price,
      createdBy: adminId,
      chatThread: threadId,
      status: 'pending',
      payment: 'notpaid'
    });

    await deal.save();

    // 1. Add deal card to Buyer's chat
    buyerThread.messages.push({
      sender: adminId,
      isDealCard: true,
      dealId: deal._id
    });
    buyerThread.lastMessageAt = Date.now();
    await buyerThread.save();

    // 2. Add deal card to Seller's chat
    // Ensure we don't send it twice if the buyer IS the seller (rare, but possible in testing)
    if (finalBuyerId.toString() !== sellerId.toString()) {
      let sellerThread = await ChatThread.findOne({ user: sellerId });
      if (!sellerThread) {
        sellerThread = new ChatThread({
          user: sellerId,
          messages: []
        });
      }
      
      sellerThread.messages.push({
        sender: adminId,
        isDealCard: true,
        dealId: deal._id
      });
      sellerThread.lastMessageAt = Date.now();
      await sellerThread.save();
    }

    res.status(201).json({ success: true, deal });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Buyer updates deal status
exports.updateDealStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body; // 'accepted' or 'rejected'

    const deal = await EscrowDeal.findById(id);
    if (!deal) return res.status(404).json({ success: false, message: 'Deal not found' });

    if (deal.buyer.toString() !== (req.user.userId || req.user._id).toString()) {
       return res.status(403).json({ success: false, message: 'Not authorized to update this deal' });
    }

    deal.status = status;
    await deal.save();

    res.status(200).json({ success: true, deal });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Admin fetching all deals
exports.getAllDeals = async (req, res) => {
  try {
    const deals = await EscrowDeal.find()
      .populate('buyer', 'name email')
      .populate('seller', 'name email')
      .populate('channel', 'name price');
    res.status(200).json({ success: true, deals });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// User fetching their own deals
exports.getUserDeals = async (req, res) => {
  try {
    const userId = req.user.userId || req.user._id;
    const deals = await EscrowDeal.find({
      $or: [{ buyer: userId }, { seller: userId }]
    })
      .populate('buyer', 'name email')
      .populate('seller', 'name email')
      .populate('channel', 'name price');
    res.status(200).json({ success: true, deals });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Admin manually updates deal payment status
exports.updateDealPaymentStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { payment } = req.body;
    
    // Check if admin
    if (req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Not authorized to change payment status' });
    }

    const deal = await EscrowDeal.findById(id);
    if (!deal) return res.status(404).json({ success: false, message: 'Deal not found' });

    deal.payment = payment;
    if (payment === 'paid') {
      deal.paymentDetails = { manualOverride: true, updatedBy: req.user.userId || req.user._id, updatedAt: new Date() };
    }
    await deal.save();

    res.status(200).json({ success: true, deal });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
