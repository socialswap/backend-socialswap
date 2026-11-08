const express = require('express');
const router = express.Router();
const Razorpay = require('razorpay');
const {
  validatePaymentVerification,
  validateWebhookSignature
} = require('razorpay/dist/utils/razorpay-utils');
const Transaction = require('../models/payment');
const auth = require('../middleware/auth');
const YouTubeChannel = require('../models/channel');
const EscrowDeal = require('../models/deal');
const User = require('../models/user');
const { sendMailWithLogo } = require('../utils/mailer');

const CURRENCY = 'INR';
const MIN_AMOUNT_RUPEES = 1; // Razorpay's minimum order value

let razorpayClient = null;

// Built on first use so the server still boots before keys are configured.
const getRazorpay = () => {
  const { RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET } = process.env;
  if (!RAZORPAY_KEY_ID || !RAZORPAY_KEY_SECRET) return null;

  if (!razorpayClient) {
    razorpayClient = new Razorpay({
      key_id: RAZORPAY_KEY_ID,
      key_secret: RAZORPAY_KEY_SECRET
    });
  }
  return razorpayClient;
};

const toPaise = (rupees) => Math.round(Number(rupees) * 100);

// Keeps only what the admin panel needs; never stores full card details.
const pickGatewayDetails = (payment) => ({
  paymentId: payment.id,
  orderId: payment.order_id,
  status: payment.status,
  method: payment.method,
  amount: payment.amount,
  bank: payment.bank,
  wallet: payment.wallet,
  vpa: payment.vpa,
  rrn: payment.acquirer_data?.rrn,
  upiTransactionId: payment.acquirer_data?.upi_transaction_id,
  errorCode: payment.error_code,
  errorDescription: payment.error_description
});

const sendPaymentSuccessEmail = async (transaction) => {
  try {
    const user = await User.findById(transaction.user);
    if (!user || !user.email) return;

    const emailHtml = `
      <div style="font-family: Arial, sans-serif; line-height: 1.5; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="text-align: center; margin-bottom: 20px;">
          <img src="cid:socialswap-logo" alt="SocialSwap Logo" style="max-height: 80px;" />
        </div>
        <h2 style="color: #10B981; text-align: center;">Payment Successful!</h2>
        <p>Hi ${user.name || 'there'},</p>
        <p>We've successfully received your payment of <strong>₹${transaction.amount}</strong> for your recent transaction.</p>
        <p><strong>Transaction ID:</strong> ${transaction.transactionId}</p>
        <p>Your escrow deal or channel purchase is now confirmed. You can view the details in your profile.</p>
        <div style="text-align: center; margin: 30px 0;">
          <a href="https://www.socialswap.in/user/profile" style="background-color: #7C3AED; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold;">Go to Profile</a>
        </div>
        <p>Thank you for using SocialSwap!</p>
        <p>Best regards,<br>The SocialSwap Team</p>
      </div>
    `;
    sendMailWithLogo(user.email, 'Payment Successful - SocialSwap', emailHtml)
      .catch(err => console.error('Payment email failed:', err));
  } catch (err) {
    console.error('Failed to send payment email:', err);
  }
};

// Marks the escrow deal paid, or the purchased cart channels sold.
const fulfilTransaction = async (transaction) => {
  const { dealId, cartItems } = transaction.metadata || {};

  if (dealId) {
    try {
      const deal = await EscrowDeal.findByIdAndUpdate(dealId, { payment: 'paid' });
      if (deal && deal.channel) {
        await YouTubeChannel.findByIdAndUpdate(deal.channel, {
          $set: { status: 'Sold', sold: true }
        });
      }
    } catch (err) {
      console.error('Failed to update deal payment status:', err);
    }
    return;
  }

  try {
    const channelIds = (cartItems || [])
      .filter(item => !item.itemType || item.itemType === 'channel')
      .map(item => item.id);

    if (channelIds.length > 0) {
      await YouTubeChannel.updateMany(
        { _id: { $in: channelIds } },
        { $set: { status: 'Sold', sold: true } }
      );
    }
  } catch (err) {
    console.error('Failed to update channel status:', err);
  }
};

/**
 * Saves a payment outcome. SUCCESS is final: the filter stops a late FAILED or
 * PENDING from overwriting it, and stops verify, status polling and the webhook
 * from each fulfilling the same payment when they run at the same time.
 */
const applyPaymentOutcome = async (transaction, status, payment) => {
  const update = { status, updatedAt: new Date() };
  if (payment) {
    update.razorpayPaymentId = payment.id;
    update.gatewayDetails = pickGatewayDetails(payment);
  }

  const updated = await Transaction.findOneAndUpdate(
    { _id: transaction._id, status: { $ne: 'SUCCESS' } },
    { $set: update },
    { new: true }
  );

  if (!updated) return Transaction.findById(transaction._id);

  if (status === 'SUCCESS') {
    await fulfilTransaction(updated);
    await sendPaymentSuccessEmail(updated);
  } else if (updated.metadata?.dealId) {
    try {
      await EscrowDeal.updateOne(
        { _id: updated.metadata.dealId, payment: { $ne: 'paid' } },
        { payment: status === 'PENDING' ? 'pending' : 'notpaid' }
      );
    } catch (err) {
      console.error('Failed to update deal payment status:', err);
    }
  }

  return updated;
};

const capturePayment = async (client, payment) => {
  try {
    return await client.payments.capture(payment.id, payment.amount, payment.currency || CURRENCY);
  } catch (err) {
    // Another request or the dashboard's auto-capture may have got there first.
    console.warn('Razorpay capture skipped:', err?.error?.description || err.message);
    return client.payments.fetch(payment.id);
  }
};

/**
 * Asks Razorpay what happened to this order and records the result. This is the
 * only place that decides a payment's outcome.
 */
const syncWithRazorpay = async (transaction) => {
  const client = getRazorpay();
  if (!client || !transaction.razorpayOrderId) return transaction;
  if (transaction.status === 'SUCCESS') return transaction;

  const { items = [] } = await client.orders.fetchPayments(transaction.razorpayOrderId);
  if (items.length === 0) return transaction;

  let payment = items.find(item => item.status === 'captured');
  if (!payment) {
    const authorized = items.find(item => item.status === 'authorized');
    if (authorized) payment = await capturePayment(client, authorized);
  }

  if (payment && payment.status === 'captured') {
    if (payment.amount !== toPaise(transaction.amount)) {
      console.error(`Amount mismatch on ${transaction.transactionId}: paid ${payment.amount}`);
      return applyPaymentOutcome(transaction, 'PENDING', payment);
    }
    return applyPaymentOutcome(transaction, 'SUCCESS', payment);
  }

  if (payment || items.some(item => item.status === 'created')) {
    return applyPaymentOutcome(transaction, 'PENDING', payment);
  }

  // Every attempt failed. The buyer can still retry in the same order, which
  // is why FAILED is not final.
  return applyPaymentOutcome(transaction, 'FAILED', items[0]);
};

/**
 * Create a Razorpay order. The browser opens Razorpay Checkout with this data.
 */
const createPaymentOrder = async (req, res) => {
  try {
    const { amount, cartItems, dealId } = req.body;
    const currentUser = req.user;
    const numericAmount = Number(amount);

    if (!Number.isFinite(numericAmount) || numericAmount < MIN_AMOUNT_RUPEES) {
      return res.status(400).json({
        success: false,
        message: 'Invalid amount'
      });
    }

    const razorpay = getRazorpay();
    if (!razorpay) {
      console.error('Razorpay keys are missing from the environment');
      return res.status(503).json({
        success: false,
        message: 'Payments are temporarily unavailable. Please try again later.'
      });
    }

    // Check if any channels are already sold (only if cartItems exists)
    let actualSoldChannels = [];
    if (cartItems && cartItems.length > 0) {
      const soldChannels = await Promise.all(
        cartItems.map(async (item) => {
          // Skip check for service purchases
          if (item?.itemType && item?.itemType !== 'channel') return null;

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

    const order = await razorpay.orders.create({
      amount: toPaise(numericAmount),
      currency: CURRENCY,
      receipt: transactionId,
      notes: {
        transactionId,
        userId: String(currentUser.userId),
        dealId: dealId ? String(dealId) : ''
      }
    });

    await Transaction.createTransaction({
      transactionId,
      merchantTransactionId: transactionId,
      user: currentUser,
      amount: numericAmount,
      paymentMethod: 'RAZORPAY',
      razorpayOrderId: order.id,
      metadata: {
        cartItems: cartItems || [],
        dealId: dealId || null,
        initiatedAt: new Date(),
        validatedAt: new Date()
      }
    });

    const buyer = await User.findById(currentUser.userId).select('name email mobile').lean();

    return res.status(200).json({
      success: true,
      data: {
        transactionId,
        keyId: process.env.RAZORPAY_KEY_ID,
        orderId: order.id,
        amount: order.amount,
        currency: order.currency,
        prefill: {
          name: buyer?.name || '',
          email: buyer?.email || '',
          contact: buyer?.mobile || ''
        }
      }
    });

  } catch (error) {
    console.error('Payment order creation failed:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to create payment order',
      error: error?.error?.description || error.message
    });
  }
};

/**
 * Called by the browser after Razorpay Checkout reports success. The signature
 * proves the response came from Razorpay; the amount and state still come from
 * Razorpay's API, never from the browser.
 */
const verifyPayment = async (req, res) => {
  try {
    const {
      transactionId,
      razorpay_order_id: orderId,
      razorpay_payment_id: paymentId,
      razorpay_signature: signature
    } = req.body;

    if (!transactionId || !orderId || !paymentId || !signature) {
      return res.status(400).json({ success: false, message: 'Missing payment details' });
    }

    const transaction = await Transaction.findOne({
      transactionId: String(transactionId),
      user: req.user.userId
    });

    if (!transaction || transaction.razorpayOrderId !== orderId) {
      return res.status(404).json({ success: false, message: 'Transaction not found' });
    }

    const isValid = validatePaymentVerification(
      { order_id: orderId, payment_id: paymentId },
      signature,
      process.env.RAZORPAY_KEY_SECRET
    );

    if (!isValid) {
      return res.status(400).json({ success: false, message: 'Payment verification failed' });
    }

    let synced = transaction;
    try {
      synced = await syncWithRazorpay(transaction);
    } catch (syncError) {
      // The confirmation page keeps polling, so this can be retried safely.
      console.error('Razorpay sync after verify failed:', syncError);
    }

    return res.status(200).json({ success: true, status: synced.status });

  } catch (error) {
    console.error('Payment verification failed:', error);
    return res.status(500).json({
      success: false,
      message: 'Error verifying payment',
      error: error.message
    });
  }
};

/**
 * Razorpay webhook. Records payments even if the buyer closes the tab before
 * the browser can call verify-payment.
 */
const razorpayWebhook = async (req, res) => {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
  const signature = req.headers['x-razorpay-signature'];

  if (!secret) {
    console.error('RAZORPAY_WEBHOOK_SECRET is not configured');
    return res.status(503).json({ success: false });
  }

  let isValid = false;
  try {
    isValid = Boolean(req.rawBody && signature) &&
      validateWebhookSignature(req.rawBody.toString('utf8'), signature, secret);
  } catch (err) {
    isValid = false;
  }

  if (!isValid) {
    return res.status(400).json({ success: false, message: 'Invalid signature' });
  }

  try {
    const orderId =
      req.body?.payload?.payment?.entity?.order_id ||
      req.body?.payload?.order?.entity?.id;

    const transaction = orderId
      ? await Transaction.findOne({ razorpayOrderId: orderId })
      : null;

    if (transaction) await syncWithRazorpay(transaction);

    return res.status(200).json({ success: true });
  } catch (error) {
    // A non-2xx response makes Razorpay retry the event later.
    console.error('Razorpay webhook processing failed:', error);
    return res.status(500).json({ success: false });
  }
};

/**
 * Check payment status. Polled by the confirmation page.
 */
const checkPaymentStatus = async (req, res) => {
  const { transactionId } = req.params;

  try {
    let transaction = await Transaction.findOne({ transactionId });
    if (!transaction) {
      return res.status(404).json({
        success: false,
        message: 'Transaction not found'
      });
    }

    try {
      transaction = await syncWithRazorpay(transaction);
    } catch (apiError) {
      // Fall back to the last known status if Razorpay is unreachable or rate limited.
      console.error('Razorpay status check failed:', apiError?.error?.description || apiError.message);
    }

    const status = transaction.status;
    const details = transaction.gatewayDetails || {};
    const code = status === 'SUCCESS'
      ? 'PAYMENT_SUCCESS'
      : (status === 'FAILED' ? 'PAYMENT_ERROR' : 'PAYMENT_PENDING');

    return res.status(200).json({
      success: true,
      status,
      data: {
        channelId: transaction.metadata?.cartItems?.[0]?.id || transaction.metadata?.dealId || 'N/A',
        details: {
          code,
          data: {
            merchantTransactionId: transaction.transactionId,
            amount: toPaise(transaction.amount),
            paymentInstrument: {
              type: details.method,
              utr: details.rrn,
              upiTransactionId: details.upiTransactionId
            }
          }
        }
      },
      transaction: {
        id: transaction.transactionId,
        amount: transaction.amount,
        status
      }
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

    const transactions = await Transaction.find({ user: currentUser.userId })
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
      user: currentUser.userId
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
router.post('/verify-payment', auth, verifyPayment);
router.post('/payment/webhook', razorpayWebhook);
router.get('/status/:transactionId', checkPaymentStatus);

module.exports = router;