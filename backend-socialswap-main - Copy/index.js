const express = require('express');
const cors = require('cors');
const helmet = require('helmet'); // For adding security headers
const connectDB = require('./config/db');
const youtubeChannelRoutes = require('./routes/routes');
const payment = require('./controllers/payment');
const admin = require('./controllers/admin/admin');
const order = require('./controllers/orders')
const app = express();
const path = require('path');
const multer = require('multer');
connectDB();

const corsOptions = {

  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  // allowedHeaders: ['Content-Type', 'Authorization'],
 
  maxAge: 86400 // 24 hours
};

// ImgBB API key (replace with your actual API key)
const IMGBB_API_KEY = '338c0d8da9a3175d9b6e43e47959c3dc';
const IMGBB_UPLOAD_URL = 'https://api.imgbb.com/1/upload';

const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

// Enable Cross-Origin Resource Sharing (CORS)
app.use(cors());

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      imgSrc: ["'self'", 'data:', 'blob:', '*'], // Allow images from any source
      scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      fontSrc: ["'self'", 'data:', 'https:'],
      connectSrc: ["'self'", 'https://*'],
      frameSrc: ["'none'"],
      objectSrc: ["'none'"]
    }
  },
  crossOriginEmbedderPolicy: false,
  crossOriginResourcePolicy: false,
  crossOriginOpenerPolicy: false
}));

// Set custom headers for enhanced security
app.use((req, res, next) => {
  // Set stricter security headers
  res.set({
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'X-XSS-Protection': '1; mode=block',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
    'Strict-Transport-Security': 'max-age=31536000; includeSubDomains'
  });
  next();
});

// Middleware for parsing JSON bodies
app.use(express.json());


// Image upload route
app.post('/uploads', upload.single('image'), async (req, res) => {
  if (!req.file) {
    return res.status(400).send('No image uploaded');
  }

  try {
    // Create FormData for ImgBB API
    const formData = new FormData();
    formData.append('image', req.file.buffer.toString('base64'));

    // Make a request to ImgBB API
    const response = await axios.post(IMGBB_UPLOAD_URL, formData, {
      params: { key: IMGBB_API_KEY },
      headers: {
        ...formData.getHeaders(),
      },
    });

    // Check if the image upload was successful
    if (response.data.success) {
      const imageUrl = response.data.data.url;
      return res.status(200).send({
        message: 'Image uploaded successfully!',
        imageUrl,
      });
    } else {
      return res.status(500).send('Error uploading image');
    }
  } catch (error) {
    console.error(error);
    return res.status(500).send('An error occurred');
  }
});

// app.use('/uploads',  express.static(path.join('/tmp', 'uploads'), {
//   setHeaders: (res, path, stat) => {
//     // Allow cross-origin access to files
//     res.set('Access-Control-Allow-Origin', '*');
//     res.set('Access-Control-Allow-Methods', 'GET, OPTIONS');
//     res.set('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
    
//     // Set caching headers
//     res.set('Cache-Control', 'public, max-age=3600'); // Cache for 1 hour
    
//     // Set content type header based on file extension
//     if (path.endsWith('.png')) {
//       res.set('Content-Type', 'image/png');
//     } else if (path.endsWith('.jpg') || path.endsWith('.jpeg')) {
//       res.set('Content-Type', 'image/jpeg');
//     }
//   }
// }));
// Middleware for parsing application/x-www-form-urlencoded bodies
app.use(express.urlencoded({ extended: false }));

// Route for handling API requests
app.use('/api', youtubeChannelRoutes);
app.use('/api', payment);
app.use('/api', admin);
app.use('/api', order);

// Start the server
const PORT = process.env.PORT || 8090;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
