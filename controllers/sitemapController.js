const Blog = require('../models/blog');
const Channel = require('../models/channel');

const BASE_URL = 'https://www.socialswap.in';

const staticPages = [
  { loc: '/', priority: '1.0', changefreq: 'daily' },
  { loc: '/channels', priority: '0.9', changefreq: 'hourly' },
  { loc: '/blogs', priority: '0.8', changefreq: 'daily' },
  { loc: '/about', priority: '0.6', changefreq: 'monthly' },
  { loc: '/grow', priority: '0.6', changefreq: 'monthly' },
  { loc: '/how-to', priority: '0.7', changefreq: 'monthly' },
];

function escapeXml(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

exports.getSitemap = async (req, res) => {
  try {
    const [blogs, channels] = await Promise.all([
      Blog.find({ published: true }).select('slug updatedAt').lean(),
      Channel.find({ status: 'Available', sold: false }).select('customUrl updatedAt').lean()
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

    xml += `</urlset>`;

    res.set('Content-Type', 'application/xml');
    res.set('Cache-Control', 'public, max-age=3600');
    res.send(xml);
  } catch (err) {
    console.error('Sitemap error:', err);
    res.status(500).json({ success: false, message: 'Sitemap generation failed' });
  }
};
