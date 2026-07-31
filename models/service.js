const mongoose = require('mongoose');

const faqSchema = new mongoose.Schema({
  question: { type: String, required: true, trim: true },
  answer:   { type: String, required: true, trim: true }
}, { _id: true });

const serviceSchema = new mongoose.Schema({
  serviceName: { type: String, required: true, trim: true },
  slug:        { type: String, required: true, unique: true, trim: true, lowercase: true },
  category:    { type: String, required: true, trim: true },
  price:       { type: Number, required: true, min: 0 },
  description: { type: String, required: true, trim: true },
  faq:         { type: [faqSchema], default: [] },
  images:      { type: [String], default: [] },
  isActive:    { type: Boolean, default: true },
  sortOrder:   { type: Number, default: 0 },
}, {
  timestamps: true
});

// Indexes for fast queries
serviceSchema.index({ slug: 1 }, { unique: true });
serviceSchema.index({ category: 1 });
serviceSchema.index({ isActive: 1 });
serviceSchema.index({ isActive: 1, category: 1 });
serviceSchema.index({ createdAt: -1 });

// Auto-generate slug from serviceName (allow override)
function generateSlug(name) {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
}

// Pre-validate: always regenerate slug from serviceName when name changes
serviceSchema.pre('validate', function (next) {
  if (this.isModified('serviceName') || !this.slug) {
    this.slug = generateSlug(this.serviceName);
  }
  next();
});

module.exports = mongoose.model('Service', serviceSchema);
