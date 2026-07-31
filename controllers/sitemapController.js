const Blog = require('../models/blog');
const Channel = require('../models/channel');
const Service = require('../models/service');

const BASE_URL = 'https://www.socialswap.in';

const staticPages = [
  { loc: '/', priority: '1.0', changefreq: 'daily' },
  { loc: '/channels', priority: '0.9', changefreq: 'hourly' },
  { loc: '/blogs', priority: '0.8', changefreq: 'daily' },
  { loc: '/services', priority: '0.8', changefreq: 'monthly' },
  { loc: '/about', priority: '0.6', changefreq: 'monthly' },
  { loc: '/grow', priority: '0.6', changefreq: 'monthly' },
  { loc: '/how-to', priority: '0.7', changefreq: 'monthly' },
  { loc: '/feature', priority: '0.6', changefreq: 'monthly' },
  { loc: '/stats', priority: '0.6', changefreq: 'monthly' },
  { loc: '/privacy-policy', priority: '0.3', changefreq: 'yearly' },
  { loc: '/terms-and-conditions', priority: '0.3', changefreq: 'yearly' },
  { loc: '/refund-policy', priority: '0.3', changefreq: 'yearly' },
  { loc: '/shipping-policy', priority: '0.3', changefreq: 'yearly' },
  { loc: '/privacy', priority: '0.3', changefreq: 'yearly' },
];

function escapeXml(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

exports.getSitemap = async (req, res) => {
  try {
    const [blogs, channels, services] = await Promise.all([
      Blog.find({ published: true, noIndex: { $ne: true } }).select('slug updatedAt').lean(),
      Channel.find({ status: 'Available', sold: false, noIndex: { $ne: true } }).select('customUrl updatedAt').lean(),
      Service.find({ isActive: true }).select('slug updatedAt').lean()
    ]);

    let xml = `<?xml version="1.0" encoding="UTF-8"?>`;
    xml += `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">`;

    // Static pages
    staticPages.forEach(page => {
      xml += `<url>`;
      xml += `<loc>${BASE_URL}${page.loc}</loc>`;
      xml += `<changefreq>${page.changefreq}</changefreq>`;
      xml += `<priority>${page.priority}</priority>`;
      xml += `</url>`;
    });

    // Blog posts
    blogs.forEach(blog => {
      if (!blog.slug) return;
      xml += `<url>`;
      xml += `<loc>${BASE_URL}/blogs/${escapeXml(blog.slug)}</loc>`;
      xml += `<lastmod>${new Date(blog.updatedAt).toISOString()}</lastmod>`;
      xml += `<changefreq>weekly</changefreq>`;
      xml += `<priority>0.7</priority>`;
      xml += `</url>`;
    });

    // Channel pages
    channels.forEach(channel => {
      if (!channel.customUrl) return;
      xml += `<url>`;
      xml += `<loc>${BASE_URL}/channel/${escapeXml(channel.customUrl)}</loc>`;
      xml += `<lastmod>${new Date(channel.updatedAt).toISOString()}</lastmod>`;
      xml += `<changefreq>daily</changefreq>`;
      xml += `<priority>0.8</priority>`;
      xml += `</url>`;
    });

    // Service pages
    services.forEach(service => {
      if (!service.slug) return;
      xml += `<url>`;
      xml += `<loc>${BASE_URL}/services/${escapeXml(service.slug)}</loc>`;
      xml += `<lastmod>${new Date(service.updatedAt).toISOString()}</lastmod>`;
      xml += `<changefreq>monthly</changefreq>`;
      xml += `<priority>0.7</priority>`;
      xml += `</url>`;
    });

    xml += `</urlset>`;

    res.set('Content-Type', 'application/xml');
    res.set('Cache-Control', 'public, max-age=3600');
    res.send(xml);
  } catch (err) {
    console.error('Sitemap error:', err);
    res.status(500).json({ success: false, message: 'Sitemap generation failed' });
  }
};
