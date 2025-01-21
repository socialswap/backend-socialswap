const multer = require('multer');
const fs = require('fs').promises;
const path = require('path');
const YouTubeChannel = require('../models/channel');

// Create uploads directory if it doesn't exist
const createUploadsDir = async () => {
  const uploadsDir = path.join(process.cwd(), 'uploads');
  try {
    await fs.access(uploadsDir);
  } catch (error) {
    await fs.mkdir(uploadsDir, { recursive: true });
  }
  return uploadsDir;
};

// Configure multer storage
const storage = multer.diskStorage({
  destination: async function (req, file, cb) {
    try {
      const uploadsDir = await createUploadsDir();
      cb(null, uploadsDir);
    } catch (error) {
      cb(new Error('Could not create uploads directory'));
    }
  },
  filename: function (req, file, cb) {
    // Add file extension validation
    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif'];
    if (!allowedTypes.includes(file.mimetype)) {
      cb(new Error('Invalid file type. Only JPEG, PNG and GIF are allowed'));
      return;
    }
    
    // Sanitize filename and add field name prefix
    const sanitizedName = file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_');
    cb(null, `${file.fieldname}-${Date.now()}-${sanitizedName}`);
  }
});

// Configure multer upload
const upload = multer({
  storage: storage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
  }
});

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
  if (!images || images.length < 2 || images.length > 4) {
    return res.status(400).json({ message: 'Between 2 and 4 channel images are required' });
  }

  try {
    // Verify all files exist and are within size limit
    const allFiles = [...banner, ...images];
    for (const file of allFiles) {
      const filePath = path.join('uploads', file.filename);
      
      // Verify file exists and is accessible
      await fs.access(filePath);

      // Validate file size on disk
      const stats = await fs.stat(filePath);
      if (stats.size > 5 * 1024 * 1024) { // 5MB
        // Clean up all uploaded files
        await Promise.all(allFiles.map(f => 
          fs.unlink(path.join('uploads', f.filename)).catch(console.error)
        ));
        return res.status(400).json({ message: 'File size exceeded limit after upload' });
      }
    }
    next();
  } catch (error) {
    // Clean up any uploaded files
    if (req.files) {
      const allFiles = [...(banner || []), ...(images || [])];
      await Promise.all(allFiles.map(file => 
        fs.unlink(path.join('uploads', file.filename)).catch(console.error)
      ));
    }
    return res.status(400).json({ message: 'File verification failed' });
  }
};

// Define upload fields
const uploadFields = upload.fields([
  { name: 'banner', maxCount: 1 },
  { name: 'images', maxCount: 4 }
]);

// Modified createChannel function
const createChannel = async (req, res) => {
  const filePaths = {
    banner: null,
    images: []
  };
  
  try {
    const { body, user } = req;
    
    // Validate required contact information
    if (!body.userEmail) {
      throw new Error('Email address is required');
    }
    if (!body.contactNumber) {
      throw new Error('Contact number is required');
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(body.userEmail)) {
      throw new Error('Invalid email format');
    }

    // Validate contact number format (allows +, digits, spaces, and hyphens)
    const phoneRegex = /^[+]?[\d\s-]+$/;
    if (!phoneRegex.test(body.contactNumber)) {
      throw new Error('Invalid contact number format');
    }

    // Process uploaded files
    if (req.files) {
      if (req.files.banner) {
        filePaths.banner = path.join('uploads', req.files.banner[0].filename);
      }
      if (req.files.images) {
        // Validate minimum and maximum image requirements
        if (req.files.images.length < 2) {
          throw new Error('Minimum 2 images required');
        }
        if (req.files.images.length > 4) {
          throw new Error('Maximum 4 images allowed');
        }
        
        filePaths.images = req.files.images.map(file => 
          path.join('uploads', file.filename)
        );
      }
    }

    // Create channel data with contact information
    const channelData = {
      ...body,
      bannerUrl: filePaths.banner,
      imageUrls: filePaths.images,
      seller: user.userId,
      status: 'Available',
      createdAt: new Date(),
      updatedAt: new Date(),
      contactInfo: {
        email: body.userEmail,
        phone: body.contactNumber
      }
    };

    // Remove separate email and phone fields from the main object
    delete channelData.userEmail;
    delete channelData.contactNumber;

    const channel = new YouTubeChannel(channelData);
    const newChannel = await channel.save();

    // Send success response with created channel
    res.status(201).json({
      success: true,
      data: newChannel,
      message: 'Channel created successfully'
    });

  } catch (err) {
    // Clean up uploaded files if there was an error
    if (filePaths.banner) {
      await fs.unlink(filePaths.banner).catch(console.error);
    }
    if (filePaths.images.length > 0) {
      await Promise.all(filePaths.images.map(path => 
        fs.unlink(path).catch(console.error)
      ));
    }
    
    console.error('Error creating channel:', err);
    res.status(400).json({ 
      success: false,
      message: err.message || 'An error occurred while creating the channel',
      error: process.env.NODE_ENV === 'development' ? err.stack : undefined
    });
  }
};

// Export the controller
module.exports = {
  createChannel
};
// Error handling middleware for multer
const handleMulterError = (err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    // Clean up any uploaded files before sending error response
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
      return res.status(400).json({ message: 'File size exceeds 5MB limit' });
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