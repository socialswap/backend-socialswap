const express = require('express');
const {
  getChannels,
  getChannel,
  updateChannel,
  deleteChannel,
  getChannelsByStatus,
  searchChannels,
  getChannelsBySeller,
  demandingChannel
} = require('../controllers/channelController');
const router = express.Router();
const auth = require('../middleware/auth');
const { signup } = require('../controllers/signup');
const { login } = require('../controllers/login');
const { getCart, addToCart, removeFromCart, updateCartItem, clearCart } = require('../controllers/cart');
const {getUserProfile,updateUserProfile, updateUserRole, deleteUser, getUser, getAllUsers, changePassword} = require('../controllers/profile')
const multer = require('multer');
const { upload, createChannel } = require('../middleware/multer');


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
// Get all channels
router.get('/channels/demanding',demandingChannel)
router.get('/channels', getChannels);
router.get('/channels/:id', getChannel);
router.post('/auth/signup',signup);
router.post('/auth/login', login);

// Create a new channel
router.post('/channels', uploadFields,validateImageCount, auth, createChannel);
router.get('/my-channels', auth,getChannelsBySeller);

// Update a channel
router.put('/channels/:id',processFormData, auth, updateChannel);

// Delete a channel
router.delete('/channels/:id', deleteChannel);

// Get channels by status
router.get('/channels/status/:status', getChannelsByStatus);

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

router.get('/users', getAllUsers);
router.get('/users/:userId', getUser);
router.put('/users/:userId/role', updateUserRole);
router.delete('/users/:userId', deleteUser);

module.exports = router;