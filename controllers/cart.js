// controllers/cartController.js
const Cart = require('../models/cart');
const YouTubeChannel = require('../models/channel'); // This should refer to the model, not the schema

exports.getCart = async (req, res) => {
  try {
    // Find the cart for the user
    let cart = await Cart.findOne({ user: req.user.userId });

    if (!cart) {
      return res.status(200).json({
        channels: [],
        channelCount: 0
      });
    }

    let itemsToRemove = [];
    const channels = await Promise.all(
      cart?.items?.map(async (item) => {
        try {
          const channel = await YouTubeChannel.findById(item.channel);
            console.log(channel);
            
          // If channel not found or status is sold, mark for removal
          if (!channel || channel.status === 'Sold') {
            itemsToRemove.push(item._id);
            return null;
          }
          
          return {
            _id: channel._id,
            name: channel.name,
            avatarUrl: channel.avatarUrl,
            category: channel.category,
            price: channel.soldPrice || channel.price,
            quantity: item.quantity,
            status: channel.status
          };
        } catch (error) {
          console.error(`Error fetching channel for item ${item._id}:`, error);
          return null;
        }
      })
    );

    // If there are items to remove, update the cart
    if (itemsToRemove.length > 0) {
      try {
        await Cart.findOneAndUpdate(
          { user: req.user.userId },
          { 
            $pull: { 
              items: { 
                _id: { $in: itemsToRemove } 
              } 
            } 
          },
          { new: true }
        );

        // Log removed items
        console.log(`Removed ${itemsToRemove.length} sold/invalid items from cart for user ${req.user.userId}`);
      } catch (error) {
        console.error('Error removing sold items from cart:', error);
      }
    }

    // Filter out null channels and remove duplicates
    const validChannels = channels?.filter(channel => channel !== null);
    const uniqueChannels = Array.from(new Set(validChannels?.map(c => c._id)))
      .map(_id => validChannels.find(c => c._id === _id));

    // Respond with the array of unique channels and removal info
    res.json({
      channels: uniqueChannels,
      channelCount: uniqueChannels.length,
      removedCount: itemsToRemove.length,
      message: itemsToRemove.length > 0 ? 
        `${itemsToRemove.length} sold item(s) were automatically removed from your cart` : 
        undefined
    });

  } catch (error) {
    console.error('Error in getCart:', error);
    res.status(500).json({ 
      message: 'Error fetching cart', 
      error: error.message 
    });
  }
};
exports.addToCart = async (req, res) => {
  try {
    const { channelId, quantity } = req.body;
    const channel = await YouTubeChannel.findById(channelId); // Use YouTubeChannel (the model)

    if (!channel) {
      return res.status(404).json({ message: 'Channel not found' });
    }

    let cart = await Cart.findOne({ user: req.user.userId });

    if (!cart) {
      cart = new Cart({ user: req.user.userId, items: [] });
    }

    const existingItemIndex = cart.items.findIndex(item => item.channel.toString() === channelId);

    if (existingItemIndex > -1) {
      cart.items[existingItemIndex].quantity += quantity;
    } else {
      cart.items.push({ channel: channelId, quantity });
    }

    await cart.save();
    res.json(cart);
  } catch (error) {
    res.status(500).json({ message: 'Error adding to cart', error: error.message });
  }
};

exports.removeFromCart = async (req, res) => {
  try {
    const { channelId } = req.params;
    
    let cart = await Cart.findOne({ user: req.user.userId });

    if (!cart) {
      return res.status(404).json({ message: 'Cart not found' });
    }

    cart.items = cart.items.filter(item => item.channel.toString() !== channelId);

    await cart.save();
    res.json(cart);
  } catch (error) {
    res.status(500).json({ message: 'Error removing from cart', error: error.message });
  }
};

exports.updateCartItem = async (req, res) => {
  try {
    const { channelId } = req.params;
    const { quantity } = req.body;

    let cart = await Cart.findOne({ user: req.user.userId });

    if (!cart) {
      return res.status(404).json({ message: 'Cart not found' });
    }

    const itemIndex = cart.items.findIndex(item => item.channel.toString() === channelId);

    if (itemIndex === -1) {
      return res.status(404).json({ message: 'Item not found in cart' });
    }

    if (quantity <= 0) {
      cart.items.splice(itemIndex, 1);
    } else {
      cart.items[itemIndex].quantity = quantity;
    }

    await cart.save();
    res.json(cart);
  } catch (error) {
    res.status(500).json({ message: 'Error updating cart item', error: error.message });
  }
};

exports.clearCart = async (req, res) => {
  try {
    let cart = await Cart.findOne({ user: req.user.userId });

    if (!cart) {
      return res.status(404).json({ message: 'Cart not found' });
    }

    cart.items = [];
    await cart.save();
    res.json({ message: 'Cart cleared successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Error clearing cart', error: error.message });
  }
};
