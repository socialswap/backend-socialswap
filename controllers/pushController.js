const PushSubscription = require('../models/pushSubscription');

exports.subscribe = async (req, res) => {
  try {
    const { subscription } = req.body;
    const userId = req.user.userId || req.user._id;

    if (!subscription || !subscription.endpoint) {
      return res.status(400).json({ success: false, message: 'Invalid subscription object' });
    }

    // Check if subscription already exists for this endpoint
    let existingSub = await PushSubscription.findOne({ endpoint: subscription.endpoint });
    
    if (existingSub) {
      // Update userId if it belongs to someone else now
      if (existingSub.userId.toString() !== userId.toString()) {
        existingSub.userId = userId;
        await existingSub.save();
      }
    } else {
      // Create new subscription
      await PushSubscription.create({
        userId,
        endpoint: subscription.endpoint,
        keys: subscription.keys
      });
    }

    res.status(200).json({ success: true, message: 'Subscribed to push notifications' });
  } catch (error) {
    console.error('Push Subscribe Error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.unsubscribe = async (req, res) => {
  try {
    const { endpoint } = req.body;
    
    if (endpoint) {
      await PushSubscription.deleteOne({ endpoint });
    }
    
    res.status(200).json({ success: true, message: 'Unsubscribed' });
  } catch (error) {
    console.error('Push Unsubscribe Error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};
