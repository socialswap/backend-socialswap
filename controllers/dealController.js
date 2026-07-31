const EscrowDeal = require('../models/deal');
const Conversation = require('../models/chat');
const Message = require('../models/message');
const Channel = require('../models/channel');

// Admin creates a deal
exports.createDeal = async (req, res) => {
  try {
    const { channelId, price, dealPrice, threadId, buyerId } = req.body;
    const finalDealPrice = dealPrice || price;

    const channel = await Channel.findById(channelId);
    if (!channel) return res.status(404).json({ success: false, message: 'Channel not found' });
    
    // Prevent creating a deal for a channel that is already sold
    if (channel.sold || (channel.status && channel.status.toLowerCase() === 'sold')) {
      return res.status(400).json({ success: false, message: 'Cannot create a deal for a channel that is already sold.' });
    }

    const adminId = req.user.userId || req.user._id;

    // The conversation where the admin is creating the deal (Buyer's conversation)
    let buyerConversation;
    if (threadId) {
      buyerConversation = await Conversation.findById(threadId);
    }
    
    if (!buyerConversation && buyerId) {
      buyerConversation = await Conversation.findOne({ participants: buyerId });
    }

    if (!buyerConversation && buyerId) {
      buyerConversation = new Conversation({ participants: [buyerId] });
      await buyerConversation.save();
    }

    if (!buyerConversation) return res.status(400).json({ success: false, message: 'Buyer or Conversation is required' });
    
    // Find who the actual buyer is (buyerId passed or from conversation)
    let finalBuyerId = buyerId;
    if (!finalBuyerId) {
      const nonAdmin = buyerConversation.participants.find(p => p.toString() !== adminId.toString());
      finalBuyerId = nonAdmin || buyerConversation.participants[0];
    }
    const sellerId = channel.createdBy; // Reference to seller
    
    const deal = new EscrowDeal({
      channel: channelId,
      buyer: finalBuyerId,
      seller: sellerId,
      dealPrice: finalDealPrice,
      originalPrice: channel.price,
      createdBy: adminId,
      chatThread: buyerConversation._id,
      status: 'pending',
      payment: 'notpaid'
    });

    await deal.save();

    // 1. Add deal card to Buyer's chat
    const buyerMessage = new Message({
      conversationId: buyerConversation._id,
      sender: adminId,
      type: 'deal',
      isDeal: true,
      dealId: deal._id
    });
    await buyerMessage.save();
    buyerConversation.lastMessage = buyerMessage._id;
    await buyerConversation.save();

    // 2. Add deal card to Seller's chat
    // Ensure we don't send it twice if the buyer IS the seller (rare, but possible in testing)
    if (finalBuyerId.toString() !== sellerId.toString()) {
      let sellerConversation = await Conversation.findOne({ participants: sellerId });
      if (!sellerConversation) {
        sellerConversation = new Conversation({ participants: [sellerId] });
        await sellerConversation.save();
      }
      
      const sellerMessage = new Message({
        conversationId: sellerConversation._id,
        sender: adminId,
        type: 'deal',
        isDeal: true,
        dealId: deal._id
      });
      await sellerMessage.save();
      sellerConversation.lastMessage = sellerMessage._id;
      await sellerConversation.save();
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
      .populate('channel', 'name price')
      .sort({ createdAt: -1 });
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
      .populate('channel', 'name price')
      .sort({ createdAt: -1 });
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
      
      if (deal.channel) {
        await Channel.findByIdAndUpdate(deal.channel, {
          $set: { status: 'Sold', sold: true }
        });
      }
    }
    await deal.save();

    res.status(200).json({ success: true, deal });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
