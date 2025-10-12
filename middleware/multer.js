const multer = require('multer');
const fs = require('fs').promises;
const path = require('path');
const YouTubeChannel = require('../models/channel');
const axios = require('axios')
// ImgBB API key (replace with your actual API key)
const IMGBB_API_KEY = '338c0d8da9a3175d9b6e43e47959c3dc';
const IMGBB_UPLOAD_URL = 'https://api.imgbb.com/1/upload';

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

// // Configure multer storage
// const storage = multer.diskStorage({
//   destination: async function (req, file, cb) {
//     try {
//       const uploadsDir = await createUploadsDir();
//       cb(null, uploadsDir);
//     } catch (error) {
//       cb(new Error('Could not create uploads directory'));
//     }
//   },
//   filename: function (req, file, cb) {
//     // Add file extension validation
//     const allowedTypes = ['image/jpeg', 'image/png', 'image/gif'];
//     if (!allowedTypes.includes(file.mimetype)) {
//       cb(new Error('Invalid file type. Only JPEG, PNG and GIF are allowed'));
//       return;
//     }
    
//     // Sanitize filename and add field name prefix
//     const sanitizedName = file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_');
//     cb(null, `${file.fieldname}-${Date.now()}-${sanitizedName}`);
//   }
// });

// Configure multer upload
// const upload = multer({
//   storage: storage,
//   limits: {
//     fileSize: 5 * 1024 * 1024, // 5MB limit
//   }
// });

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


// Set up multer storage to handle file uploads in memory (for ImgBB upload)
const storage = multer.memoryStorage();  
const upload = multer({ 
  storage: storage, 
  limits: { fileSize: 10 * 1024 * 1024 }  // Limit file size to 10MB
});

const uploadFields = upload.fields([
  { name: 'banner', maxCount: 1 },
  { name: 'images', maxCount: 4 }
]);

const uploadToImgBB = async (fileBuffer) => {
  try {
      // Create URL-encoded form data
      const formData = new URLSearchParams();
      formData.append('key', IMGBB_API_KEY);
      formData.append('image', fileBuffer.toString('base64'));

      const response = await axios.post(IMGBB_UPLOAD_URL, formData, {
          headers: {
              'Content-Type': 'application/x-www-form-urlencoded'
          }
      });

      if (response.data.success) {
          return response.data.data.url;
      } else {
          throw new Error('ImgBB upload failed');
      }
  } catch (error) {
      console.error('ImgBB upload error details:', error.response?.data || error.message);
      throw new Error('Failed to upload to ImgBB: ' + error.message);
  }
};

const createChannel = async (req, res) => {
  const filePaths = {
      banner: null,
      images: []
  };

  try {
      const { body, files, user } = req;

      if (!body.userEmail || !body.contactNumber) {
          throw new Error('Email and contact number are required');
      }

      // Process banner image
      if (files.banner && files.banner[0]) {
          filePaths.banner = await uploadToImgBB(files.banner[0].buffer);
      }

      // Process multiple images
      if (files.images && files.images.length > 0) {
          filePaths.images = await Promise.all(
              files.images.map(file => uploadToImgBB(file.buffer))
          );
      }

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

      delete channelData.userEmail;
      delete channelData.contactNumber;

      const channel = new YouTubeChannel(channelData);
      const newChannel = await channel.save();

      res.status(201).json({
          success: true,
          data: newChannel,
          message: 'Channel created successfully'
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