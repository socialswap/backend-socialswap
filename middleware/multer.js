const multer = require('multer');
const fs = require('fs').promises;
const path = require('path');
const YouTubeChannel = require('../models/channel');
const User = require('../models/user');
const { uploadToR2 } = require('../config/r2');

// Create uploads directory if it doesn't exist
const createUploadsDir = async () => {
  const uploadsDir = path.join('/tmp', 'uploads');
  try {
    await fs.access(uploadsDir);
  } catch (error) {
    await fs.mkdir(uploadsDir, { recursive: true });
  }
  return uploadsDir;
};

// Custom file validator middleware
const validateFiles = async (req, res, next) => {
  if (!req.files) {
    return res.status(400).json({ message: 'No files uploaded' });
  }

  const { banner, images } = req.files;

  // Validate banner
  if (!banner || banner.length !== 1) {
    return res.status(400).json({ message: 'Exactly one banner image is required' });
  }

  // Validate channel images
  if (!images || images.length < 2 || images.length > 10) {
    return res.status(400).json({ message: 'Between 2 and 10 channel images are required' });
  }

  try {
    const allFiles = [...banner, ...images];
    for (const file of allFiles) {
      const filePath = path.join('uploads', file.filename);
      await fs.access(filePath);
      const stats = await fs.stat(filePath);
      if (stats.size > 5 * 1024 * 1024) {
        await Promise.all(allFiles.map(f =>
          fs.unlink(path.join('uploads', f.filename)).catch(console.error)
        ));
        return res.status(400).json({ message: 'File size exceeded limit after upload' });
      }
    }
    next();
  } catch (error) {
    if (req.files) {
      const allFiles = [...(banner || []), ...(images || [])];
      await Promise.all(allFiles.map(file =>
        fs.unlink(path.join('uploads', file.filename)).catch(console.error)
      ));
    }
    return res.status(400).json({ message: 'File verification failed' });
  }
};

// Set up multer storage in memory (for ImgBB upload)
const storage = multer.memoryStorage();
const upload = multer({
  storage: storage,
  limits: { fileSize: 10 * 1024 * 1024 }  // 10MB limit
});

const uploadFields = upload.fields([
  { name: 'banner', maxCount: 1 },
  { name: 'images', maxCount: 10 },
  { name: 'dashboardImage', maxCount: 1 }
]);

// ImgBB helper removed

const createChannel = async (req, res) => {
  try {
    const { body, files, user } = req;

    // ── Active user check ─────────────────────────────────────
    // Fetch the user from DB to verify they are active
    const dbUser = await User.findById(user.userId);
    if (!dbUser) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }
    if (dbUser.status !== 'active') {
      return res.status(403).json({
        success: false,
        message: `Your account is ${dbUser.status}. Only active users can list channels.`
      });
    }
    // ─────────────────────────────────────────────────────────

    if (!body.userEmail || !body.contactNumber) {
      throw new Error('Email and contact number are required');
    }

    // Validate images count
    if (!files || !files.images || files.images.length < 2) {
      return res.status(400).json({
        success: false,
        message: 'Please upload at least 2 images'
      });
    }

    if (files.images.length > 10) {
      return res.status(400).json({
        success: false,
        message: 'Maximum 10 images allowed'
      });
    }
    
    // Validate dashboardImage
    if (!files || !files.dashboardImage || !files.dashboardImage[0]) {
      return res.status(400).json({
        success: false,
        message: 'Dashboard image is required'
      });
    }

    // Upload banner to R2
    let bannerUrl = '';
    if (files.banner && files.banner[0]) {
      bannerUrl = await uploadToR2(files.banner[0].buffer, files.banner[0].originalname, files.banner[0].mimetype);
    }

    // Upload dashboardImage to R2
    let dashboardImage = '';
    if (files.dashboardImage && files.dashboardImage[0]) {
      dashboardImage = await uploadToR2(files.dashboardImage[0].buffer, files.dashboardImage[0].originalname, files.dashboardImage[0].mimetype);
    }

    // Upload all channel images to R2
    const imageUrls = await Promise.all(
      files.images.map(file => uploadToR2(file.buffer, file.originalname, file.mimetype))
    );

    const channelData = {
      ...body,
      bannerUrl,
      imageUrls,
      dashboardImage,
      // Both createdBy (ObjectId) and seller (string) stored for compatibility
      createdBy: user.userId,
      seller: user.userId,
      status: 'Available',
      contactInfo: {
        email: body.userEmail,
        phone: body.contactNumber
      }
    };

    // Remove raw contact fields already moved into contactInfo
    delete channelData.userEmail;
    delete channelData.contactNumber;

    // Convert numeric fields
    const numericFields = [
      'subscriberCount', 'viewCount', 'videoCount',
      'estimatedEarnings', 'averageViewsPerVideo',
      'recentViews', 'watchTimeHours'
    ];
    numericFields.forEach(field => {
      if (channelData[field] !== undefined) {
        channelData[field] = Number(channelData[field]);
      }
    });

    // Convert boolean fields
    if (typeof channelData.monetized === 'string') {
      channelData.monetized = channelData.monetized === 'true';
    }
    if (typeof channelData.organicGrowth === 'string') {
      channelData.organicGrowth = channelData.organicGrowth === 'true';
    }

    // Parse joinedDate
    if (channelData.joinedDate) {
      channelData.joinedDate = new Date(channelData.joinedDate);
    }

    const channel = new YouTubeChannel(channelData);
    const newChannel = await channel.save();

    res.status(201).json({
      success: true,
      data: newChannel,
      message: 'Channel listed successfully! It will be reviewed by our team.'
    });

  } catch (err) {
    console.error('Error creating channel:', err);
    res.status(400).json({
      success: false,
      message: err.message || 'An error occurred while creating the channel',
      error: process.env.NODE_ENV === 'development' ? err.stack : undefined
    });
  }
};

// Error handling middleware for multer
const handleMulterError = (err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (req.files) {
      const allFiles = [
        ...(req.files.banner || []),
        ...(req.files.images || [])
      ];
      Promise.all(allFiles.map(file =>
        fs.unlink(path.join('uploads', file.filename)).catch(console.error)
      ));
    }

    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ message: 'File size exceeds 10MB limit' });
    }
    if (err.code === 'LIMIT_UNEXPECTED_FILE') {
      return res.status(400).json({ message: 'Unexpected field or too many files' });
    }
    return res.status(400).json({ message: 'File upload error', error: err.message });
  }
  next(err);
};

module.exports = {
  upload,
  uploadFields,
  validateFiles,
  createChannel,
  handleMulterError
};