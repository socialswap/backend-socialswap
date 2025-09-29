// controllers/login.js  (append or add)
const admin = require('../config/firebaseAdmin'); // path as above
const jwt = require('jsonwebtoken');
const User = require('../models/user');

// Accepts { idToken } from client
exports.firebaseLogin = async (req, res) => {
  try {
    const { idToken } = req.body;
    if (!idToken) return res.status(400).json({ success: false, message: 'idToken required' });

    const decoded = await admin.auth().verifyIdToken(idToken);
    const uid = decoded.uid;
    const phone_number = decoded.phone_number || '';
    const email = decoded.email || '';

    // find user by mobile or create a new user
    let user = null;
    if (phone_number) {
      user = await User.findOne({ mobile: phone_number });
    } else if (email) {
      user = await User.findOne({ email: email });
    }

    if (!user) {
      user = new User({
        name: decoded.name || '',
        mobile: phone_number || '',
        email: email || '',
        role: 'user'
      });
      await user.save();
    }

    // create your app JWT
    const token = jwt.sign({ id: user._id, uid }, process.env.JWT_SECRET || 'your_jwt_secret', { expiresIn: '7d' });

    return res.json({
      success: true,
      token,
      user: {
        id: user._id,
        name: user.name,
        mobile: user.mobile,
        role: user.role,
      }
    });
  } catch (err) {
    console.error('firebaseLogin error', err);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};
