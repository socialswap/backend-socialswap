const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');  // Import bcrypt for password hashing comparison
const User = require('../models/user');

exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;

    // Convert email to lowercase
    const lowercaseEmail = email.toLowerCase();

    // Find user by email, including the password field
    const user = await User.findOne({ email: lowercaseEmail }).select('+password');
    if (!user) {
      return res.status(400).json({ success: false, message: 'Invalid credentials' });
    }

    // Compare the provided password with the stored hashed password using bcrypt
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ success: false, message: 'Invalid credentials' });
    }

    // Generate JWT token
    const token = jwt.sign(
      { userId: user._id, email: user.email,role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: '1h' }
    );

    res.status(200).json({ 
      success: true, 
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};
