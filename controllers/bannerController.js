const Banner = require('../models/banner');
const axios = require('axios');

const IMGBB_API_KEY = '338c0d8da9a3175d9b6e43e47959c3dc';
const IMGBB_UPLOAD_URL = 'https://api.imgbb.com/1/upload';

// Upload image to ImgBB
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

// Get all banners (public)
exports.getAllBanners = async (req, res) => {
  try {
    const banners = await Banner.find({ isActive: true })
      .sort({ order: 1, createdAt: -1 })
      .select('-__v');
    
    res.status(200).json({
      success: true,
      count: banners.length,
      data: banners
    });
  } catch (error) {
    console.error('Error fetching banners:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch banners'
    });
  }
};

// Get all banners (admin - includes inactive)
exports.getAllBannersAdmin = async (req, res) => {
  // Check if user is admin
  if (req?.user?.role !== "admin") {
    return res.status(401).json({ 
      success: false,
      message: "Unauthorized: Admin access required" 
    });
  }

  try {
    const banners = await Banner.find()
      .sort({ order: 1, createdAt: -1 })
      .select('-__v');
    
    res.status(200).json({
      success: true,
      count: banners.length,
      data: banners
    });
  } catch (error) {
    console.error('Error fetching banners:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch banners'
    });
  }
};

// Create new banner
exports.createBanner = async (req, res) => {
  // Check if user is admin
  if (req?.user?.role !== "admin") {
    return res.status(401).json({ 
      success: false,
      message: "Unauthorized: Admin access required" 
    });
  }

  try {
    const { title, description, buttonText, buttonLink, order } = req.body;
    const files = req.files;

    // Validate required fields
    if (!files || !files.desktopImage || !files.mobileImage) {
      return res.status(400).json({
        success: false,
        message: 'Both desktop and mobile images are required'
      });
    }

    // Upload images to ImgBB
    const desktopImageUrl = await uploadToImgBB(files.desktopImage[0].buffer);
    const mobileImageUrl = await uploadToImgBB(files.mobileImage[0].buffer);

    // Create banner
    const banner = await Banner.create({
      title,
      description: description || '',
      buttonText: buttonText || 'Shop Now',
      buttonLink: buttonLink || '/channels',
      desktopImageUrl,
      mobileImageUrl,
      order: order || 0,
      isActive: true
    });

    res.status(201).json({
      success: true,
      message: 'Banner created successfully',
      data: banner
    });
  } catch (error) {
    console.error('Error creating banner:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to create banner'
    });
  }
};

// Update banner
exports.updateBanner = async (req, res) => {
  // Check if user is admin
  if (req?.user?.role !== "admin") {
    return res.status(401).json({ 
      success: false,
      message: "Unauthorized: Admin access required" 
    });
  }

  try {
    const { id } = req.params;
    const { title, description, buttonText, buttonLink, order, isActive } = req.body;
    const files = req.files;

    const banner = await Banner.findById(id);
    if (!banner) {
      return res.status(404).json({
        success: false,
        message: 'Banner not found'
      });
    }

    // Update fields
    if (title) banner.title = title;
    if (description !== undefined) banner.description = description;
    if (buttonText) banner.buttonText = buttonText;
    if (buttonLink) banner.buttonLink = buttonLink;
    if (order !== undefined) banner.order = order;
    if (isActive !== undefined) banner.isActive = isActive;

    // Upload new images if provided
    if (files && files.desktopImage) {
      banner.desktopImageUrl = await uploadToImgBB(files.desktopImage[0].buffer);
    }

    if (files && files.mobileImage) {
      banner.mobileImageUrl = await uploadToImgBB(files.mobileImage[0].buffer);
    }

    await banner.save();

    res.status(200).json({
      success: true,
      message: 'Banner updated successfully',
      data: banner
    });
  } catch (error) {
    console.error('Error updating banner:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to update banner'
    });
  }
};

// Delete banner
exports.deleteBanner = async (req, res) => {
  // Check if user is admin
  if (req?.user?.role !== "admin") {
    return res.status(401).json({ 
      success: false,
      message: "Unauthorized: Admin access required" 
    });
  }

  try {
    const { id } = req.params;

    const banner = await Banner.findByIdAndDelete(id);
    if (!banner) {
      return res.status(404).json({
        success: false,
        message: 'Banner not found'
      });
    }

    res.status(200).json({
      success: true,
      message: 'Banner deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting banner:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete banner'
    });
  }
};

// Toggle banner active status
exports.toggleBannerStatus = async (req, res) => {
  // Check if user is admin
  if (req?.user?.role !== "admin") {
    return res.status(401).json({ 
      success: false,
      message: "Unauthorized: Admin access required" 
    });
  }

  try {
    const { id } = req.params;

    const banner = await Banner.findById(id);
    if (!banner) {
      return res.status(404).json({
        success: false,
        message: 'Banner not found'
      });
    }

    banner.isActive = !banner.isActive;
    await banner.save();

    res.status(200).json({
      success: true,
      message: `Banner ${banner.isActive ? 'activated' : 'deactivated'} successfully`,
      data: banner
    });
  } catch (error) {
    console.error('Error toggling banner status:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to toggle banner status'
    });
  }
};

