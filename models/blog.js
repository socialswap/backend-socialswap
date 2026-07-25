const mongoose = require('mongoose');

// Helper: generate slug from title
function generateSlug(title) {
  return title
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

const blogSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true },
  slug: { type: String, unique: true, lowercase: true, trim: true },
  excerpt: { type: String, required: true, trim: true },
  content: { type: String, required: true },
  imageUrl: { type: String, default: '' },
  ogImage: { type: String, default: '' }, // OG image (falls back to imageUrl)
  author: { type: String, default: 'SocialSwap Team' },
  authorAvatar: { type: String, default: '' },
  published: { type: Boolean, default: true },
  featured: { type: Boolean, default: false },
  tags: [{ type: String, trim: true }],
  category: { type: String, trim: true, default: 'General' },
  readTime: { type: Number, default: 5 }, // estimated read time in minutes
  // SEO fields
  metaTitle: { type: String, trim: true, maxlength: 60 },
  metaDescription: { type: String, trim: true, maxlength: 160 },
  focusKeyword: { type: String, trim: true },
  canonicalUrl: { type: String, trim: true },
  noIndex: { type: Boolean, default: false },
  faq: [{
    question: { type: String, trim: true },
    answer: { type: String, trim: true }
  }],
  // Relations
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  viewCount: { type: Number, default: 0 },
}, { timestamps: true });

// Auto-generate slug before saving
blogSchema.pre('save', async function (next) {
  if (!this.slug || this.isModified('title')) {
    let base = generateSlug(this.title);
    let slug = base;
    let count = 0;
    // Ensure uniqueness
    while (await mongoose.model('Blog').findOne({ slug, _id: { $ne: this._id } })) {
      count++;
      slug = `${base}-${count}`;
    }
    this.slug = slug;
  }
  // Auto-calc readTime from content word count
  if (this.isModified('content') || !this.readTime) {
    const words = this.content ? this.content.split(/\s+/).length : 0;
    this.readTime = Math.max(1, Math.ceil(words / 200));
  }
  next();
});

// Text search index
blogSchema.index({ title: 'text', content: 'text', tags: 'text' });
blogSchema.index({ slug: 1 });
blogSchema.index({ published: 1, createdAt: -1 });

module.exports = mongoose.model('Blog', blogSchema);
