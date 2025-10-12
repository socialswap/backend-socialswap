// controllers/signup.js

const User = require('../models/user');

const bcrypt = require('bcryptjs');

exports.signup = async (req, res) => {
  try {
    const { name, email, password, role, phone } = req.body;

    // Convert email to lowercase
    const lowercaseEmail = email.toLowerCase();

    // Check if user already exists
    const existingUser = await User.findOne({ email: lowercaseEmail });
    if (existingUser) {
      return res.status(400).json({ success: false, message: 'User already exists' });
    }

    // Hash the password
    const salt = await bcrypt.genSalt(10); // Generate salt with 10 rounds
    const hashedPassword = await bcrypt.hash(password, salt);

    // Create new user with hashed password and lowercase email
    const user = new User({
      name,
      email: lowercaseEmail,
      password: hashedPassword,
      mobile: phone,
      role,
    });

    await user.save();

    res.status(201).json({ success: true, message: 'User created successfully' });
  } catch (error) {
    console.error('Signup error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};
