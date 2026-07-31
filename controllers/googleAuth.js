const { OAuth2Client } = require('google-auth-library');
const axios = require('axios');
const jwt = require('jsonwebtoken');
const User = require('../models/user');
const { sendMailWithLogo } = require('../utils/mailer');

const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

/**
 * Verify Google access token and authenticate user
 */
exports.googleLogin = async (req, res) => {
  try {
    const { accessToken, userInfo } = req.body;

    if (!accessToken || !userInfo) {
      return res.status(400).json({
        success: false,
        message: 'Access token and user info are required'
      });
    }

    // Verify the access token by fetching user info from Google
    try {
      const googleResponse = await axios.get('https://www.googleapis.com/oauth2/v3/userinfo', {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      // Verify that the user info matches
      if (googleResponse.data.sub !== userInfo.id) {
        return res.status(401).json({
          success: false,
          message: 'Invalid user information'
        });
      }

      const { sub: googleId, email, name, picture } = googleResponse.data;

      // Convert email to lowercase
      const lowercaseEmail = email.toLowerCase();

      // Find or create user
      let user = await User.findOne({ 
        $or: [
          { email: lowercaseEmail },
          { googleId: googleId }
        ]
      });

      if (user) {
        if (user.status && user.status !== 'active') {
          return res.status(403).json({
            success: false,
            message: `Your account is ${user.status}. Please contact support.`
          });
        }
        // Update user if they login with Google for the first time
        if (!user.googleId) {
          user.googleId = googleId;
          user.authProvider = 'google';
          if (picture) user.avatar = picture;
          await user.save();
        } else if (picture && user.avatar !== picture) {
          // Update avatar if changed
          user.avatar = picture;
          await user.save();
        }
      } else {
        // Create new user
        user = new User({
          name: name,
          email: lowercaseEmail,
          googleId: googleId,
          authProvider: 'google',
          avatar: picture || '',
          role: 'buyer' // Default role
        });
        await user.save();
      }

      let isFirstLogin = false;
      if (!user.welcomeEmailSent) {
        user.welcomeEmailSent = true;
        isFirstLogin = true;
        await user.save();
      }

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
        sendMailWithLogo(user.email, 'Welcome to SocialSwap! 🎉', welcomeHtml).catch(err => console.error('Welcome email failed:', err));
      }

      // Generate JWT token
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
          role: user.role,
          avatar: user.avatar
        }
      });
    } catch (googleError) {
      console.error('Google token verification error:', googleError);
      return res.status(401).json({
        success: false,
        message: 'Invalid Google access token',
        error: googleError.message
      });
    }
  } catch (error) {
    console.error('Google login error:', error);
    res.status(500).json({
      success: false,
      message: 'Google authentication failed',
      error: error.message
    });
  }
};

