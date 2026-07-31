// controllers/userController.js
const User = require('../models/user');
const bcrypt = require('bcryptjs');
const { uploadToR2, deleteFromR2 } = require('../config/r2');

exports.getUserProfile = async (req, res) => {    
  try {
    const user = await User.findById(req.user.userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    res.json(user);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
};

exports.uploadAvatar = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'No file uploaded' });
    }

    const user = await User.findById(req.user.userId);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    // Delete existing avatar if it exists
    if (user.avatar) {
      await deleteFromR2(user.avatar);
    }

    // Upload new avatar to R2
    const avatarUrl = await uploadToR2(
      req.file.buffer,
      req.file.originalname,
      req.file.mimetype
    );

    // Save to user
    user.avatar = avatarUrl;
    await user.save();

    res.json({ success: true, url: avatarUrl, message: 'Avatar updated successfully' });
  } catch (error) {
    console.error('Avatar upload error:', error);
    res.status(500).json({ success: false, message: 'Failed to upload avatar', error: error.message });
  }
};

exports.updateUserProfile = async (req, res) => {
  try {
    const { name, email, password, role, currentPassword, mobile, username } = req.body;
    const user = await User.findById(req.user.userId);

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Verify current password if attempting to change the password
    if (password) {
      if (!currentPassword) {
        return res.status(400).json({ message: 'Current password is required to change password' });
      }

      const isMatch = await bcrypt.compare(currentPassword, user.password);
      if (!isMatch) {
        return res.status(400).json({ message: 'Current password is incorrect' });
      }

      // Hash the new password
      const salt = await bcrypt.genSalt(10);
      user.password = await bcrypt.hash(password, salt);
    }

    // Update username if provided
    if (username !== undefined) {
      if (username === '') {
        user.username = undefined;
      } else {
        const cleanUsername = username.replace(/^@/, '').toLowerCase().trim();
        const usernameRegex = /^[a-zA-Z0-9_]{3,20}$/;
        if (!usernameRegex.test(cleanUsername)) {
          return res.status(400).json({ message: 'Username must be between 3 and 20 characters and contain only letters, numbers, or underscores' });
        }
        const existingUser = await User.findOne({ username: cleanUsername, _id: { $ne: req.user.userId } });
        if (existingUser) {
          return res.status(400).json({ message: 'Username is already taken' });
        }
        user.username = cleanUsername;
      }
    }

    // Update other fields if provided
    if (name) user.name = name;
    if (email) user.email = email;
    if (role) user.role = role;
    if (mobile) user.mobile = mobile;

    await user.save();

    // Return updated user data without password
    const updatedUser = await User.findById(req.user.userId).select('-password');
    res.json(updatedUser);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
};


exports.changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    // Fetch the user based on the logged-in user ID
    const user = await User.findById(req.user.userId);
    console.log(user,currentPassword);
    
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Check if the current password matches
    const isMatch = await bcrypt.compare(currentPassword, user.password);
    if (!isMatch) {
      return res.status(400).json({ message: 'Current password is incorrect' });
    }

    // Hash the new password
    const salt = await bcrypt.genSalt(10);
    user.password = await bcrypt.hash(newPassword, salt);

    // Save the updated user
    await user.save();

    res.json({ message: 'Password changed successfully' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
};


// Fetch all users
exports.getAllUsers = async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Access denied: Admin only' });
    }
    const users = await User.find().select('-password').lean();
    
    const YouTubeChannel = require('../models/channel');
    const usersWithChannelCount = await Promise.all(
      users.map(async (user) => {
        const channelCount = await YouTubeChannel.countDocuments({
          $or: [
            { createdBy: user._id },
            { seller: user._id.toString() }
          ]
        });
        return { ...user, channelCount };
      })
    );
    
    res.json(usersWithChannelCount);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Get a specific user
exports.getUser = async (req, res) => {
  try {
    if (req.user.role !== 'admin' && req.user.userId !== req.params.userId) {
      return res.status(403).json({ message: 'Access denied' });
    }
    const user = await User.findById(req.params.userId).select('-password');
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    res.json(user);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Update user role
exports.updateUserRole = async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Access denied: Admin only' });
    }
    const { role } = req.body;
    const user = await User.findById(req.params.userId);

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    user.role = role;
    await user.save();

    res.json({ message: 'User role updated successfully', user });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Update user status and role (Admin)
exports.adminUpdateUser = async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Access denied: Admin only' });
    }
    const { role, status } = req.body;
    const user = await User.findById(req.params.userId);

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    if (role) user.role = role;
    if (status) {
      const validStatuses = ['active', 'suspended', 'disabled', 'deleted'];
      if (!validStatuses.includes(status)) {
        return res.status(400).json({ message: 'Invalid status value' });
      }
      user.status = status;
    }

    await user.save();
    res.json({ message: 'User updated successfully', user });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Delete a user
exports.deleteUser = async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Access denied: Admin only' });
    }
    const user = await User.findByIdAndDelete(req.params.userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    res.json({ message: 'User deleted successfully' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Check username availability
exports.checkUsernameAvailability = async (req, res) => {
  try {
    const { username } = req.params;
    const cleanUsername = username.replace(/^@/, '').toLowerCase().trim();
    const usernameRegex = /^[a-zA-Z0-9_]{3,20}$/;
    if (!usernameRegex.test(cleanUsername)) {
      return res.status(400).json({ message: 'Username must be between 3 and 20 characters and contain only letters, numbers, or underscores' });
    }
    const existingUser = await User.findOne({ username: cleanUsername });
    res.json({ available: !existingUser });
  } catch (error) {
    console.error('Error checking username:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Get public user profile (avatar, name, username, and unsold channels)
exports.getPublicUserProfile = async (req, res) => {
  try {
    const { username } = req.params;
    const cleanUsername = username.replace(/^@/, '').toLowerCase().trim();
    
    const user = await User.findOne({ username: cleanUsername }).select('name username avatar role status createdAt');
    if (!user || user.status !== 'active') {
      return res.status(404).json({ message: 'User profile not found' });
    }

    const Channel = require('../models/channel');
    const channels = await Channel.find({
      $or: [
        { createdBy: user._id },
        { seller: user._id.toString() }
      ],
      sold: { $ne: true },
      status: { $in: ['Available', 'approved'] }
    }).select('-contactInfo'); // Exclude email and phone as requested

    res.json({ user, channels });
  } catch (error) {
    console.error('Error fetching public user profile:', error);
    res.status(500).json({ message: 'Server error' });
  }
};
