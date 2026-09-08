const express = require('express');
const router = express.Router();
const Channel = require('../models/channel'); // Adjust path as needed
const mongoose = require('mongoose');
const auth = require('../middleware/auth');
const Transaction = require('../models/payment');

// Get all orders with channel details for the authenticated user
const getOrderChannelDetails = async (req, res) => {
  try {
    const userId = req.user;
   
    
    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'User not authenticated'
      });
    }

    // 1. Fetch successful Transactions for user
    const orders = await Transaction.find({
      user: userId?.userId,
      status: 'SUCCESS' // Only successful transactions
    }).sort({ createdAt: -1 });
    
    // Separate channel cart items and service cart items
    let channelIds = [];
    let purchasedServices = [];

    orders.forEach(order => {
      const items = order?.metadata?.cartItems || [];
      items.forEach(item => {
        if (item.itemType === 'service') {
          purchasedServices.push({
            _id: item.id || order.transactionId,
            serviceName: item.name,
            price: item.price,
            quantity: item.quantity || 1,
            category: item.category || 'Service',
            image: item.image || null,
            transactionId: order.transactionId,
            purchasedAt: order.createdAt,
            status: 'SUCCESS'
          });
        } else if (item.id) {
          channelIds.push(item.id);
        }
      });
    });

    // 2. Fetch channels from Escrow Deals where user is buyer and payment is paid
    const EscrowDeal = require('../models/deal');
    const escrowDeals = await EscrowDeal.find({
      buyer: userId?.userId,
      payment: 'paid'
    });
    
    // Add escrow channel IDs
    const escrowChannelIds = escrowDeals.map(deal => deal.channel?.toString()).filter(Boolean);
    channelIds = [...channelIds, ...escrowChannelIds];
    
    // Remove duplicates
    channelIds = [...new Set(channelIds)];

    const objectIds = channelIds
      .filter(id => mongoose.Types.ObjectId.isValid(id))
      .map(id => new mongoose.Types.ObjectId(id));

    // Fetch channels based on the IDs
    const channels = await Channel.find({
      _id: { $in: objectIds }
    }).select({
      name: 1,
      customUrl: 1,
      subscriberCount: 1,
      viewCount: 1,
      category: 1,
      channelType: 1,
      status: 1,
      bannerUrl: 1,
      avatar: 1,
      description: 1,
      estimatedEarnings: 1,
      monetized: 1,
      watchTimeHours: 1
    });

    return res.status(200).json({
      success: true,
      data: channels, // Backward compatibility
      channels: channels,
      services: purchasedServices
    });

  } catch (error) {
    console.error('Error fetching order channel details:', error);
    return res.status(500).json({
      success: false,
      message: 'Error fetching order details',
      error: error.message
    });
  }
};

// Get specific order with channel details
const getSpecificOrderChannels = async (req, res) => {
  try {
    const { orderId } = req.params;
    const userId = req.user;

    if (!mongoose.Types.ObjectId.isValid(orderId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid order ID format'
      });
    }

    // Fetch specific order
    const order = await mongoose.connection.collection('orders').findOne({
      _id: new mongoose.Types.ObjectId(orderId),
      user: userId
    });

    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }

    // Fetch channel details for the items in this order
    const channelIds = order.cartItems.map(item => new mongoose.Types.ObjectId(item.id));
    const channels = await Channel.find({
      _id: { $in: channelIds }
    });

    // Enrich cart items with channel details
    const enrichedCartItems = order.cartItems.map(item => {
      const channel = channels.find(ch => ch._id.toString() === item.id);
      return {
        ...item,
        channelDetails: channel ? {
          name: channel.name,
          customUrl: channel.customUrl,
          subscriberCount: channel.subscriberCount,
          viewCount: channel.viewCount,
          category: channel.category,
          channelType: channel.channelType,
          status: channel.status,
          bannerUrl: channel.bannerUrl,
          avatar: channel.avatar,
          description: channel.description,
          estimatedEarnings: channel.estimatedEarnings,
          monetized: channel.monetized,
          watchTimeHours: channel.watchTimeHours
        } : null
      };
    });

    const enrichedOrder = {
      ...order,
      cartItems: enrichedCartItems
    };

    return res.status(200).json({
      success: true,
      data: enrichedOrder
    });

  } catch (error) {
    console.error('Error fetching specific order channels:', error);
    return res.status(500).json({
      success: false,
      message: 'Error fetching order details',
      error: error.message
    });
  }
};

// Route setup
router.get('/orders',auth, getOrderChannelDetails);
router.get('/orders/:orderId',auth, getSpecificOrderChannels);

module.exports = router;