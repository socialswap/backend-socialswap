const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { transporter, sendMailWithLogo } = require('../utils/mailer');
const User = require('../models/user');

const generateOtp = () => Math.floor(100000 + Math.random() * 900000).toString();

exports.sendEmailOtp = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        message: 'Email is required'
      });
    }

    if (!transporter) {
      return res.status(500).json({
        success: false,
        message: 'Email service is not configured on the server'
      });
    }

    const lowercaseEmail = email.toLowerCase();
    let user = await User.findOne({ email: lowercaseEmail }).select('+emailOtpExpires');

    if (user && user.status && user.status !== 'active') {
      return res.status(403).json({
        success: false,
        message: `Your account is ${user.status}. Please contact support.`
      });
    }

    if (!user) {
      const randomPassword = crypto.randomBytes(32).toString('hex');
      const hashedPassword = await bcrypt.hash(randomPassword, 10);

      user = new User({
        name: lowercaseEmail.split('@')[0],
        email: lowercaseEmail,
        password: hashedPassword,
        authProvider: 'email-otp',
        role: 'buyer'
      });
    }

    const otp = generateOtp();
    const otpHash = await bcrypt.hash(otp, 10);
    user.emailOtpHash = otpHash;
    user.emailOtpExpires = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes
    user.authProvider = user.authProvider || 'email-otp';

    await user.save();

    const mailOptions = {
      from: process.env.SMTP_FROM || process.env.SMTP_USER,
      to: lowercaseEmail,
      subject: 'Your SocialSwap Login OTP',
      text: `Your one-time password (OTP) is ${otp}. It is valid for 10 minutes.`,
      html: `
        <div style="font-family: Arial, sans-serif; line-height: 1.5;">
          <h2>SocialSwap Login Verification</h2>
          <p>Your one-time password (OTP) is:</p>
          <p style="font-size: 24px; font-weight: bold; letter-spacing: 4px;">${otp}</p>
          <p>This code is valid for 10 minutes.</p>
          <p>If you did not request this code, please ignore this email.</p>
        </div>
      `
    };

    await transporter.sendMail(mailOptions);

    res.status(200).json({
      success: true,
      message: 'OTP sent successfully to email'
    });
  } catch (error) {
    console.error('Email OTP send error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to send OTP',
      error: error.message
    });
  }
};

exports.verifyEmailOtp = async (req, res) => {
  try {
    const { email, otp } = req.body;

    if (!email || !otp) {
      return res.status(400).json({
        success: false,
        message: 'Email and OTP are required'
      });
    }

    const lowercaseEmail = email.toLowerCase();
    const user = await User.findOne({ email: lowercaseEmail }).select('+emailOtpHash +emailOtpExpires');

    if (!user) {
      return res.status(400).json({
        success: false,
        message: 'User not found'
      });
    }

    if (user.status && user.status !== 'active') {
      return res.status(403).json({
        success: false,
        message: `Your account is ${user.status}. Please contact support.`
      });
    }

    if (!user.emailOtpHash || !user.emailOtpExpires) {
      return res.status(400).json({
        success: false,
        message: 'OTP expired or not found. Please request a new OTP.'
      });
    }

    if (user.emailOtpExpires < new Date()) {
      user.emailOtpHash = undefined;
      user.emailOtpExpires = undefined;
      await user.save();

      return res.status(400).json({
        success: false,
        message: 'OTP has expired. Please request a new OTP.'
      });
    }

    const isMatch = await bcrypt.compare(otp, user.emailOtpHash);

    if (!isMatch) {
      return res.status(400).json({
        success: false,
        message: 'Invalid OTP. Please try again.'
      });
    }

    user.emailOtpHash = undefined;
    user.emailOtpExpires = undefined;
    user.authProvider = user.authProvider || 'email-otp';

    let isFirstLogin = false;
    if (!user.welcomeEmailSent) {
      user.welcomeEmailSent = true;
      isFirstLogin = true;
    }

    await user.save();

    if (isFirstLogin) {
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
      // Send welcome email asynchronously without blocking the response
      sendMailWithLogo(user.email, 'Welcome to SocialSwap! 🎉', welcomeHtml).catch(err => console.error('Welcome email failed:', err));
    }

    const token = jwt.sign(
      { userId: user._id, email: user.email, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
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
    console.error('Email OTP verify error:', error);
    res.status(500).json({
      success: false,
      message: 'OTP verification failed',
      error: error.message
    });
  }
};

