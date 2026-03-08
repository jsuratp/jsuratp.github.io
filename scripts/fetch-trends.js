import fs from 'fs';
import path from 'path';
import axios from 'axios';
import googleTrends from 'google-trends-api';
import Parser from 'rss-parser';

const parser = new Parser();

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
    const data = JSON.parse(results);
    const trends = [];

    data.default.trendingSearchesDays.forEach(day => {
      day.trendingSearches.forEach(search => {
        trends.push({
          title: search.title.query,
          url: `https://www.google.com/search?q=${encodeURIComponent(search.title.query)}`,
          description: `Trending search with ${search.formattedTraffic} searches. Related: ${search.relatedQueries.map(r => r.query).join(', ')}`,
          source: 'Google Trends',
          category: 'general',
          publishedAt: new Date().toISOString(),
          thumbnail: search.image?.imageUrl || null,
          traffic: search.formattedTraffic
        });
      });
    });
    return trends;
  } catch (error) {
    console.error('Error fetching Google Trends:', error.message);
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
        let thumb = post.data.thumbnail.replace(/&amp;/g, '&');
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

async function fetchGoogleNewsTrends() {
  try {
    const feed = await parser.parseURL('https://news.google.com/rss?hl=en-US&gl=US&ceid=US:en');
    return feed.items.map(item => ({
      title: item.title,
      url: item.link,
      description: item.contentSnippet || item.title,
      source: 'Google News',
      category: 'general',
      publishedAt: new Date(item.pubDate).toISOString(),
      thumbnail: null
    })).slice(0, 20);
  } catch (error) {
    console.error('Error fetching Google News Trends:', error.message);
    return [];
  }
}

async function main() {
  console.log('--- TrendPulse Production Fetcher ---');
  
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  const allTrends = [];
  
  // 1. Google Daily Trends
  const gTrends = await fetchGoogleTrends();
  allTrends.push(...gTrends);
  
  // 2. Google News
  const newsTrends = await fetchGoogleNewsTrends();
  allTrends.push(...newsTrends);
  
  // 3. Reddit Niches
  for (const [niche, subs] of Object.entries(NICHES)) {
    console.log(`Fetching niche: ${niche}...`);
    for (const sub of subs) {
      const redditResults = await fetchRedditTrends(sub, niche);
      allTrends.push(...redditResults);
    }
  }

  // Deduplicate by title
  const uniqueTrends = Array.from(new Map(allTrends.map(t => [t.title.toLowerCase(), t])).values());

  // Handle History (Database replacement)
  let history = [];
  if (fs.existsSync(HISTORY_FILE)) {
    history = JSON.parse(fs.readFileSync(HISTORY_FILE, 'utf8'));
  }
  
  // Add new unique trends to history, keep max 1000
  const updatedHistory = [...uniqueTrends, ...history]
    .filter((v, i, a) => a.findIndex(t => t.title.toLowerCase() === v.title.toLowerCase()) === i)
    .slice(0, 1000);

  fs.writeFileSync(HISTORY_FILE, JSON.stringify(updatedHistory, null, 2));
  fs.writeFileSync(TRENDS_FILE, JSON.stringify(uniqueTrends, null, 2));
  
  console.log(`Success! Saved ${uniqueTrends.length} active trends and updated history (${updatedHistory.length} total).`);
}

main().catch(console.error);
