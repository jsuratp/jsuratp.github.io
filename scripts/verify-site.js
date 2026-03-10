import fs from 'fs';
import path from 'path';

const SITE_URL = 'https://jsuratp.github.io';
const DATA_FILE = path.join(process.cwd(), 'src/data/trends.json');

async function verifySite() {
  console.log('Starting automated site verification...');
  let errors = 0;

  if (!fs.existsSync(DATA_FILE)) {
    console.error('CRITICAL ERROR: trends.json not found!');
    process.exit(1);
  }

  const trends = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  console.log(`Found ${trends.length} trends to verify.`);

  // 1. Verify Categories
  const defaultCategories = ['technology', 'finance', 'entertainment', 'health', 'gaming', 'general'];
  const dataCategories = [...new Set(trends.map(t => t.category.toLowerCase()))];
  console.log(`Categories in data: ${dataCategories.join(', ')}`);
  
  defaultCategories.forEach(cat => {
    if (!dataCategories.includes(cat)) {
      console.warn(`Warning: Category "${cat}" has no items in trends.json (will show empty page).`);
    }
  });

  // 2. Verify Trend Slugs and Images
  trends.forEach((trend, index) => {
    if (!trend.title) {
      console.error(`Error at index ${index}: Missing title!`);
      errors++;
    }
    
    const slug = trend.title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '');
    
    if (!slug) {
      console.error(`Error for trend "${trend.title}": Could not generate slug!`);
      errors++;
    }

    if (!trend.thumbnail) {
      console.warn(`Note: Trend "${trend.title}" has no thumbnail (using fallback).`);
    } else if (trend.thumbnail.startsWith('http')) {
      // optional: we may still allow remote images if configured
    } else if (trend.thumbnail.startsWith('/images/cache/')) {
      const localPath = path.join(process.cwd(), 'public', trend.thumbnail.replace(/^\//, ''));
      if (!fs.existsSync(localPath)) {
        console.error(`Error for trend "${trend.title}": Local thumbnail file missing: ${trend.thumbnail}`);
        errors++;
      }
    } else {
      console.error(`Error for trend "${trend.title}": Invalid thumbnail URL: ${trend.thumbnail}`);
      errors++;
    }
  });

  if (errors > 0) {
    console.error(`Verification failed with ${errors} errors.`);
    process.exit(1);
  } else {
    console.log('Verification successful! No critical issues found.');
  }
}

verifySite().catch(err => {
  console.error('Verification script crashed:', err);
  process.exit(1);
});
