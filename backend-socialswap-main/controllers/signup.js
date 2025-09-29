const User = require('../models/user');

exports.signup = async (req, res) => {
  try {
    const { name, mobile, role } = req.body;

    if (!mobile) {
      return res.status(400).json({ success: false, message: 'Mobile number is required' });
    }

    // Check if user already exists
    const existingUser = await User.findOne({ mobile });
    if (existingUser) {
      return res.status(400).json({ success: false, message: 'User already exists' });
    }

    // Create user without password (login will be via OTP)
    const user = new User({
      name,
      mobile,
      role: role || 'user'
    });

    await user.save();

    res.status(201).json({ success: true, message: 'User created successfully', user });
  } catch (error) {
    console.error('Signup error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};
