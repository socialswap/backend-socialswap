const express = require('express');
const router = express.Router();
const multer = require('multer');
const {
  getAllBanners,
  getAllBannersAdmin,
  createBanner,
  updateBanner,
  deleteBanner,
  toggleBannerStatus
} = require('../controllers/bannerController');
const auth = require('../middleware/auth');

// Configure multer for memory storage
const storage = multer.memoryStorage();
const upload = multer({
  storage: storage,
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB limit
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'), false);
    }
  }
});

// Public routes
router.get('/banners', getAllBanners);

// Admin routes
router.get('/admin/banners', auth, getAllBannersAdmin);
router.post(
  '/admin/banners',
  auth,
  upload.fields([
    { name: 'desktopImage', maxCount: 1 },
    { name: 'mobileImage', maxCount: 1 }
  ]),
  createBanner
);
router.put(
  '/admin/banners/:id',
  auth,
  upload.fields([
    { name: 'desktopImage', maxCount: 1 },
    { name: 'mobileImage', maxCount: 1 }
  ]),
  updateBanner
);
router.delete('/admin/banners/:id', auth, deleteBanner);
router.patch('/admin/banners/:id/toggle', auth, toggleBannerStatus);

module.exports = router;

