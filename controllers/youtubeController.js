const axios = require('axios');

const YOUTUBE_API_BASE = 'https://www.googleapis.com/youtube/v3/channels';

/**
 * Parse any channel input into a query parameter for the YouTube API.
 *
 * Supports:
 *  - Channel ID:          UCxxxxxxxxxxxxxxxxxxxxxx
 *  - Handle:              @channelhandle
 *  - YouTube URLs:
 *      https://youtube.com/@handle
 *      https://youtube.com/channel/UCxxxxxx
 *      https://youtube.com/c/customname
 *      https://youtube.com/user/username
 */
const parseChannelInput = (input) => {
  const raw = input.trim();

  // ── Direct channel ID (starts with UC and is 24 chars) ──────
  if (/^UC[\w-]{22}$/.test(raw)) {
    return { type: 'id', value: raw };
  }

  // ── Handle with @ ───────────────────────────────────────────
  if (raw.startsWith('@')) {
    return { type: 'forHandle', value: raw };
  }

  // ── Full YouTube URL ─────────────────────────────────────────
  try {
    const url = new URL(raw);

    // /channel/UCxxxxxx
    const channelMatch = url.pathname.match(/\/channel\/(UC[\w-]{22})/);
    if (channelMatch) return { type: 'id', value: channelMatch[1] };

    // /@handle
    const handleMatch = url.pathname.match(/^\/@([\w.-]+)/);
    if (handleMatch) return { type: 'forHandle', value: `@${handleMatch[1]}` };

    // /c/customname or /user/username — treated as handle lookup
    const legacyMatch = url.pathname.match(/^\/(c|user)\/([\w.-]+)/);
    if (legacyMatch) return { type: 'forHandle', value: `@${legacyMatch[2]}` };

  } catch (_) {
    // Not a URL — treat as plain handle
  }

  // ── Fallback: bare handle without @ ─────────────────────────
  return { type: 'forHandle', value: `@${raw}` };
};

/**
 * GET /api/youtube/channel-info?input=<channelLink|channelId|@handle>
 *
 * Returns structured channel data ready to pre-fill the upload form.
 */
exports.getChannelInfo = async (req, res) => {
  const { input } = req.query;

  if (!input || !input.trim()) {
    return res.status(400).json({
      success: false,
      message: 'Please provide a YouTube channel link, ID, or handle.'
    });
  }

  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) {
    return res.status(503).json({
      success: false,
      message: 'YouTube API is not configured yet. Please contact support.'
    });
  }

  try {
    const parsed = parseChannelInput(input);

    // Build API request parameters
    const params = {
      part: 'snippet,statistics,brandingSettings',
      key: apiKey,
    };

    if (parsed.type === 'id') {
      params.id = parsed.value;
    } else {
      params.forHandle = parsed.value;
    }

    const response = await axios.get(YOUTUBE_API_BASE, { params });
    const items = response.data?.items;

    if (!items || items.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Channel not found. Please check the link or ID and try again.'
      });
    }

    const ch = items[0];
    const snippet = ch.snippet || {};
    const stats = ch.statistics || {};
    const branding = ch.brandingSettings?.channel || {};

    // ── Map to our channel form fields ──────────────────────────
    const channelData = {
      // Identity
      channelId:            ch.id,
      name:                 snippet.title || '',
      description:          snippet.description || '',
      customUrl:            snippet.customUrl || '',
      channelLink:          snippet.customUrl
                              ? `https://www.youtube.com/${snippet.customUrl}`
                              : `https://www.youtube.com/channel/${ch.id}`,
      avatar:               snippet.thumbnails?.high?.url
                            || snippet.thumbnails?.medium?.url
                            || snippet.thumbnails?.default?.url
                            || '',
      bannerUrl:            branding.bannerExternalUrl || '',

      // Dates
      joinedDate:           snippet.publishedAt
                              ? new Date(snippet.publishedAt).toISOString().split('T')[0]
                              : '',

      // Location / Language
      country:              snippet.country || '',
      my_language:          snippet.defaultLanguage || '',

      // Stats (all as strings for form compatibility)
      subscriberCount:      stats.hiddenSubscriberCount
                              ? '0'
                              : String(stats.subscriberCount || '0'),
      viewCount:            String(stats.viewCount || '0'),
      videoCount:           String(stats.videoCount || '0'),

      // Derived / calculated — user fills these in
      estimatedEarnings:    '',
      averageViewsPerVideo: stats.videoCount && stats.viewCount
                              ? String(Math.round(Number(stats.viewCount) / Number(stats.videoCount)))
                              : '',
      recentViews:          '',
      watchTimeHours:       '',
    };

    return res.json({
      success: true,
      data: channelData,
      message: 'Channel info fetched successfully!'
    });

  } catch (err) {
    console.error('YouTube API error:', err.response?.data || err.message);

    // Pass through YouTube API error messages clearly
    const ytError = err.response?.data?.error;
    if (ytError) {
      return res.status(err.response.status).json({
        success: false,
        message: ytError.message || 'YouTube API error.',
        code: ytError.code
      });
    }

    return res.status(500).json({
      success: false,
      message: 'Failed to fetch channel info. Please try again.'
    });
  }
};
