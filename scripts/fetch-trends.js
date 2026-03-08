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
    const response = await axios.get(`https://www.reddit.com/r/${subreddit}/hot.json?limit=5`);
    return response.data.data.children.map(post => ({
      title: post.data.title,
      url: post.data.url,
      description: post.data.selftext || `Trending in r/${subreddit}`,
      source: 'Reddit',
      category: subreddit,
      publishedAt: new Date(post.data.created_utc * 1000).toISOString(),
      thumbnail: post.data.thumbnail && post.data.thumbnail.startsWith('http') ? post.data.thumbnail : null
    }));
  } catch (error) {
    console.error(`Error fetching Reddit ${subreddit}:`, error.message);
    return [];
  }
}

async function fetchGoogleNewsTrends() {
  try {
    const feed = await parser.parseURL('https://news.google.com/rss?hl=en-US&gl=US&ceid=US:en');
    return feed.items.map(item => ({
      title: item.title,
      url: item.link,
      description: item.contentSnippet || item.title,
      source: 'Google News',
      category: 'General',
      publishedAt: new Date(item.pubDate).toISOString(),
      thumbnail: null // Google News RSS doesn't provide thumbnails easily
    })).slice(0, 15);
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
      // Map to niche
      redditResults.forEach(r => r.category = niche);
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
