const express = require('express');
const { v4: uuidv4 } = require('uuid');
const router = express.Router();
const Transaction = require('../models/payment');
const auth = require('../middleware/auth');
const YouTubeChannel = require('../models/channel');
const EscrowDeal = require('../models/deal');
const { StandardCheckoutClient, Env, StandardCheckoutPayRequest } = require('@phonepe-pg/pg-sdk-node');

// Configuration object for PhonePe V2 integration
const CONFIG = {
  CLIENT_ID: process.env.PHONEPE_MERCHANT_ID, // V2 uses Merchant ID as Client ID
  CLIENT_SECRET: process.env.PHONEPE_SALT_KEY, // V2 uses Salt Key as Client Secret
  CLIENT_VERSION: process.env.PHONEPE_CLIENT_VERSION || 1,
  PHONEPE_ENV: process.env.PHONEPE_ENV === 'PRODUCTION' ? Env.PRODUCTION : Env.SANDBOX,
  REDIRECT_URL: process.env.REDIRECT_URL,
  CALLBACK_URL: process.env.PROD_CALLBACK_URL
};

// Initialize PhonePe SDK Client
const phonepeClient = StandardCheckoutClient.getInstance(
  CONFIG.CLIENT_ID,
  CONFIG.CLIENT_SECRET,
  CONFIG.CLIENT_VERSION,
  CONFIG.PHONEPE_ENV
);

/**
 * Create a payment order with PhonePe V2
 */
const createPaymentOrder = async (req, res) => {
  try {
    const { amount, cartItems, dealId } = req.body;
    const currentUser = req.user;

    if (!amount || amount <= 0) {
      return res.status(400).json({ 
        success: false, 
        message: 'Invalid amount' 
      });
    }

    // Check if any channels are already sold (only if cartItems exists)
    let actualSoldChannels = [];
    if (cartItems && cartItems.length > 0) {
      const soldChannels = await Promise.all(
        cartItems.map(async (item) => {
          const channel = await YouTubeChannel.findById(item?.id);
          
          if (channel && channel.status === 'Sold') {
            return {
              channelId: channel._id,
              name: channel.name
            };
          }
          return null;
        })
      );
      actualSoldChannels = soldChannels.filter(channel => channel !== null);
    }

    // If any channels are sold, return error with details
    if (actualSoldChannels.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Some channels in your cart have already been sold',
        soldChannels: actualSoldChannels,
        code: 'CHANNELS_ALREADY_SOLD'
      });
    }

    const transactionId = `MT${Date.now()}${Math.random().toString(36).slice(2, 8)}`;
    
    // Create initial transaction record with validated cart items
    const transaction = await Transaction.createTransaction({
      transactionId,
      merchantTransactionId: transactionId,
      user: currentUser,
      amount,
      metadata: {
        cartItems: cartItems || [],
        dealId: dealId || null,
        initiatedAt: new Date(),
        validatedAt: new Date()
      }
    });

    const redirectUrl = `${CONFIG.REDIRECT_URL}/confirmation/${transactionId}`;

    // Build the request using the PhonePe V2 SDK
    const request = StandardCheckoutPayRequest.builder()
      .merchantOrderId(transactionId)
      .amount(Math.round(amount * 100)) // Convert to paisa
      .redirectUrl(redirectUrl)
      .build();

    // Make request to PhonePe via SDK
    const response = await phonepeClient.pay(request);

    // Update transaction with PhonePe response
    await transaction.updateOne({
      phonepeResponse: response,
      status: 'INITIATED',
      updatedAt: new Date()
    });

    // We structure the response to maintain backward compatibility with the frontend
    // The frontend expects: data.data.instrumentResponse.redirectInfo.url
    return res.status(200).json({
      success: true,
      data: {
        transactionId,
        data: {
          instrumentResponse: {
            redirectInfo: {
              url: response.redirectUrl
            }
          }
        },
        ...response
      }
    });

  } catch (error) {
    console.error('Payment order creation failed:', error);
    
    // Enhanced error handling
    const errorResponse = {
      success: false,
      message: 'Failed to create payment order',
      error: error.response?.data?.message || error.message
    };

    if (error.name === 'MongoError' || error.name === 'ValidationError') {
      errorResponse.code = 'DATABASE_ERROR';
    }

    res.status(error.response?.status || 500).json(errorResponse);
  }
};


/**
 * Check payment status with PhonePe V2 SDK
 */
const checkPaymentStatus = async (req, res) => {
  const { transactionId } = req.params;

  try {
    // Find transaction in database first
    const transaction = await Transaction.findOne({ transactionId });
    if (!transaction) {
      return res.status(404).json({
        success: false,
        message: 'Transaction not found'
      });
    }

    // Call PhonePe SDK to get order status
    let response;
    try {
      response = await phonepeClient.getOrderStatus(transactionId);
    } catch (apiError) {
      if (apiError.code === 'TOO_MANY_REQUESTS' || apiError.name === 'TooManyRequests' || apiError.message.includes('Too many requests')) {
        return res.status(200).json({
          success: true,
          status: transaction.status,
          transaction: {
            id: transaction.transactionId,
            amount: transaction.amount,
            status: transaction.status
          },
          message: "Rate limited by gateway, returning current known status."
        });
      }
      throw apiError;
    }
    
    // PhonePe V2 states: COMPLETED, FAILED, PENDING
    const state = response.state;

    // Map PhonePe status to our transaction status
    let mappedStatus = 'PENDING';
    if (state === 'COMPLETED') {
      mappedStatus = 'SUCCESS';
    } else if (state === 'FAILED') {
      mappedStatus = 'FAILED';
    }

    // Save the status
    transaction.status = mappedStatus;
    transaction.updatedAt = new Date();
    
    // Merge the new response with the old one (if needed) or replace it
    transaction.phonepeResponse = {
      ...transaction.phonepeResponse,
      statusResponse: response
    };

    await transaction.save();

    // Update Deal or Channel status based on transaction success
    if (transaction.metadata?.dealId) {
      let dealPaymentStatus = 'notpaid';
      if (mappedStatus === 'SUCCESS') dealPaymentStatus = 'paid';
      else if (mappedStatus === 'PENDING') dealPaymentStatus = 'pending';
      
      try {
        const updatedDeal = await EscrowDeal.findByIdAndUpdate(transaction.metadata.dealId, { payment: dealPaymentStatus });
        
        if (dealPaymentStatus === 'paid' && updatedDeal && updatedDeal.channel) {
          await YouTubeChannel.findByIdAndUpdate(updatedDeal.channel, {
            $set: { status: 'Sold', sold: true }
          });
        }
      } catch (err) {
        console.error('Failed to update deal payment status:', err);
      }
    } else if (mappedStatus === 'SUCCESS' && transaction.metadata?.cartItems?.length > 0) {
      try {
        const channelIds = transaction.metadata.cartItems.map(item => item.id);
        await YouTubeChannel.updateMany(
          { _id: { $in: channelIds } },
          { $set: { status: 'Sold', sold: true } }
        );
      } catch (err) {
        console.error('Failed to update channel status:', err);
      }
    }

    return res.status(200).json({
      success: true,
      status: mappedStatus,
      data: {
        channelId: transaction.metadata?.cartItems?.[0]?.id || transaction.metadata?.dealId || 'N/A',
        details: {
          code: mappedStatus === 'SUCCESS' ? 'PAYMENT_SUCCESS' : (mappedStatus === 'PENDING' ? 'PAYMENT_PENDING' : 'PAYMENT_ERROR'),
          data: {
            merchantTransactionId: transaction.transactionId,
            amount: transaction.amount,
            paymentInstrument: {
              type: response.paymentInstrument?.type || 'PAY_PAGE'
            }
          }
        }
      },
      transaction: {
        id: transaction.transactionId,
        amount: transaction.amount,
        status: mappedStatus
      },
      rawStatus: response
    });

  } catch (error) {
    console.error('Payment status check failed:', error);
    return res.status(500).json({
      success: false,
      message: 'Error checking payment status',
      error: error.message
    });
  }
};

const getTransactions = async (req, res) => {
  try {
    const currentUser = req.user;

    const transactions = await Transaction.find({ 'user.userId': currentUser.userId })
      .sort({ createdAt: -1 })
      .select('-phonepeResponse.paymentInstrument');

    const formattedTransactions = transactions.map(transaction => ({
      transactionId: transaction.transactionId,
      merchantTransactionId: transaction.merchantTransactionId,
      amount: transaction.amount,
      status: transaction.status,
      createdAt: transaction.createdAt,
      updatedAt: transaction.updatedAt,
      metadata: transaction.metadata,
      cartItems: transaction.metadata?.cartItems || []
    }));

    return res.status(200).json({
      success: true,
      data: formattedTransactions
    });

  } catch (error) {
    console.error('Error fetching transactions:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch transactions',
      error: error.message
    });
  }
};

const getTransactionById = async (req, res) => {
  try {
    const { transactionId } = req.params;
    const currentUser = req.user;

    const transaction = await Transaction.findOne({
      transactionId,
      'user.userId': currentUser.userId
    }).select('-phonepeResponse.paymentInstrument');

    if (!transaction) {
      return res.status(404).json({
        success: false,
        message: 'Transaction not found'
      });
    }

    return res.status(200).json({
      success: true,
      data: {
        transactionId: transaction.transactionId,
        merchantTransactionId: transaction.merchantTransactionId,
        amount: transaction.amount,
        status: transaction.status,
        createdAt: transaction.createdAt,
        updatedAt: transaction.updatedAt,
        metadata: transaction.metadata,
        cartItems: transaction.metadata?.cartItems || []
      }
    });

  } catch (error) {
    console.error('Error fetching transaction details:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch transaction details',
      error: error.message
    });
  }
};

// Register routes
router.get('/transactions', auth, getTransactions);
router.get('/transactions/:transactionId', auth, getTransactionById);
router.post('/create-order', auth, createPaymentOrder);
router.get('/status/:transactionId', checkPaymentStatus);

module.exports = router;