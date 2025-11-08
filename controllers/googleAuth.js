const { OAuth2Client } = require('google-auth-library');
const axios = require('axios');
const jwt = require('jsonwebtoken');
const User = require('../models/user');

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

      // Generate JWT token
      const token = jwt.sign(
        { userId: user._id, email: user.email, role: user.role },
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

