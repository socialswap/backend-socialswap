const mongoose = require('mongoose');

const EscrowDealSchema = new mongoose.Schema({
  channel: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'YouTubeChannel',
    required: true
  },
  buyer: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  seller: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  dealPrice: {
    type: Number,
    required: true,
    min: 0
  },
  originalPrice: {
    type: Number,
    min: 0
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  status: {
    type: String,
    enum: ['pending', 'accepted', 'rejected'],
    default: 'pending'
  },
  payment: {
    type: String,
    enum: ['paid', 'notpaid', 'pending'],
    default: 'notpaid'
  },
  paymentDetails: {
    type: mongoose.Schema.Types.Mixed
  },
  chatThread: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ChatThread'
  }
}, { timestamps: true });

const EscrowDeal = mongoose.model('EscrowDeal', EscrowDealSchema);
module.exports = EscrowDeal;
