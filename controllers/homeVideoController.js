const HomeVideo = require('../models/homeVideo');

// Get the current home video
exports.getHomeVideo = async (req, res) => {
  try {
    let video = await HomeVideo.findOne();
    if (!video) {
      video = new HomeVideo();
      await video.save();
    }
    res.status(200).json({
      success: true,
      url: video.url
    });
  } catch (error) {
    console.error('Error fetching home video:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// Update the home video
exports.updateHomeVideo = async (req, res) => {
  try {
    const { url } = req.body;
    if (!url) {
      return res.status(400).json({ success: false, message: 'URL is required' });
    }

    let video = await HomeVideo.findOne();
    if (video) {
      video.url = url;
      video.updatedAt = Date.now();
      await video.save();
    } else {
      video = new HomeVideo({ url });
      await video.save();
    }

    res.status(200).json({
      success: true,
      message: 'Home video updated successfully',
      url: video.url
    });
  } catch (error) {
    console.error('Error updating home video:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};
