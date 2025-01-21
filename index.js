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
connectDB();

const corsOptions = {
  origin: true, // Add your frontend URLs
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  // allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
  maxAge: 86400 // 24 hours
};
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

app.use('/uploads', express.static(path.join(__dirname, 'uploads'), {
  setHeaders: (res, path, stat) => {
    // Allow cross-origin access to files
    res.set('Access-Control-Allow-Origin', '*');
    res.set('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.set('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
    
    // Set caching headers
    res.set('Cache-Control', 'public, max-age=3600'); // Cache for 1 hour
    
    // Set content type header based on file extension
    if (path.endsWith('.png')) {
      res.set('Content-Type', 'image/png');
    } else if (path.endsWith('.jpg') || path.endsWith('.jpeg')) {
      res.set('Content-Type', 'image/jpeg');
    }
  }
}));
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
