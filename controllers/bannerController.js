const Banner = require('../models/banner');
const { uploadToR2, deleteFromR2 } = require('../config/r2');

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

    // Upload images to R2
    const desktopImageUrl = await uploadToR2(files.desktopImage[0].buffer, files.desktopImage[0].originalname, files.desktopImage[0].mimetype);
    const mobileImageUrl = await uploadToR2(files.mobileImage[0].buffer, files.mobileImage[0].originalname, files.mobileImage[0].mimetype);

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
    if (files) {
      if (files.desktopImage && files.desktopImage[0]) {
        if (banner.desktopImageUrl) {
          await deleteFromR2(banner.desktopImageUrl);
        }
        banner.desktopImageUrl = await uploadToR2(files.desktopImage[0].buffer, files.desktopImage[0].originalname, files.desktopImage[0].mimetype);
      }
      if (files.mobileImage && files.mobileImage[0]) {
        if (banner.mobileImageUrl) {
          await deleteFromR2(banner.mobileImageUrl);
        }
        banner.mobileImageUrl = await uploadToR2(files.mobileImage[0].buffer, files.mobileImage[0].originalname, files.mobileImage[0].mimetype);
      }
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

    const banner = await Banner.findById(id);
    if (!banner) {
      return res.status(404).json({
        success: false,
        message: 'Banner not found'
      });
    }

    // Delete files from R2
    if (banner.desktopImageUrl) {
      await deleteFromR2(banner.desktopImageUrl);
    }
    if (banner.mobileImageUrl) {
      await deleteFromR2(banner.mobileImageUrl);
    }

    await Banner.findByIdAndDelete(id);

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

