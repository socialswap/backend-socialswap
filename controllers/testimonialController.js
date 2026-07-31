const Testimonial = require('../models/testimonial');
const { uploadToR2, deleteFromR2 } = require('../config/r2');

// Admin: Create a testimonial
exports.createTestimonial = async (req, res) => {
  try {
    const testimonial = new Testimonial(req.body);
    await testimonial.save();
    res.status(201).json({ success: true, data: testimonial });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

// Admin & Public: Get all testimonials
exports.getTestimonials = async (req, res) => {
  try {
    const { limit } = req.query;
    let query = Testimonial.find().sort({ createdAt: -1 });
    
    if (limit) {
      query = query.limit(parseInt(limit));
    }

    const testimonials = await query;
    res.status(200).json({ success: true, data: testimonials });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Admin: Update a testimonial
exports.updateTestimonial = async (req, res) => {
  try {
    const testimonial = await Testimonial.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true
    });
    if (!testimonial) {
      return res.status(404).json({ success: false, message: 'Testimonial not found' });
    }
    res.status(200).json({ success: true, data: testimonial });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

// Admin: Delete a testimonial
exports.deleteTestimonial = async (req, res) => {
  try {
    const testimonial = await Testimonial.findByIdAndDelete(req.params.id);
    if (!testimonial) {
      return res.status(404).json({ success: false, message: 'Testimonial not found' });
    }
    // If it has an avatar, attempt to delete from R2
    if (testimonial.avatar) {
      await deleteFromR2(testimonial.avatar).catch(e => console.error("Error deleting avatar from R2:", e));
    }
    res.status(200).json({ success: true, message: 'Testimonial deleted' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Admin: Upload testimonial image
exports.uploadTestimonialImage = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'No image uploaded' });
    }
    const imageUrl = await uploadToR2(req.file.buffer, req.file.originalname, req.file.mimetype);
    res.status(200).json({ success: true, url: imageUrl });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Admin: Delete testimonial image (if needed during editing)
exports.deleteTestimonialImage = async (req, res) => {
  try {
    const { imageUrl } = req.body;
    if (!imageUrl) {
      return res.status(400).json({ success: false, message: 'Image URL is required' });
    }
    await deleteFromR2(imageUrl);
    res.status(200).json({ success: true, message: 'Image deleted successfully' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
