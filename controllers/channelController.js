const YouTubeChannel = require('../models/channel');
const mongoose = require('mongoose');
const multer = require('multer');
const path = require('path');
const { uploadToR2, deleteFromR2 } = require('../config/r2');


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
    req.query = { ...req.query, ...req.body };
    const query = { status: { $in: ['Available', 'approved'] } };

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
    // Always exclude sold channels
    query.sold = { $ne: true };

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

    // Handle boolean and specific monetization filters
    if (req.query.monetized !== undefined) {
      query.monetized = req.query.monetized === 'true';
    }
    if (req.query.mostDemanding !== undefined) {
      if (req.query.mostDemanding === 'true') {
        query.mostDemanding = true;
      } else {
        query.mostDemanding = { $ne: true };
      }
    }
    if (req.query.monetization) {
      if (req.query.monetization === 'monetized') {
        query.monetized = true;
      } else if (req.query.monetization === 'non-monetized') {
        query.monetized = false;
      }
    }

    if (req.query.maxPrice || req.query.minPrice) {
      const min = req.query.minPrice ? parseInt(req.query.minPrice) : 0;
      const max = req.query.maxPrice ? parseInt(req.query.maxPrice) : Number.MAX_SAFE_INTEGER;
      
      // We use $expr and $toDouble because price is stored as a String in the schema
      query.$expr = { 
        $and: [ 
          { $gte: [{ $toDouble: "$price" }, min] },
          { $lte: [{ $toDouble: "$price" }, max] }
        ]
      };
    }


    if (req.query.copyrightStrike !== undefined) {
      query.copyrightStrike = req.query.copyrightStrike;
    }

    if (req.query.createdBy) {
      query.createdBy = req.query.createdBy;
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

// Get a single channel by MongoDB _id
exports.getChannel = async (req, res) => {
  try {
    const channel = await YouTubeChannel.findById(req.params.id).populate('createdBy', 'name email avatar username');
    if (channel == null) {
      return res.status(404).json({ message: 'Channel not found' });
    }
    res.json(channel);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// Get a single channel by customUrl username (slug) — also falls back to _id for old links
exports.getChannelByUsername = async (req, res) => {
  try {
    const { username } = req.params;
    // Try customUrl first (exact match), then fallback to _id
    let channel = await YouTubeChannel.findOne({ customUrl: username }).populate('createdBy', 'name email avatar username');
    if (!channel && username.match(/^[0-9a-fA-F]{24}$/)) {
      channel = await YouTubeChannel.findById(username).populate('createdBy', 'name email avatar username');
    }
    if (!channel) {
      return res.status(404).json({ message: 'Channel not found' });
    }
    res.json(channel);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};


exports.demandingChannel = async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 20;
    const updatedChannel = await YouTubeChannel.find({
      mostDemanding: true,
      status: { $ne: 'sold' } // Exclude sold channels
    })
      .sort({ createdAt: -1 })
      .limit(limit);

    res.json(updatedChannel);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching demanding channels', error: error.message });
  }
};

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
    const stringFields = ['name', 'customUrl', 'description', 'category', 'channelType', 'country', 'copyrightStrike', 'communityStrike', 'my_language', 'logoUrl', 'bannerUrl', 'avatar'];
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

exports.updateChannel = async (req, res) => {
  try {
    // First find the existing channel
    const existingChannel = await YouTubeChannel.findById(req.params.id);
    if (!existingChannel) {
      return res.status(404).json({ message: 'Channel not found' });
    }

    if (existingChannel.createdBy.toString() !== req.user.userId && req.user.role !== 'admin') {
      return res.status(403).json({ message: 'You are not authorized to update this channel' });
    }

    // Process banner upload
    let bannerUrl = existingChannel.bannerUrl;
    if (req.files && req.files.banner && req.files.banner[0]) {
      // Delete old banner if it exists
      if (existingChannel.bannerUrl) {
        await deleteFromR2(existingChannel.bannerUrl);
      }
      bannerUrl = await uploadToR2(req.files.banner[0].buffer, req.files.banner[0].originalname, req.files.banner[0].mimetype);
    }

    // Process screenshots upload/deletion
    let newImageUrls = [...existingChannel.imageUrls];
    if (req.body.existingImages !== undefined) {
      let keptImages = [];
      if (req.body.existingImages) {
        try {
          keptImages = typeof req.body.existingImages === 'string'
            ? JSON.parse(req.body.existingImages)
            : req.body.existingImages;
          if (!Array.isArray(keptImages)) keptImages = [keptImages];
        } catch (e) {
          keptImages = Array.isArray(req.body.existingImages)
            ? req.body.existingImages
            : [req.body.existingImages];
        }
      }

      // Delete images from R2 that were removed by user
      const imagesToDelete = existingChannel.imageUrls.filter(url => !keptImages.includes(url));
      if (imagesToDelete.length > 0) {
        await Promise.all(imagesToDelete.map(url => deleteFromR2(url)));
      }

      newImageUrls = keptImages;
    }

    // Upload new screenshots if any
    if (req.files && req.files.images && req.files.images.length > 0) {
      const uploadedUrls = await Promise.all(
        req.files.images.map(file => uploadToR2(file.buffer, file.originalname, file.mimetype))
      );
      newImageUrls = [...newImageUrls, ...uploadedUrls];
    }

    // Upload new dashboardImage if provided
    let dashboardImage = existingChannel.dashboardImage;
    if (req.files && req.files.dashboardImage && req.files.dashboardImage[0]) {
      if (existingChannel.dashboardImage) {
        await deleteFromR2(existingChannel.dashboardImage).catch(console.error);
      }
      dashboardImage = await uploadToR2(
        req.files.dashboardImage[0].buffer,
        req.files.dashboardImage[0].originalname,
        req.files.dashboardImage[0].mimetype
      );
    }

    // Validate screenshot counts
    if (newImageUrls.length < 2) {
      return res.status(400).json({ message: 'At least 2 channel screenshots are required' });
    }
    if (newImageUrls.length > 10) {
      return res.status(400).json({ message: 'Maximum 10 channel screenshots are allowed' });
    }

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
      sold: req.body.sold,
      logoUrl: req.body.logoUrl !== undefined ? req.body.logoUrl : existingChannel.logoUrl,
      bannerUrl: bannerUrl,
      imageUrls: newImageUrls,
      dashboardImage: dashboardImage,
      avatar: req.body.avatar !== undefined ? req.body.avatar : existingChannel.avatar
    };

    if (req.body.userEmail !== undefined || req.body.contactNumber !== undefined) {
      updateData.contactInfo = {
        email: req.body.userEmail !== undefined ? req.body.userEmail : (existingChannel.contactInfo ? existingChannel.contactInfo.email : ''),
        phone: req.body.contactNumber !== undefined ? req.body.contactNumber : (existingChannel.contactInfo ? existingChannel.contactInfo.phone : '')
      };
    }

    // Remove undefined fields
    Object.keys(updateData).forEach(key => {
      if (updateData[key] === undefined) {
        delete updateData[key];
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
    if (!channel) {
      return res.status(404).json({ message: 'Channel not found' });
    }

    // Verify ownership or admin privileges
    if (channel.createdBy.toString() !== req.user.userId && req.user.role !== 'admin') {
      return res.status(403).json({ message: 'You are not authorized to delete this channel' });
    }

    // Delete files from R2
    if (channel.bannerUrl) {
      await deleteFromR2(channel.bannerUrl);
    }
    if (channel.imageUrls && channel.imageUrls.length > 0) {
      await Promise.all(channel.imageUrls.map(url => deleteFromR2(url)));
    }

    await YouTubeChannel.findByIdAndDelete(req.params.id);
    res.json({ message: 'Channel deleted successfully' });
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

// Get channels by the authenticated user (createdBy or seller fallback)
exports.getChannelsBySeller = async (req, res) => {
  try {
    const { user } = req;
      
    // Ensure user is authenticated
    if (!user || !user.userId) {
      return res.status(401).json({ message: 'User must be authenticated' });
    }

    // Query by createdBy (ObjectId) OR seller (string) for backward compatibility
    const baseQuery = {
      $or: [
        { createdBy: user.userId },
        { seller: user.userId }
      ]
    };

    // Add status filter if provided
    if (req.query.status) {
      baseQuery.status = req.query.status;
    }

    // Pagination
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;

    // Get total count
    const totalCount = await YouTubeChannel.countDocuments(baseQuery);

    // Fetch channels
    const channels = await YouTubeChannel.find(baseQuery)
      .select('-__v')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    const totalPages = Math.ceil(totalCount / limit);

    res.status(200).json({
      success: true,
      data: {
        channels,
        pagination: {
          currentPage: page,
          totalPages,
          totalChannels: totalCount,
          hasNextPage: page < totalPages,
          hasPrevPage: page > 1,
          limit
        }
      }
    });

  } catch (err) {
    console.error('Error fetching user channels:', err);
    res.status(500).json({
      success: false,
      message: 'Error fetching channels',
      error: err.message
    });
  }
};

// Admin: Get all channels for a specific user (regardless of status)
exports.getAdminUserChannels = async (req, res) => {
  try {
    const { userId } = req.params;
    
    const query = {
      $or: [
        { createdBy: userId },
        { seller: userId }
      ]
    };

    const channels = await YouTubeChannel.find(query)
      .select('-__v')
      .sort({ createdAt: -1 })
      .lean();

    res.status(200).json({
      success: true,
      channels
    });

  } catch (err) {
    console.error('Error fetching admin user channels:', err);
    res.status(500).json({
      success: false,
      message: 'Error fetching channels for user',
      error: err.message
    });
  }
};

