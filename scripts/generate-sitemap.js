import fs from 'fs';
import path from 'path';

const SITE_URL = 'https://jsuratp.github.io';
const PUBLIC_DIR = path.join(process.cwd(), 'public');
const TRENDS_FILE = path.join(process.cwd(), 'src/data/trends.json');

function generateSitemap() {
  console.log('Generating production-ready sitemap...');
  
  const now = new Date().toISOString();
  
  // Read trends using fs.readFileSync to avoid import issues
  const trends = JSON.parse(fs.readFileSync(TRENDS_FILE, 'utf8'));
  
  // Base URLs
  const urls = [
    { loc: `${SITE_URL}/`, lastmod: now, changefreq: 'hourly', priority: '1.0' },
    { loc: `${SITE_URL}/category/technology/`, lastmod: now, changefreq: 'hourly', priority: '0.8' },
    { loc: `${SITE_URL}/category/finance/`, lastmod: now, changefreq: 'hourly', priority: '0.8' },
    { loc: `${SITE_URL}/category/entertainment/`, lastmod: now, changefreq: 'hourly', priority: '0.8' },
    { loc: `${SITE_URL}/category/health/`, lastmod: now, changefreq: 'hourly', priority: '0.8' },
    { loc: `${SITE_URL}/category/gaming/`, lastmod: now, changefreq: 'hourly', priority: '0.8' },
  ];

  // Dynamic Trend URLs
  trends.forEach(trend => {
    const slug = trend.title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '');
    
    urls.push({
      loc: `${SITE_URL}/trend/${slug}/`,
      lastmod: trend.publishedAt || now,
      changefreq: 'daily',
      priority: '0.6'
    });
  });

  const sitemapXml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map(url => `  <url>
    <loc>${url.loc}</loc>
    <lastmod>${url.lastmod}</lastmod>
    <changefreq>${url.changefreq}</changefreq>
    <priority>${url.priority}</priority>
  </url>`).join('\n')}
</urlset>`;

  // Write to both root (for user requirement) and public (for Astro build)
  fs.writeFileSync(path.join(process.cwd(), 'sitemap.xml'), sitemapXml);
  fs.writeFileSync(path.join(PUBLIC_DIR, 'sitemap.xml'), sitemapXml);
  
  console.log(`Successfully generated sitemap.xml with ${urls.length} URLs.`);
}

generateSitemap();
