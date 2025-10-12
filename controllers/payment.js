const express = require('express');
const { v4: uuidv4 } = require('uuid');
const axios = require('axios');
const crypto = require('crypto');
const router = express.Router();
const Transaction = require('../models/payment');
const auth = require('../middleware/auth');
const Channel = require('../models/channel');
const { default: mongoose } = require('mongoose');
const YouTubeChannel = require('../models/channel');

// Configuration object for PhonePe integration
const CONFIG = {
  MERCHANT_ID: process.env.PHONEPE_MERCHANT_ID,
  SALT_KEY: process.env.PHONEPE_SALT_KEY,
  SALT_INDEX: process.env.PHONEPE_SALT_INDEX,
  PHONEPE_HOST: process.env.PHONEPE_HOST,
  REDIRECT_URL: process.env.REDIRECT_URL,
  CALLBACK_URL: process.env.PROD_CALLBACK_URL
};

/**
 * Generate signature for PhonePe API requests
 * @param {Object} payload - Payment payload
 * @param {string} saltKey - Merchant salt key
 * @param {number} saltIndex - Salt index
 * @returns {Object} Base64 payload and signature
 */
const generateSignature = (payload, saltKey, saltIndex) => {
  try {
    const payloadBase64 = Buffer.from(JSON.stringify(payload)).toString('base64');
    const concatenatedString = payloadBase64 + '/pg/v1/pay' + saltKey;
    const signature = crypto
      .createHash('sha256')
      .update(concatenatedString)
      .digest('hex') + '###' + saltIndex;

    return {
      payload: payloadBase64,
      signature,
    };
  } catch (error) {
    console.error('Signature generation failed:', error);
    throw new Error('Failed to generate signature');
  }
};

/**
 * Create a payment order with PhonePe
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const createPaymentOrder = async (req, res) => {
  try {
    const { amount, cartItems } = req.body;
    const currentUser = req.user;

    if (!amount || amount <= 0) {
      return res.status(400).json({ 
        success: false, 
        message: 'Invalid amount' 
      });
    }

    // Check if any channels are already sold
    const soldChannels = await Promise.all(
      cartItems.map(async (item) => {
        console.log(item);
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

    // Filter out null values and get list of sold channels
    const actualSoldChannels = soldChannels.filter(channel => channel !== null);

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
    
    const payload = {
      merchantId: CONFIG.MERCHANT_ID,
      merchantTransactionId: transactionId,
      merchantUserId: currentUser?.userId || uuidv4(),
      amount: Math.round(amount * 100), // Convert to lowest currency unit
      redirectUrl: `${CONFIG.REDIRECT_URL}/confirmation/${transactionId}`,
      redirectMode: 'REDIRECT_URL',
      callbackUrl: CONFIG.CALLBACK_URL,
      mobileNumber: currentUser?.phone,
      paymentInstrument: {
        type: 'PAY_PAGE'
      }
    };

    // Create initial transaction record with validated cart items
    const transaction = await Transaction.createTransaction({
      transactionId,
      merchantTransactionId: transactionId,
      user: currentUser,
      amount,
      metadata: {
        cartItems: cartItems || [],
        initiatedAt: new Date(),
        validatedAt: new Date() // Add validation timestamp
      }
    });

    const { payload: base64Payload, signature } = generateSignature(
      payload,
      CONFIG.SALT_KEY,
      CONFIG.SALT_INDEX
    );

    // Make request to PhonePe
    const response = await axios.post(
      `${CONFIG.PHONEPE_HOST}/pg/v1/pay`,
      { request: base64Payload },
      {
        headers: {
          'Content-Type': 'application/json',
          'X-VERIFY': signature,
          'Accept': 'application/json'
        },
      }
    );

    // Update transaction with PhonePe response
    await transaction.updateOne({
      phonepeResponse: response.data,
      status: 'INITIATED',
      updatedAt: new Date()
    });

    return res.status(200).json({
      success: true,
      data: {
        transactionId,
        ...response.data
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

    // Add more context if it's a database error
    if (error.name === 'MongoError' || error.name === 'ValidationError') {
      errorResponse.code = 'DATABASE_ERROR';
    }

    res.status(error.response?.status || 500).json(errorResponse);
  }
};


/**
 * Check payment status with retry mechanism
 * @param {string} transactionId - Transaction ID to check
 * @param {number} retryCount - Number of retry attempts
 * @param {number} delay - Delay between retries in milliseconds
 * @returns {Promise<Object>} Payment status
 */
const checkPaymentStatus = async (req, res) => {
  const { transactionId } = req.params;
  const retryCount = 3;
  const delayMs = 2000;

  try {
    // Find transaction in database first
    const transaction = await Transaction.findOne({ transactionId });
    if (!transaction) {
      return res.status(404).json({
        success: false,
        message: 'Transaction not found'
      });
    }

    // Generate X-VERIFY header
    const hashString = `/pg/v1/status/${CONFIG.MERCHANT_ID}/${transactionId}${CONFIG.SALT_KEY}`;
    const hash = crypto.createHash('sha256').update(hashString).digest('hex');
    const xVerify = `${hash}###${CONFIG.SALT_INDEX}`;

    // Configure request
    const config = {
      method: 'get',
      url: `${CONFIG.PHONEPE_HOST}/pg/v1/status/${CONFIG.MERCHANT_ID}/${transactionId}`,
      headers: {
        'Content-Type': 'application/json',
        'X-VERIFY': xVerify,
        'X-MERCHANT-ID': CONFIG.MERCHANT_ID
      }
    };

    // Implement retry mechanism
    let lastError;
    for (let attempt = 1; attempt <= retryCount; attempt++) {
      try {
        const response = await axios(config);
        const paymentStatus = response.data;

        // Map PhonePe status to our transaction status
        let transactionStatus;
        switch (paymentStatus.code) {
          case 'PAYMENT_SUCCESS':
            transactionStatus = 'SUCCESS';
            break;
          case 'PAYMENT_PENDING':
            transactionStatus = 'PENDING';
            break;
          case 'PAYMENT_DECLINED':
          case 'PAYMENT_ERROR':
            transactionStatus = 'FAILED';
            break;
          default:
            transactionStatus = 'FAILED';
        }

        // Update transaction in database
        await transaction.updateTransactionStatus(
          transactionStatus,
          paymentStatus
        );

        if (transactionStatus === 'SUCCESS' && transaction.metadata?.cartItems) {
          const cartItemIds = transaction.metadata.cartItems.map(item => 
            new mongoose.Types.ObjectId(item.id)
          );

          // Update all channels in the cart to 'sold' status
          await Channel.updateMany(
            { _id: { $in: cartItemIds } },
            { $set: { status: 'Sold' } }
          );

        }

        return res.status(200).json({
          success: true,
          data: {
            transactionId,
            status: transactionStatus,
            details: paymentStatus
          }
        });

      } catch (error) {
        lastError = error;
        console.error(`Attempt ${attempt} failed:`, error.message);
        
        if (attempt < retryCount) {
          await new Promise(resolve => setTimeout(resolve, delayMs));
          continue;
        }
      }
    }

    // If all retries failed
    console.error('All payment status check attempts failed:', lastError);
    return res.status(500).json({
      success: false,
      message: 'Failed to check payment status after multiple attempts',
      error: lastError.response?.data?.message || lastError.message
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

    // Get transactions
    const transactions = await Transaction.find({user:currentUser.userId})
      .sort({ createdAt: -1 }) // Sort by newest first
      .select('-phonepeResponse.paymentInstrument'); // Exclude sensitive payment details

    // Format response
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

/**
 * Get transaction details by transaction ID
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
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

// Register routes
router.post('/create-order', auth, createPaymentOrder);
router.get('/status/:transactionId', checkPaymentStatus);

module.exports = router;