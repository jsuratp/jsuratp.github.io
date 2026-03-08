import fs from 'fs';
import path from 'path';
import axios from 'axios';
import googleTrends from 'google-trends-api';
import Parser from 'rss-parser';

const parser = new Parser();

const NICHES = {
  technology: ['technology', 'programming', 'webdev', 'gadgets'],
  entertainment: ['movies', 'television', 'music', 'celebs'],
  finance: ['finance', 'investing', 'stocks', 'crypto'],
  health: ['health', 'fitness', 'wellness', 'nutrition'],
  gaming: ['gaming', 'games', 'pcgaming', 'nintendo', 'playstation']
};

async function fetchRedditTrends(subreddit) {
  try {
    const response = await axios.get(`https://www.reddit.com/r/${subreddit}/hot.json?limit=10`, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36' }
    });
    return response.data.data.children
      .filter(post => !post.data.stickied) // Skip pinned posts
      .map(post => {
        let thumb = post.data.thumbnail;
        if (thumb && thumb.startsWith('http')) {
          // Fix HTML entities in Reddit thumbnail URLs
          thumb = thumb.replace(/&amp;/g, '&');
        } else {
          thumb = null;
        }
        
        return {
          title: post.data.title,
          url: post.data.url.startsWith('/') ? `https://www.reddit.com${post.data.url}` : post.data.url,
          description: post.data.selftext?.slice(0, 300) || `Trending in r/${subreddit}`,
          source: 'Reddit',
          category: subreddit,
          publishedAt: new Date(post.data.created_utc * 1000).toISOString(),
          thumbnail: thumb
        };
      });
  } catch (error) {
    console.error(`Error fetching Reddit ${subreddit}:`, error.message);
    return [];
  }
}

async function fetchGoogleNewsTrends() {
  try {
    const feed = await parser.parseURL('https://news.google.com/rss?hl=en-US&gl=US&ceid=US:en');
    return feed.items.map(item => {
      // Try to extract a better description or a thumbnail hint from the RSS item
      // Google News RSS doesn't give images directly, but we can try to guess or use a placeholder service
      return {
        title: item.title,
        url: item.link,
        description: item.contentSnippet || item.title,
        source: 'Google News',
        category: 'general',
        publishedAt: new Date(item.pubDate).toISOString(),
        thumbnail: null // Will use fallback in UI
      };
    }).slice(0, 15);
  } catch (error) {
    console.error('Error fetching Google News Trends:', error.message);
    return [];
  }
}

async function main() {
  console.log('Fetching trends...');
  
  const allTrends = [];
  
  // Fetch Google News Trends
  const googleResults = await fetchGoogleNewsTrends();
  allTrends.push(...googleResults);
  
  // Fetch Reddit Trends for each niche
  for (const [niche, subs] of Object.entries(NICHES)) {
    for (const sub of subs) {
      const redditResults = await fetchRedditTrends(sub);
      // Map to niche and ensure lowercase
      redditResults.forEach(r => r.category = niche.toLowerCase());
      allTrends.push(...redditResults);
    }
  }

  // Deduplicate and filter
  const uniqueTrends = Array.from(new Map(allTrends.map(t => [t.title, t])).values());

  // Save to JSON
  const dataDir = path.join(process.cwd(), 'src/data');
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
  
  fs.writeFileSync(
    path.join(dataDir, 'trends.json'),
    JSON.stringify(uniqueTrends, null, 2)
  );
  
  console.log(`Successfully saved ${uniqueTrends.length} trends to src/data/trends.json`);
}

main().catch(console.error);
