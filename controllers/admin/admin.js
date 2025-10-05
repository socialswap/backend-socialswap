const express = require('express');
const router = express.Router();
const Channel = require('../../models/channel');
const Transaction = require('../../models/payment');
const User = require('../../models/user');
const auth = require('../../middleware/auth')

// Get all transactions with user details
router.get('/admin/transactions', auth, async (req, res) => {
  console.log(req.user);
  
  if (req?.user?.role !== "admin") {
    return res.status(401).json({ message: "invalid user" })
  }
  try {
    // Add query parameters for filtering
    const query = { status: 'SUCCESS' };
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
      .lean()
      .populate({
        path: 'user',
        model: User,
        select: 'name email role mobile -_id'
      })
      .populate('orderDetails');

    const transformedTransactions = transactions.map(transaction => {
      const userDetails = transaction.user || {
        name: 'Unknown User',
        email: 'N/A',
        role: 'N/A'
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
        orderDetails: transaction.orderDetails,
        user: userDetails,
        metadata: transaction.metadata,
        phonepeResponse: transaction.phonepeResponse
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

    const deletedChannel = await Channel.findByIdAndDelete(id);

    if (!deletedChannel) {
      return res.status(404).json({
        success: false,
        message: 'Channel not found'
      });
    }

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