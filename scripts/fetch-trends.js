import fs from 'fs';
import path from 'path';
import axios from 'axios';
import googleTrends from 'google-trends-api';
import Parser from 'rss-parser';
import * as cheerio from 'cheerio';

const parser = new Parser();

// Helper to fetch OpenGraph image from a URL
async function fetchOGImage(url) {
  try {
    const response = await axios.get(url, {
      headers: { 
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      timeout: 8000,
      maxRedirects: 5
    });
    const $ = cheerio.load(response.data);
    const ogImage = $('meta[property="og:image"]').attr('content') || 
                    $('meta[name="twitter:image"]').attr('content') ||
                    $('link[rel="image_src"]').attr('href');
    
    // If it's still a Google News logo, try to find a better one
    if (ogImage && (ogImage.includes('googleusercontent.com') || ogImage.includes('google.com'))) {
      // Sometimes the real image is in another meta tag
      const articleImage = $('meta[property="og:image:secure_url"]').attr('content') || 
                          $('meta[name="thumbnail"]').attr('content');
      if (articleImage && articleImage.startsWith('http') && !articleImage.includes('google')) {
        return articleImage;
      }
    }
    
    return ogImage && ogImage.startsWith('http') ? ogImage : null;
  } catch (error) {
    return null;
  }
}

const NICHES = {
  technology: ['technology', 'programming', 'webdev', 'gadgets', 'MachineLearning'],
  entertainment: ['movies', 'television', 'music', 'celebs', 'boxoffice'],
  finance: ['finance', 'investing', 'stocks', 'crypto', 'economy'],
  health: ['health', 'fitness', 'wellness', 'nutrition', 'medicine'],
  gaming: ['gaming', 'games', 'pcgaming', 'nintendo', 'playstation', 'xbox']
};

const DATA_DIR = path.join(process.cwd(), 'src/data');
const TRENDS_FILE = path.join(DATA_DIR, 'trends.json');
const HISTORY_FILE = path.join(DATA_DIR, 'history.json');

async function fetchGoogleTrends() {
  try {
    console.log('Fetching Google Daily Trends...');
    const results = await googleTrends.dailyTrends({
      geo: 'US',
    });
    
    const cleanResults = results.replace(/^\)\]\}'\n/, '');
    
    // Check if results are valid JSON
    if (!cleanResults.startsWith('{')) {
      console.warn('Google Trends returned non-JSON response (likely HTML/CAPTCHA block). Skipping...');
      return [];
    }
    
    const data = JSON.parse(cleanResults);
    const trends = [];

    for (const day of data.default.trendingSearchesDays) {
      for (const search of day.trendingSearches) {
        trends.push({
          title: search.title.query,
          url: `https://www.google.com/search?q=${encodeURIComponent(search.title.query)}`,
          description: `Trending search with ${search.formattedTraffic} searches. Related: ${search.relatedQueries.map(r => r.query).join(', ')}`,
          source: 'Google Trends',
          category: 'general',
          publishedAt: new Date().toISOString(),
          thumbnail: search.image?.imageUrl ? search.image.imageUrl.replace('http:', 'https:') : null,
          traffic: search.formattedTraffic
        });
      }
    }
    return trends;
  } catch (error) {
    console.error('Error fetching Google Trends:', error.message);
    // If Google Trends fails, we still have Reddit and News, so we return empty instead of crashing
    return [];
  }
}

async function fetchRedditTrends(subreddit, niche) {
  try {
    const response = await axios.get(`https://www.reddit.com/r/${subreddit}/hot.json?limit=10`, {
      headers: { 'User-Agent': 'TrendPulse/1.0.0 (Production-Ready Content Engine)' }
    });
    return response.data.data.children
      .filter(post => !post.data.stickied && post.data.thumbnail && post.data.thumbnail.startsWith('http'))
      .map(post => {
        let thumb = post.data.thumbnail;
        
        // Try to get a better quality image from the preview object
        if (post.data.preview && post.data.preview.images && post.data.preview.images[0]) {
          const source = post.data.preview.images[0].source;
          if (source && source.url) {
            thumb = source.url;
          }
        }
        
        // Clean up escaped ampersands and other common URL issues
        thumb = thumb.replace(/&amp;/g, '&')
                     .replace(/&lt;/g, '<')
                     .replace(/&gt;/g, '>')
                     .replace(/&quot;/g, '"')
                     .replace(/&#39;/g, "'");
        
        // Ensure https
        if (thumb.startsWith('http:')) {
          thumb = thumb.replace('http:', 'https:');
        }

        return {
          title: post.data.title,
          url: post.data.url.startsWith('/') ? `https://www.reddit.com${post.data.url}` : post.data.url,
          description: post.data.selftext?.slice(0, 300) || `Trending in r/${subreddit}`,
          source: `r/${subreddit}`,
          category: niche.toLowerCase(),
          publishedAt: new Date(post.data.created_utc * 1000).toISOString(),
          thumbnail: thumb
        };
      });
  } catch (error) {
    console.error(`Error fetching Reddit ${subreddit}:`, error.message);
    return [];
  }
}

async function fetchGoogleNewsTrends(niche = 'general') {
  try {
    const query = niche === 'general' ? '' : `&q=${niche}`;
    const url = `https://news.google.com/rss?hl=en-US&gl=US&ceid=US:en${query}`;
    const feed = await parser.parseURL(url);
    const results = [];
    
    // Process only first 10 items to avoid timeouts during OG image fetch
    const items = feed.items.slice(0, 5); // Reduced from 10 to 5 to speed up and avoid timeouts
    
    for (const item of items) {
      console.log(`Fetching OG image for: ${item.title.slice(0, 50)}...`);
      // Try to get real image via OpenGraph
      let realImage = await fetchOGImage(item.link);
      
      if (realImage) {
        realImage = realImage.replace('http:', 'https:')
                             .replace(/&amp;/g, '&');
      }
      
      results.push({
        title: item.title,
        url: item.link,
        description: item.contentSnippet || item.title,
        source: 'Google News',
        category: niche.toLowerCase(),
        publishedAt: new Date(item.pubDate).toISOString(),
        thumbnail: realImage
      });
    }
    return results;
  } catch (error) {
    console.error(`Error fetching Google News (${niche}):`, error.message);
    return [];
  }
}

async function main() {
  console.log('--- TrendPulse Production Fetcher ---');
  
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  const allTrends = [];
  
  // 1. Google Daily Trends (Global)
  const gTrends = await fetchGoogleTrends();
  allTrends.push(...gTrends);
  
  // 2. Google News (Global)
  const newsTrends = await fetchGoogleNewsTrends('general');
  allTrends.push(...newsTrends);
  
  // 3. Reddit & Google News for Niches
  for (const [niche, subs] of Object.entries(NICHES)) {
    console.log(`Fetching niche: ${niche}...`);
    
    // Fetch from Reddit
    for (const sub of subs) {
      const redditResults = await fetchRedditTrends(sub, niche);
      allTrends.push(...redditResults);
    }

    // Fetch from Google News for this specific niche
    const nicheNews = await fetchGoogleNewsTrends(niche);
    allTrends.push(...nicheNews);
  }

  // Deduplicate by title
  const uniqueTrends = Array.from(new Map(allTrends.map(t => [t.title.toLowerCase(), t])).values());

  // Handle History (Database replacement)
  let history = [];
  if (fs.existsSync(HISTORY_FILE)) {
    history = JSON.parse(fs.readFileSync(HISTORY_FILE, 'utf8'));
  }
  
  // Add new unique trends to history, keep max 2000 for "super strong" archive
  const updatedHistory = [...uniqueTrends, ...history]
    .filter((v, i, a) => a.findIndex(t => t.title.toLowerCase() === v.title.toLowerCase()) === i)
    .slice(0, 2000);

  // Save metadata
  const metadata = {
    lastUpdated: new Date().toISOString(),
    totalTrends: uniqueTrends.length,
    totalHistory: updatedHistory.length
  };

  fs.writeFileSync(HISTORY_FILE, JSON.stringify(updatedHistory, null, 2));
  fs.writeFileSync(TRENDS_FILE, JSON.stringify(uniqueTrends, null, 2));
  fs.writeFileSync(path.join(DATA_DIR, 'metadata.json'), JSON.stringify(metadata, null, 2));
  
  console.log(`Success! Saved ${uniqueTrends.length} active trends and updated history (${updatedHistory.length} total).`);
}

main().catch(console.error);
