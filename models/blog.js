const mongoose = require('mongoose');

const blogSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true },
  excerpt: { type: String, required: true, trim: true },
  content: { type: String, required: true },
  imageUrl: { type: String, default: '' },
  author: { type: String, default: 'Admin' },
  published: { type: Boolean, default: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true });

module.exports = mongoose.model('Blog', blogSchema);

