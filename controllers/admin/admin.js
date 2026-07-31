const express = require('express');
const router = express.Router();
const Channel = require('../../models/channel');
const Transaction = require('../../models/payment');
const User = require('../../models/user');
const auth = require('../../middleware/auth');
const { deleteFromR2 } = require('../../config/r2');

// Get all transactions with user details
router.get('/admin/transactions', auth, async (req, res) => {
  if (req?.user?.role !== "admin") {
    return res.status(401).json({ message: "invalid user" })
  }
  try {
    const query = {}; // Return all transactions (or query matching)
    const { status, paymentMethod, startDate, endDate } = req.query;

    // Apply filters if provided
    if (status) query.status = status;
    if (paymentMethod) query.paymentMethod = paymentMethod;
    if (startDate && endDate) {
      query.createdAt = {
        $gte: new Date(startDate),
        $lte: new Date(endDate)
      };
    }

    const transactions = await Transaction.find(query)
      .sort({ createdAt: -1 })
      .lean();

    // 1. Manually join User records (since Transaction.user is a String, not ObjectId)
    const userIds = transactions.map(t => t.user).filter(Boolean);
    const users = await User.find({ _id: { $in: userIds } })
      .select('name email role mobile')
      .lean();

    // 2. Fetch Escrow Deals for transactions that bought deals (to show what channel was bought)
    const EscrowDeal = require('../../models/deal');
    const deals = await EscrowDeal.find({
      _id: { $in: transactions.map(t => t.metadata?.dealId).filter(Boolean) }
    }).populate({
      path: 'channel',
      model: Channel,
      select: 'name price'
    }).lean();

    const transformedTransactions = transactions.map(transaction => {
      // Find manually matched user
      const matchedUser = users.find(u => u._id.toString() === transaction.user);
      const userDetails = matchedUser || {
        name: 'Unknown User',
        email: 'N/A',
        role: 'N/A',
        mobile: 'N/A'
      };

      // Populate cart items if this is an Escrow Deal purchase
      let cartItems = transaction.metadata?.cartItems || [];
      if (cartItems.length === 0 && transaction.metadata?.dealId) {
        const deal = deals.find(d => d._id.toString() === transaction.metadata.dealId.toString());
        if (deal && deal.channel) {
          cartItems = [{
            id: deal.channel._id,
            name: `Escrow Deal: ${deal.channel.name}`,
            price: deal.dealPrice || transaction.amount,
            quantity: 1
          }];
        }
      }

      // 3. Normalize PhonePe V2 Response properties for frontend compatibility
      const ppe = transaction.phonepeResponse || {};
      const statusRes = ppe.statusResponse || ppe;
      
      const normalizedPhonePe = {
        ...ppe,
        data: {
          merchantId: statusRes.merchantId || ppe.merchantId || ppe.data?.merchantId || 'N/A',
          transactionId: statusRes.merchantOrderId || statusRes.transactionId || ppe.transactionId || ppe.data?.transactionId || 'N/A',
          state: statusRes.state || ppe.state || ppe.data?.state || 'N/A',
          responseCode: statusRes.errorCode || statusRes.responseCode || ppe.responseCode || ppe.data?.responseCode || 'SUCCESS',
          paymentInstrument: {
            type: statusRes.paymentDetails?.[0]?.paymentMode || statusRes.paymentInstrument?.type || ppe.data?.paymentInstrument?.type || 'N/A',
            utr: statusRes.paymentDetails?.[0]?.transactionId || statusRes.paymentInstrument?.utr || ppe.data?.paymentInstrument?.utr || 'N/A',
            upiTransactionId: statusRes.paymentDetails?.[0]?.transactionId || statusRes.paymentInstrument?.upiTransactionId || ppe.data?.paymentInstrument?.upiTransactionId || 'N/A',
            accountType: statusRes.paymentDetails?.[0]?.instrument?.type || ppe.data?.paymentInstrument?.accountType || 'N/A'
          }
        },
        statusResponse: statusRes
      };

      return {
        transactionId: transaction.transactionId,
        merchantTransactionId: transaction.merchantTransactionId,
        amount: transaction.amount,
        currency: transaction.currency,
        status: transaction.status,
        paymentMethod: transaction.paymentMethod,
        createdAt: transaction.createdAt,
        updatedAt: transaction.updatedAt,
        user: userDetails,
        metadata: {
          ...transaction.metadata,
          cartItems
        },
        phonepeResponse: normalizedPhonePe
      };
    });

    res.json({
      success: true,
      count: transformedTransactions.length,
      data: transformedTransactions
    });

  } catch (error) {
    console.error('Error fetching transactions:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching transactions',
      error: error.message
    });
  }
});

// Get all channels
router.get('/admin/channels', auth, async (req, res) => {
  if (req?.user?.role !== "admin") {
    return res.status(401).json({ message: "invalid user" })
  }
  try {
    const channels = await Channel.find({})
      .sort({ createdAt: -1 });
    res.json(channels);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching channels', error: error.message });
  }
});

// Toggle most demanding status
router.patch('/admin/channels/:id/demanding', auth, async (req, res) => {
  // if (req?.user?.role !== "admin") {
  //   return res.status(401).json({ message: "invalid user" })
  // }
  try {
    const { id } = req.params;
    const { mostDemanding } = req.body;

    const updatedChannel = await Channel.findByIdAndUpdate(
      id,
      { mostDemanding },
      { new: true }
    );

    if (!updatedChannel) {
      return res.status(404).json({ message: 'Channel not found' });
    }

    res.json(updatedChannel);
  } catch (error) {
    res.status(500).json({ message: 'Error updating channel', error: error.message });
  }
});

// Get channel by ID
router.get('/admin/channel/:id', auth, async (req, res) => {
  if (req?.user?.role !== "admin") {
    return res.status(401).json({ message: "invalid user" })
  }
  try {
    const { id } = req.params;

    const channel = await Channel.findById(id);

    if (!channel) {
      return res.status(404).json({
        success: false,
        message: 'Channel not found'
      });
    }

    res.json({
      success: true,
      data: channel
    });

  } catch (error) {
    console.error('Error fetching channel:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching channel details',
      error: error.message
    });
  }
});

// Delete a channel by ID
router.delete('/admin/channels/:id', auth, async (req, res) => {
  if (req?.user?.role !== "admin") {
    return res.status(401).json({ message: "invalid user" })
  }
  try {
    const { id } = req.params;

    const deletedChannel = await Channel.findById(id);

    if (!deletedChannel) {
      return res.status(404).json({
        success: false,
        message: 'Channel not found'
      });
    }

    // Delete files from R2
    if (deletedChannel.bannerUrl) {
      await deleteFromR2(deletedChannel.bannerUrl);
    }
    if (deletedChannel.imageUrls && deletedChannel.imageUrls.length > 0) {
      await Promise.all(deletedChannel.imageUrls.map(url => deleteFromR2(url)));
    }

    await Channel.findByIdAndDelete(id);

    res.json({
      success: true,
      message: 'Channel deleted successfully'
    });

  } catch (error) {
    console.error('Error deleting channel:', error);
    res.status(500).json({
      success: false,
      message: 'Error deleting channel',
      error: error.message
    });
  }
});

// Approve a channel by ID
router.patch('/admin/channels/:id/approve', auth, async (req, res) => {
  if (req?.user?.role !== "admin") {
    return res.status(401).json({ message: "invalid user" })
  }
  try {
    const { id } = req.params;

    const updatedChannel = await Channel.findByIdAndUpdate(
      id,
      { status: 'approved' },
      { new: true }
    );

    if (!updatedChannel) {
      return res.status(404).json({
        success: false,
        message: 'Channel not found'
      });
    }

    res.json({
      success: true,
      message: 'Channel approved successfully',
      data: updatedChannel
    });

  } catch (error) {
    console.error('Error approving channel:', error);
    res.status(500).json({
      success: false,
      message: 'Error approving channel',
      error: error.message
    });
  }
});

module.exports = router;