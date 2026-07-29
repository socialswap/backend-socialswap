// controllers/signup.js

const User = require('../models/user');
const bcrypt = require('bcryptjs');
const { sendMailWithLogo } = require('../utils/mailer');

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
      welcomeEmailSent: true
    });

    await user.save();

    const welcomeHtml = `
      <div style="font-family: Arial, sans-serif; line-height: 1.5; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="text-align: center; margin-bottom: 20px;">
          <img src="cid:socialswap-logo" alt="SocialSwap Logo" style="max-height: 80px;" />
        </div>
        <h2 style="color: #7C3AED; text-align: center;">Welcome to SocialSwap!</h2>
        <p>Hi ${user.name || 'there'},</p>
        <p>Welcome to <strong>SocialSwap</strong>! We're thrilled to have you on board.</p>
        <p>SocialSwap is your trusted platform to buy and sell digital channels safely. Explore top deals, chat with sellers, and use our secure escrow system for a seamless experience.</p>
        <div style="text-align: center; margin: 30px 0;">
          <a href="https://www.socialswap.in" style="background-color: #7C3AED; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold;">Explore SocialSwap</a>
        </div>
        <p>If you have any questions, feel free to reach out to our support team.</p>
        <p>Best regards,<br>The SocialSwap Team</p>
      </div>
    `;
    sendMailWithLogo(user.email, 'Welcome to SocialSwap! 🎉', welcomeHtml).catch(err => console.error('Welcome email failed:', err));

    res.status(201).json({ success: true, message: 'User created successfully' });
  } catch (error) {
    console.error('Signup error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};
