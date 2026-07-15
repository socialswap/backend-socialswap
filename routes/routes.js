const express = require('express');
const {
  getChannels,
  getChannel,
  updateChannel,
  deleteChannel,
  getChannelsByStatus,
  searchChannels,
  getChannelsBySeller,
  demandingChannel,
  getAdminUserChannels
} = require('../controllers/channelController');
const router = express.Router();
const auth = require('../middleware/auth');

// Cache-control middleware for public routes
const cache = (seconds) => (req, res, next) => {
  res.set('Cache-Control', `public, max-age=${seconds}, stale-while-revalidate=${seconds * 2}`);
  next();
};
const { signup } = require('../controllers/signup');
const { login } = require('../controllers/login');
const { googleLogin } = require('../controllers/googleAuth');
const { sendEmailOtp, verifyEmailOtp } = require('../controllers/emailOtpAuth');
const { getCart, addToCart, removeFromCart, updateCartItem, clearCart } = require('../controllers/cart');
const {getUserProfile,updateUserProfile, updateUserRole, deleteUser, getUser, getAllUsers, changePassword, adminUpdateUser} = require('../controllers/profile')
const multer = require('multer');
const { upload, createChannel } = require('../middleware/multer');
const { createBlog, updateBlog, deleteBlog, getBlogs, getAllBlogs, getBlog, incrementBlogViews, uploadBlogImage, deleteBlogImage } = require('../controllers/blogs');
const { getSitemap } = require('../controllers/sitemapController');
const { getChannelInfo } = require('../controllers/youtubeController');
const { getChatThread, getAllThreads, getThreadById, getThreadByUserId, uploadChatImage } = require('../controllers/chatController');
const { createDeal, updateDealStatus, getAllDeals, getUserDeals, updateDealPaymentStatus } = require('../controllers/dealController');

const uploadFields = upload.fields([
  { name: 'banner', maxCount: 1 },
  { name: 'images', maxCount: 4 }
]);

const processFormData = upload.none(); // Use .none() since we're only handling text fields

const validateImageCount = (req, res, next) => {
  if (!req.files?.images || req.files.images.length < 2) {
      return res.status(400).json({
          success: false,
          message: 'Please upload at least 2 images'
      });
  }
  next();
};
router.get('/', (req,res)=> res.status(200).json({message:'success'}));
// Channels — public routes with caching
router.get('/channels/demanding', cache(300), demandingChannel);  // 5 min cache
router.get('/channels', cache(300), getChannels);                  // 5 min cache
router.get('/channels/:id', cache(300), getChannel);               // 5 min cache
router.post('/auth/signup',signup);
router.post('/auth/login', login);
router.post('/auth/google', googleLogin);
router.post('/auth/email/send-otp', sendEmailOtp);
router.post('/auth/email/verify', verifyEmailOtp);

// Create a new channel
router.post('/channels', uploadFields,validateImageCount, auth, createChannel);
router.get('/my-channels', auth,getChannelsBySeller);

// Update a channel
router.put('/channels/:id', uploadFields, auth, updateChannel);

// Delete a channel
router.delete('/channels/:id', auth, deleteChannel);

// Get channels by status
router.get('/channels/status/:status', getChannelsByStatus);

// Admin: Get all channels for a specific user
router.get('/admin/users/:userId/channels', auth, getAdminUserChannels);

// Search channels
router.get('/channels/search', searchChannels);

// Route to get the cart for the authenticated user
router.get('/cart', auth, getCart);

// Route to add an item to the cart
router.post('/cart/add', auth, addToCart);

// Route to remove an item from the cart
router.delete('/cart/remove/:channelId', auth, removeFromCart);

// Route to update the quantity of an item in the cart
router.put('/cart/update/:channelId', auth, updateCartItem);

// Route to clear the entire cart
router.delete('/cart/clear', auth, clearCart);

router.get('/profile', auth, getUserProfile);
router.put('/profile', auth, updateUserProfile);
router.put('/changePassword', auth, changePassword);

router.get('/users', auth, getAllUsers);
router.get('/users/:userId', auth, getUser);
router.put('/users/:userId/role', auth, updateUserRole);
router.put('/users/:userId/admin-update', auth, adminUpdateUser);
router.delete('/users/:userId', auth, deleteUser);

// Sitemap
router.get('/sitemap.xml', getSitemap);

// Blogs — public routes with caching
router.get('/blogs', cache(3600), getBlogs);       // 1 hour cache
router.get('/blogs/:id', cache(1800), getBlog);    // 30 min cache
router.post('/blogs/:id/views', incrementBlogViews);
router.get('/admin/blogs', auth, getAllBlogs);
router.post('/admin/blogs', auth, createBlog);
router.put('/admin/blogs/:id', auth, updateBlog);
router.delete('/admin/blogs/:id', auth, deleteBlog);
router.post('/admin/blogs/upload-image', auth, upload.single('image'), uploadBlogImage);
router.delete('/admin/blogs/delete-image', auth, deleteBlogImage);

// YouTube Channel Info — auto-fill form from YouTube link / ID / handle
// Requires auth so only logged-in users can consume API quota
router.get('/youtube/channel-info', auth, getChannelInfo);

// Chat
router.get('/chat', auth, getChatThread);
router.post('/chat/upload', auth, upload.single('image'), uploadChatImage);
router.get('/admin/chats', auth, getAllThreads);
router.get('/admin/chats/:threadId', auth, getThreadById);
router.get('/admin/chats/user/:userId', auth, getThreadByUserId);

// Deals
router.post('/admin/deals', auth, createDeal);
router.get('/admin/deals', auth, getAllDeals);
router.patch('/admin/deals/:id/payment', auth, updateDealPaymentStatus);
router.patch('/deals/:id/status', auth, updateDealStatus);
router.get('/deals', auth, getUserDeals);

module.exports = router;