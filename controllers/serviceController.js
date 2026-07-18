const Service = require('../models/service');
const { uploadToR2, deleteFromR2 } = require('../config/r2');

// Helper: ensure unique slug by appending suffix if collision
async function uniqueSlug(baseSlug, excludeId = null) {
  let slug = baseSlug;
  let count = 0;
  while (true) {
    const query = { slug };
    if (excludeId) query._id = { $ne: excludeId };
    const existing = await Service.findOne(query);
    if (!existing) return slug;
    count++;
    slug = `${baseSlug}-${count}`;
  }
}

// ── PUBLIC ────────────────────────────────────────────────────────────────────

/**
 * GET /services
 * Return all active services (public)
 */
exports.getAllServices = async (req, res) => {
  try {
    const { category } = req.query;
    const query = { isActive: true };
    if (category && category !== 'all') query.category = category;

    const services = await Service.find(query)
      .select('serviceName slug category price description images createdAt sortOrder')
      .sort({ sortOrder: 1, createdAt: -1 });

    // Unique categories list for filter
    const categories = await Service.distinct('category', { isActive: true });

    res.json({ success: true, services, categories });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

/**
 * GET /services/:slug
 * Return one service by slug (public)
 */
exports.getServiceBySlug = async (req, res) => {
  try {
    const service = await Service.findOne({ slug: req.params.slug, isActive: true });
    if (!service) return res.status(404).json({ success: false, message: 'Service not found' });
    res.json({ success: true, service });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ── ADMIN ─────────────────────────────────────────────────────────────────────

/**
 * GET /admin/services
 * Return all services including inactive (admin only)
 */
exports.getAdminServices = async (req, res) => {
  try {
    const services = await Service.find({}).sort({ createdAt: -1 });
    res.json({ success: true, services });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

/**
 * POST /admin/services
 * Create a new service, upload images to R2 (images already webp from client)
 */
exports.createService = async (req, res) => {
  try {
    let { serviceName, category, price, description, faq, sortOrder, isActive } = req.body;

    // Parse JSON fields sent as strings from FormData
    if (typeof faq === 'string') faq = JSON.parse(faq || '[]');
    price = Number(price);
    sortOrder = sortOrder !== undefined ? Number(sortOrder) : 0;
    if (isActive === 'false') isActive = false;
    else isActive = isActive !== undefined ? Boolean(isActive) : true;

    // Generate unique slug
    const baseSlug = serviceName.toLowerCase().trim().replace(/[^a-z0-9\s-]/g, '').replace(/\s+/g, '-').replace(/-+/g, '-');
    const slug = await uniqueSlug(baseSlug);

    // Upload images to R2
    const imageUrls = [];
    if (req.files && req.files.length > 0) {
      for (const file of req.files) {
        const url = await uploadToR2(file.buffer, file.originalname, file.mimetype);
        imageUrls.push(url);
      }
    }

    const service = await Service.create({
      serviceName, slug, category, price, description, faq: faq || [],
      images: imageUrls, sortOrder, isActive
    });

    res.status(201).json({ success: true, service });
  } catch (err) {
    console.error('createService error:', err);
    res.status(400).json({ success: false, message: err.message });
  }
};

/**
 * PUT /admin/services/:id
 * Update service — handles image add/remove, re-generates slug if name changes
 */
exports.updateService = async (req, res) => {
  try {
    const service = await Service.findById(req.params.id);
    if (!service) return res.status(404).json({ success: false, message: 'Service not found' });

    let { serviceName, category, price, description, faq, sortOrder, isActive, removedImages } = req.body;

    if (typeof faq === 'string') faq = JSON.parse(faq || '[]');
    if (typeof removedImages === 'string') removedImages = JSON.parse(removedImages || '[]');
    if (price !== undefined) price = Number(price);
    if (sortOrder !== undefined) sortOrder = Number(sortOrder);
    if (isActive === 'false') isActive = false;
    else if (isActive === 'true') isActive = true;

    // Delete removed images from R2
    if (Array.isArray(removedImages) && removedImages.length > 0) {
      await Promise.all(removedImages.map(url => deleteFromR2(url)));
      service.images = service.images.filter(img => !removedImages.includes(img));
    }

    // Upload new images
    if (req.files && req.files.length > 0) {
      for (const file of req.files) {
        const url = await uploadToR2(file.buffer, file.originalname, file.mimetype);
        service.images.push(url);
      }
    }

    // Re-generate slug if name changed
    if (serviceName && serviceName !== service.serviceName) {
      const baseSlug = serviceName.toLowerCase().trim().replace(/[^a-z0-9\s-]/g, '').replace(/\s+/g, '-').replace(/-+/g, '-');
      service.slug = await uniqueSlug(baseSlug, service._id);
      service.serviceName = serviceName;
    }

    if (category !== undefined) service.category = category;
    if (price !== undefined) service.price = price;
    if (description !== undefined) service.description = description;
    if (faq !== undefined) service.faq = faq;
    if (sortOrder !== undefined) service.sortOrder = sortOrder;
    if (isActive !== undefined) service.isActive = isActive;

    await service.save();
    res.json({ success: true, service });
  } catch (err) {
    console.error('updateService error:', err);
    res.status(400).json({ success: false, message: err.message });
  }
};

/**
 * DELETE /admin/services/:id
 * Hard delete — removes from DB and deletes all R2 images
 */
exports.deleteService = async (req, res) => {
  try {
    const service = await Service.findById(req.params.id);
    if (!service) return res.status(404).json({ success: false, message: 'Service not found' });

    // Delete all images from R2
    if (service.images && service.images.length > 0) {
      await Promise.all(service.images.map(url => deleteFromR2(url)));
    }

    await Service.findByIdAndDelete(req.params.id);
    res.json({ success: true, message: 'Service deleted successfully' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};
