const Blog = require('../models/blog');
const mongoose = require('mongoose');
const { uploadToR2, deleteFromR2 } = require('../config/r2');

// Helper to check if a string is a valid MongoDB ObjectId
function isObjectId(str) {
  return mongoose.Types.ObjectId.isValid(str) && str.length === 24;
}

exports.createBlog = async (req, res) => {
  try {
    const { title, excerpt, content, imageUrl, ogImage, author, authorAvatar, published, featured,
      tags, category, readTime, metaTitle, metaDescription, focusKeyword, canonicalUrl, noIndex, faq } = req.body;
    const createdBy = req.user?.userId;
    const blog = await Blog.create({
      title, excerpt, content, imageUrl, ogImage, author, authorAvatar, published, featured,
      tags: Array.isArray(tags) ? tags : (tags ? tags.split(',').map(t => t.trim()) : []),
      category, readTime, metaTitle, metaDescription, focusKeyword, canonicalUrl, noIndex, createdBy, faq
    });
    res.status(201).json({ success: true, blog });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

exports.updateBlog = async (req, res) => {
  try {
    const updateData = { ...req.body };
    // Handle tags as array or comma-separated string
    if (updateData.tags && !Array.isArray(updateData.tags)) {
      updateData.tags = updateData.tags.split(',').map(t => t.trim());
    }
    // Regenerate slug if title changed
    if (updateData.title && updateData.title !== '') {
      delete updateData.slug; // let the pre-save hook regenerate it
    }
    const blog = await Blog.findByIdAndUpdate(req.params.id, updateData, { new: true, runValidators: true });
    if (!blog) return res.status(404).json({ success: false, message: 'Blog not found' });
    res.json({ success: true, blog });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

exports.deleteBlog = async (req, res) => {
  try {
    const blog = await Blog.findByIdAndDelete(req.params.id);
    if (!blog) return res.status(404).json({ success: false, message: 'Blog not found' });
    res.json({ success: true, message: 'Blog deleted successfully' });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

// Public: only published blogs
exports.getBlogs = async (req, res) => {
  try {
    const { page = 1, limit = 20, category, tag, search } = req.query;
    const query = { published: true };
    if (category) query.category = category;
    if (tag) query.tags = tag;
    if (search) query.$text = { $search: search };

    const total = await Blog.countDocuments(query);
    const blogs = await Blog.find(query)
      .select('title slug excerpt imageUrl author category tags readTime featured createdAt updatedAt')
      .sort({ featured: -1, createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(Number(limit));

    res.json({ success: true, blogs, total, page: Number(page), totalPages: Math.ceil(total / limit) });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// Admin: all blogs
exports.getAllBlogs = async (req, res) => {
  try {
    const blogs = await Blog.find({}).sort({ createdAt: -1 });
    res.json({ success: true, blogs });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// Get single blog by slug OR id — supports both
exports.getBlog = async (req, res) => {
  try {
    const { id } = req.params;
    let blog;
    if (isObjectId(id)) {
      blog = await Blog.findById(id);
    } else {
      blog = await Blog.findOne({ slug: id });
    }
    if (!blog) return res.status(404).json({ success: false, message: 'Blog not found' });
    // Increment view count
    Blog.findByIdAndUpdate(blog._id, { $inc: { viewCount: 1 } }).exec();
    res.json({ success: true, blog });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

// Increment view count
exports.incrementBlogViews = async (req, res) => {
  try {
    await Blog.findByIdAndUpdate(req.params.id, { $inc: { viewCount: 1 } });
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

// Admin: Upload blog image
exports.uploadBlogImage = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'No image uploaded' });
    }
    const imageUrl = await uploadToR2(req.file.buffer, req.file.originalname, req.file.mimetype);
    res.status(200).json({ success: true, url: imageUrl });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// Admin: Delete blog image
exports.deleteBlogImage = async (req, res) => {
  try {
    const { imageUrl } = req.body;
    if (!imageUrl) {
      return res.status(400).json({ success: false, message: 'Image URL is required' });
    }
    await deleteFromR2(imageUrl);
    res.status(200).json({ success: true, message: 'Image deleted successfully' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};
