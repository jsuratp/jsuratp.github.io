# TrendPulse: Automated Trending Content Engine 🚀

A high-performance, SEO-optimized static website that automatically discovers and publishes trending topics hourly across multiple niches. Built with **Astro**, **Tailwind CSS**, and **GitHub Actions**.

## Key Features
- **Hourly Updates:** Automatically fetches trends from Reddit and Google News every 60 minutes.
- **Extreme SEO:** Dynamic meta tags, JSON-LD schema, XML Sitemaps, and RSS feeds.
- **Core Web Vitals:** Designed for 90+ scores (LCP <2.5s, FID <100ms, CLS <0.1).
- **GitHub Actions Pipeline:** Fully automated CI/CD for zero-cost hosting on GitHub Pages.
- **GSC Ready:** Automatic verification file generation and sitemap integration.

---

## 🚀 Quick Start: Deployment in 5 Minutes

### 1. Fork this Repository
Click the **Fork** button at the top right of this page to create your own copy.

### 2. Configure GitHub Pages
1. Go to **Settings > Pages** in your forked repo.
2. Under **Build and deployment > Source**, select **GitHub Actions**.

### 3. Update `astro.config.mjs`
Update the `site` property with your GitHub Pages URL:
```javascript
export default defineConfig({
  site: 'https://YOUR_USERNAME.github.io/YOUR_REPO_NAME',
  // ...
});
```

### 4. Set Up Google Search Console (GSC)
To enable automatic verification:
1. Go to [Google Search Console](https://search.google.com/search-console).
2. Add your site as a **URL Prefix** property.
3. Find your verification code (e.g., `google12345.html`).
4. In your GitHub repo, go to **Settings > Secrets and variables > Actions**.
5. Create a new secret named `GSC_CODE` and paste only the numeric part (e.g., `12345`).

---

## 📈 Monitoring Traffic
- **GSC Performance Report:** Use this to track organic clicks, impressions, and CTR.
- **Sitemap Submission:** The site automatically generates a sitemap at `/sitemap-index.xml`. Submit this link in GSC under the "Sitemaps" section.
- **Real-time Updates:** Check the **Actions** tab to ensure your hourly builds are running successfully.

---

## 🛠️ Customization

### Adding New Niches
Modify `scripts/fetch-trends.js` to add more subreddits or RSS feeds:
```javascript
const NICHES = {
  // Add your custom niches here
  travel: ['travel', 'backpacking'],
  cooking: ['food', 'recipes']
};
```

### Performance Optimization
The site is built with **Astro**, which ships zero JavaScript by default. To maintain 90+ Lighthouse scores:
- Avoid adding heavy third-party scripts (like heavy trackers).
- Keep images optimized (Astro does this automatically via `astro:assets`).

---

## ⚖️ Disclaimer
This project is for educational purposes. To achieve 1,000,000 views, ensure you are providing valuable context and not just scraping content. Google rewards unique insights over raw trend data.

---

## License
MIT
