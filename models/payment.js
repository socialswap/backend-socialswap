const mongoose = require('mongoose');

const TransactionSchema = new mongoose.Schema({
  // Basic Transaction Details
  transactionId: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  merchantTransactionId: {
    type: String,
    required: true
  },
  user: {
    type: String,
    required: true
  },
  amount: {
    type: Number,
    required: true,
    min: 0
  },
  currency: {
    type: String,
    default: 'INR',
    enum: ['INR', 'USD']
  },

  // Payment Status Tracking
  status: {
    type: String,
    enum: [
      'INITIATED', 
      'PENDING', 
      'SUCCESS', 
      'FAILED', 
      'REFUNDED', 
      'CANCELLED'
    ],
    default: 'INITIATED'
  },
  
  // PhonePe Specific Details
  phonepeResponse: {
    type: mongoose.Schema.Types.Mixed,
    default: null
  },
  
  // Payment Method Details
  paymentMethod: {
    type: String,
    enum: ['PHONEPE', 'CREDIT_CARD', 'DEBIT_CARD', 'NET_BANKING', 'UPI']
  },
  
  // Associated Order Details
  orderDetails: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Order'
  },
  
  // Additional Metadata
  metadata: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  
  // Timestamps
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Virtual to get readable status
TransactionSchema.virtual('readableStatus').get(function() {
  const statusMap = {
    'INITIATED': 'Payment Initiated',
    'PENDING': 'Payment Processing',
    'SUCCESS': 'Payment Successful',
    'FAILED': 'Payment Failed',
    'REFUNDED': 'Payment Refunded',
    'CANCELLED': 'Payment Cancelled'
  };
  return statusMap[this.status] || 'Unknown Status';
});

// Static method to create transaction with more robust error handling
TransactionSchema.statics.createTransaction = async function(data) {
  try {
    // Validate required fields
    if (!data.transactionId || !data.merchantTransactionId) {
      throw new Error('Transaction ID and Merchant Transaction ID are required');
    }

    // Ensure user is properly handled
    const userId = data.user ? 
      (typeof data.user === 'string' ? data.user : data.user.userId || data.user._id) 
      : "SYSTEM";

    const transaction = new this({
      transactionId: data.transactionId,
      merchantTransactionId: data.merchantTransactionId,
      user: userId,  // Use extracted user ID
      amount: data.amount,
      status: 'INITIATED',
      phonepeResponse: data.phonepeResponse || null,
      paymentMethod: 'PHONEPE',
      metadata: data.metadata || {},
      currency: data.currency || 'INR'
    });

    console.log('Creating transaction:', transaction);

    return await transaction.save();
  } catch (error) {
    console.error('Transaction creation error:', error);
    throw new Error(`Transaction creation failed: ${error.message}`);
  }
};


// Enhanced method to update transaction status with validation
TransactionSchema.methods.updateTransactionStatus = async function(status, phonepeResponse) {
  try {
    // Validate status
    if (!['INITIATED', 'PENDING', 'SUCCESS', 'FAILED', 'REFUNDED', 'CANCELLED'].includes(status)) {
      throw new Error(`Invalid status: ${status}`);
    }

    // Update fields
    this.status = status;
    this.phonepeResponse = phonepeResponse || this.phonepeResponse;
    this.updatedAt = new Date();

    // Log status update for debugging
    console.log(`Updating transaction ${this.transactionId} status to: ${status}`);

    // Save with validation
    return await this.save();
  } catch (error) {
    console.error(`Error updating transaction status: ${error.message}`);
    throw error;
  }
};

// Static method to find and update transaction
TransactionSchema.statics.updateTransactionByMerchantId = async function(merchantTransactionId, status, phonepeResponse) {
  try {
    const transaction = await this.findOne({ merchantTransactionId });
    
    if (!transaction) {
      throw new Error(`Transaction not found for Merchant Transaction ID: ${merchantTransactionId}`);
    }

    return await transaction.updateTransactionStatus(status, phonepeResponse);
  } catch (error) {
    console.error('Error in updateTransactionByMerchantId:', error);
    throw error;
  }
};

TransactionSchema.methods.updateTransactionStatus = async function(status, phonepeResponse, user) {

  
  try {
    // Validate status
    if (!['INITIATED', 'PENDING', 'SUCCESS', 'FAILED', 'REFUNDED', 'CANCELLED'].includes(status)) {
      throw new Error(`Invalid status: ${status}`);
    }

    // Optionally track who is updating the status (user is optional)
    this.updatedBy = user ? user._id : 'SYSTEM'; // Store who updated the status
    this.status = status;
    this.phonepeResponse = phonepeResponse || this.phonepeResponse;
    this.updatedAt = new Date();

    // Log status update for debugging
    console.log(`Updating transaction ${this.transactionId} status to: ${status}`);

    // Save with validation
    return await this.save();
  } catch (error) {
    console.error(`Error updating transaction status: ${error.message}`);
    throw error;
  }
};

const Transaction = mongoose.model('Transaction', TransactionSchema);

module.exports = Transaction;