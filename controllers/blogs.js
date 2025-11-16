const Blog = require('../models/blog');

exports.createBlog = async (req, res) => {
  try {
    const { title, excerpt, content, imageUrl, author, published } = req.body;
    const createdBy = req.user?.userId;
    const blog = await Blog.create({ title, excerpt, content, imageUrl, author, published, createdBy });
    res.status(201).json({ success: true, blog });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

exports.updateBlog = async (req, res) => {
  try {
    const blog = await Blog.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
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
    res.json({ success: true, message: 'Deleted' });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

exports.getBlogs = async (req, res) => {
  try {
    const blogs = await Blog.find({ published: true }).sort({ createdAt: -1 });
    res.json({ success: true, blogs });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.getAllBlogs = async (req, res) => {
  try {
    const blogs = await Blog.find({}).sort({ createdAt: -1 });
    res.json({ success: true, blogs });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.getBlog = async (req, res) => {
  try {
    const blog = await Blog.findById(req.params.id);
    if (!blog) return res.status(404).json({ success: false, message: 'Blog not found' });
    res.json({ success: true, blog });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};


