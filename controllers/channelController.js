const YouTubeChannel = require('../models/channel');
const mongoose = require('mongoose');
const multer = require('multer');
const path = require('path');

// ImgBB API key (replace with your actual API key)
const IMGBB_API_KEY = '338c0d8da9a3175d9b6e43e47959c3dc';
const IMGBB_UPLOAD_URL = 'https://api.imgbb.com/1/upload';


// Place an order
exports.placeOrder = async (req, res) => {
  try {
    const { channelId, buyerEmail, soldPrice } = req.body;

    // Ensure the user is authenticated
    const { user } = req;
    if (!user || !user.userId) {
      return res.status(401).json({ message: 'User must be authenticated' });
    }

    // Validate the channel exists
    const channel = await YouTubeChannel.findById(channelId);
    if (!channel) {
      return res.status(404).json({ message: 'Channel not found' });
    }

    // Create a new order
    const newOrder = new Order({
      channelId,
      buyerEmail,
      soldPrice,
      status: 'Pending' // Default status
    });

    // Save the order
    const savedOrder = await newOrder.save();

    // Update the channel status to 'sold'
    channel.status = 'sold';
    await channel.save();

    res.status(201).json({
      message: 'Order placed successfully',
      order: savedOrder,
      channel: channel // Optionally return the updated channel data
    });
  } catch (error) {
    console.error('Error placing order:', error);
    res.status(500).json({ message: 'Internal server error', error: error.message });
  }
};

exports.getChannels = async (req, res) => {
  try {
    const query = { status: 'approved' };

    // Helper function to parse array filters
    const parseArray = (str) => {
      try {
        const parsed = JSON.parse(str);
        return Array.isArray(parsed) && parsed.length > 0 ? parsed : null;
      } catch (error) {
        return null;
      }
    };

    // Helper function to parse range values
    const parseRange = (rangeStr) => {
      try {
        const ranges = JSON.parse(rangeStr);
        if (!Array.isArray(ranges) || ranges.length === 0) return null;

        const validRanges = ranges.filter(range => Array.isArray(range) && range.length === 2);
        if (validRanges.length === 0) return null;

        return {
          $gte: Math.min(...validRanges.map(range => range[0])),
          $lte: Math.max(...validRanges.map(range => range[1]))
        };
      } catch (error) {
        return null;
      }
    };

    // Handle text search if provided
    if (req.query.channelName) {
      query.$text = { $search: req.query.channelName };
    }

    // Category filter
    const categories = parseArray(req.query.category);
    if (categories) {
      query.category = { $in: categories };
    }

    // Handle numeric range filters
    const rangeFields = {
      subscriberCount: req.query.subscriberRange,
      viewCount: req.query.viewCountRange,
      videoCount: req.query.videoCountRange,
      estimatedEarnings: req.query.earningsRange,
      averageViewsPerVideo: req.query.averageViewsRange,
      recentViews: req.query.recentViewsRange,
      watchTimeHours: req.query.watchTimeRange
    };

    for (const [field, value] of Object.entries(rangeFields)) {
      const range = parseRange(value);
      if (range) {
        query[field] = range;
      }
    }

    // Handle date range
    if (req.query.joinedDateRange) {
      const dateRange = parseArray(req.query.joinedDateRange);
      if (dateRange && dateRange[0] && dateRange[1]) {
        query.joinedDate = {
          $gte: new Date(dateRange[0]),
          $lte: new Date(dateRange[1])
        };
      }
    }

    // Country filter
    const countries = parseArray(req.query.country);
    if (countries) {
      query.country = { $in: countries };
    }

    // Language filter
    const languages = parseArray(req.query.my_language);
    if (languages) {
      query.my_language = { $in: languages };
    }

    // Channel type filter
    const channelTypes = parseArray(req.query.channelType);
    if (channelTypes) {
      query.channelType = { $in: channelTypes };
    }

    // Handle boolean filters
    if (req.query.monetized !== undefined) {
      query.monetized = req.query.monetized === 'true';
    }

    if (req.query.copyrightStrike !== undefined) {
      query.copyrightStrike = req.query.copyrightStrike;
    }

    // Sorting
    const sortOption = {};
    if (req.query.sort) {
      const [field, order] = req.query.sort.split(',');
      sortOption[field] = order === 'desc' ? -1 : 1;
    } else {
      sortOption.createdAt = -1; // Default sort
    }

    // Pagination
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, parseInt(req.query.limit) || 20);
    const skip = (page - 1) * limit;

    // Execute query
    const [channels, total] = await Promise.all([
      YouTubeChannel.find(query)
        .sort(sortOption)
        .skip(skip)
        .limit(limit)
        .lean(),
      YouTubeChannel.countDocuments(query)
    ]);

    console.log('Applied Query:', JSON.stringify(query, null, 2));

    res.json({
      success: true,
      channels,
      currentPage: page,
      totalPages: Math.ceil(total / limit),
      totalChannels: total,
      filters: query // For debugging
    });

  } catch (error) {
    console.error('Error in getChannels:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching channels',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// Get a single channel
exports.getChannel = async (req, res) => {
  try {
    const channel = await YouTubeChannel.findById(req.params.id);
    if (channel == null) {
      return res.status(404).json({ message: 'Channel not found' });
    }
    res.json(channel);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.demandingChannel= async (req, res) => {
  try {
    const updatedChannel = await YouTubeChannel.find({mostDemanding:true,      status: { $ne: 'sold' } // Exclude sold channels
    });

    res.json(updatedChannel);
  } catch (error) {
    res.status(500).json({ message: 'Error updating channel', error: error.message });
  }
}

const validateAndConvertLanguage = (language) => {
  if (!language) {
    throw new Error('Language is required');
  }
  
  const normalizedLanguage = language.toLowerCase().trim();
  
  // If it's already a valid ISO 639-1 code, return it
  if (/^[a-z]{2}$/.test(normalizedLanguage)) {
    return normalizedLanguage;
  }
  
  // Look up the ISO code for the language name
  const isoCode = ISO6391[normalizedLanguage];
  if (!isoCode) {
    throw new Error(`Unsupported language: ${language}. Please use a valid ISO 639-1 language code or supported language name.`);
  }
  
  return isoCode;
};

exports.createChannel = async (req, res) => {
  
  try {
    const { body, user } = req;
    let filePath = null;

    // Handle file upload if present
    if (req.file) {
      // Save relative path to database
      filePath = path.join('uploads', req.file.filename);
      
      // Verify file was saved
      try {
        await fs.access(filePath);
      } catch (error) {
        throw new Error('File upload failed');
      }
    }

    // Convert string to boolean for monetized field
    const monetized = body.monetized === 'true';

    // Convert string numbers to actual numbers
    const numericFields = ['subscriberCount', 'price', 'viewCount', 'videoCount', 'estimatedEarnings', 'averageViewsPerVideo', 'recentViews', 'watchTimeHours'];
    const channelData = {};
    numericFields.forEach(field => {
      if (body[field]) {
        channelData[field] = Number(body[field]);
        if (isNaN(channelData[field])) {
          throw new Error(`Invalid number format for ${field}`);
        }
      }
    });

    // Validate and parse the date
    if (body.joinedDate) {
      const joinedDate = new Date(body.joinedDate);
      if (isNaN(joinedDate.getTime())) {
        throw new Error('Invalid date format for joinedDate');
      }
      channelData.joinedDate = joinedDate;
    }

    // Assign string fields
    const stringFields = ['name', 'customUrl', 'description', 'category', 'channelType', 'country', 'copyrightStrike', 'communityStrike', 'my_language'];
    stringFields.forEach(field => {
      if (body[field]) {
        channelData[field] = body[field];
      }
    });

    // Handle language field
    if (body.my_language) {
      try {
        channelData.my_language = body.my_language
      } catch (error) {
        throw new Error(error.message);
      }
    }

    // Add file path to channel data if file was uploaded
    if (filePath) {
      channelData.file = filePath;
    }

    // Set seller and status fields
    channelData.seller = user.userId;
    channelData.status = 'unsold';
    channelData.monetized = monetized;

    // Check for missing required fields
    const requiredFields = ['name', 'price', 'customUrl', 'description', 'subscriberCount', 'viewCount', 'videoCount', 'estimatedEarnings', 'category', 'channelType', 'joinedDate', 'country', 'averageViewsPerVideo', 'my_language', 'recentViews', 'copyrightStrike', 'communityStrike', 'watchTimeHours'];
    const missingFields = requiredFields.filter(field => !channelData[field] && channelData[field] !== 0);

    if (missingFields.length > 0) {
      // If file was uploaded, delete it since we're not creating the channel
      if (filePath) {
        await fs.unlink(filePath).catch(console.error);
      }
      return res.status(400).json({ message: 'Missing required fields', missingFields });
    }

    const channel = new YouTubeChannel(channelData);
    const newChannel = await channel.save();
    res.status(201).json(newChannel);
  } catch (err) {
    // If file was uploaded and an error occurred, clean it up
    if (req.file) {
      const filePath = path.join('uploads', req.file.filename);
      await fs.unlink(filePath).catch(console.error);
    }
    console.error('Error creating channel:', err);
    res.status(400).json({ message: err.message || 'An error occurred while creating the channel' });
  }
};

// Update a channel
// Backend: Updated channel controller

exports.updateChannel = async (req, res) => {
  try {
    // First find the existing channel
    const existingChannel = await YouTubeChannel.findById(req.params.id);
    if (!existingChannel) {
      return res.status(404).json({ message: 'Channel not found' });
    }

    console.log(req);
    
    // Create update data using only the fields that are being updated
    const updateData = {
      name: req.body.name,
      price: req.body.price,
      customUrl: req.body.customUrl,
      category: req.body.category,
      description: req.body.description,
      subscriberCount: req.body.subscriberCount,
      viewCount: req.body.viewCount,
      videoCount: req.body.videoCount,
      estimatedEarnings: req.body.estimatedEarnings,
      channelType: req.body.channelType,
      country: req.body.country,
      my_language: req.body.my_language,
      averageViewsPerVideo: req.body.averageViewsPerVideo,
      recentViews: req.body.recentViews,
      watchTimeHours: req.body.watchTimeHours,
      copyrightStrike: req.body.copyrightStrike,
      communityStrike: req.body.communityStrike,
      monetized: req.body.monetized,
      organicGrowth: req.body.organicGrowth,
      joinedDate: req.body.joinedDate,
      seller: req.body.seller,
      status: req.body.status,
      // Preserve existing image-related fields
      bannerUrl: existingChannel.bannerUrl,
      imageUrls: existingChannel.imageUrls,
      avatar: existingChannel.avatar
    };

    // Remove undefined fields while keeping existing image fields
    Object.keys(updateData).forEach(key => {
      if (updateData[key] === undefined) {
        // If it's an image-related field, keep the existing value
        if (key === 'bannerUrl' || key === 'imageUrls' || key === 'avatar') {
          updateData[key] = existingChannel[key];
        } else {
          // For non-image fields, remove if undefined
          delete updateData[key];
        }
      }
    });

    // Update the channel with the cleaned data
    const updatedChannel = await YouTubeChannel.findByIdAndUpdate(
      req.params.id,
      updateData,
      { 
        new: true,
        runValidators: true
      }
    );

    res.json(updatedChannel);
  } catch (err) {
    console.error('Update channel error:', err);
    if (err.name === 'ValidationError') {
      return res.status(400).json({ 
        message: 'Validation Error', 
        details: Object.values(err.errors).map(e => e.message)
      });
    }
    res.status(500).json({ message: 'Internal server error' });
  }
};
// Delete a channel
exports.deleteChannel = async (req, res) => {
  try {
    const channel = await YouTubeChannel.findById(req.params.id);
    if (channel == null) {
      return res.status(404).json({ message: 'Channel not found' });
    }

    await channel.remove();
    res.json({ message: 'Channel deleted' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// Get channels by status
exports.getChannelsByStatus = async (req, res) => {
  try {
    const channels = await YouTubeChannel.find({ status: req.params.status });
    res.json(channels);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// Search channels
exports.searchChannels = async (req, res) => {
  try {
    const { query } = req.query;
    const channels = await YouTubeChannel.find({
      $or: [
        { name: { $regex: query, $options: 'i' } },
        { customUrl: { $regex: query, $options: 'i' } },
        { category: { $regex: query, $options: 'i' } }
      ]
    });
    res.json(channels);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// Get channels by seller ID
exports.getChannelsBySeller = async (req, res) => {
  try {
    const { user } = req;
      
    // Ensure user is authenticated
    if (!user || !user.userId) {
      return res.status(401).json({ message: 'User must be authenticated' });
    }

    // Optional query parameters for filtering
    const query = { seller: user.userId };
    
    // Add status filter if provided in query params
    if (req.query.status) {
      if (!['sold', 'unsold'].includes(req.query.status)) {
        return res.status(400).json({ message: 'Invalid status value' });
      }
      query.status = req.query.status;
    }

    // Add pagination
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    // Get total count for pagination
    const totalCount = await YouTubeChannel.countDocuments(query);

    // Fetch channels with pagination and sorting
    const channels = await YouTubeChannel.find(query)
      .select('-__v') // Exclude version key
      .sort({ createdAt: -1 }) // Sort by newest first
      .skip(skip)
      .limit(limit)
      .populate('seller', 'name email'); // Populate seller details if needed

    // Calculate pagination info
    const totalPages = Math.ceil(totalCount / limit);
    const hasNextPage = page < totalPages;
    const hasPrevPage = page > 1;

    res.status(200).json({
      success: true,
      data: {
        channels,
        pagination: {
          currentPage: page,
          totalPages,
          totalChannels: totalCount,
          hasNextPage,
          hasPrevPage,
          limit
        }
      }
    });

  } catch (err) {
    console.error('Error fetching seller channels:', err);
    res.status(500).json({
      success: false,
      message: 'Error fetching channels',
      error: err.message
    });
  }
};

