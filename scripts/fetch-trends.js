import fs from 'fs';
import path from 'path';
import axios from 'axios';
import googleTrends from 'google-trends-api';
import Parser from 'rss-parser';
import * as cheerio from 'cheerio';

const parser = new Parser();

const DATA_DIR = path.join(process.cwd(), 'src/data');
const TRENDS_FILE = path.join(DATA_DIR, 'trends.json');
const HISTORY_FILE = path.join(DATA_DIR, 'history.json');

function cleanImage(url) {
  if (!url) return null;

  return url
    .replace(/&amp;/g, '&')
    .replace('http://', 'https://')
    .trim();
}

async function fetchOGImage(url) {
  try {
    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0'
      },
      timeout: 7000
    });

    const $ = cheerio.load(response.data);

    const og =
      $('meta[property="og:image"]').attr('content') ||
      $('meta[name="twitter:image"]').attr('content') ||
      $('meta[property="og:image:secure_url"]').attr('content') ||
      $('link[rel="image_src"]').attr('href');

    return cleanImage(og);
  } catch {
    return null;
  }
}

async function fetchRedditTrends(subreddit, niche) {
  try {
    const res = await axios.get(
      `https://www.reddit.com/r/${subreddit}/hot.json?limit=10`,
      { headers: { 'User-Agent': 'TrendPulseBot/1.0' } }
    );

    return res.data.data.children.map(post => {

      let image = null;

      if (post.data.preview?.images?.length) {
        image = post.data.preview.images[0].source.url;
      }

      if (!image && post.data.thumbnail?.startsWith('http')) {
        image = post.data.thumbnail;
      }

      image = cleanImage(image);

      return {
        title: post.data.title,
        url: post.data.url.startsWith('/')
          ? `https://reddit.com${post.data.url}`
          : post.data.url,
        description:
          post.data.selftext?.slice(0, 200) ||
          `Trending on r/${subreddit}`,
        source: `Reddit r/${subreddit}`,
        category: niche,
        publishedAt: new Date(post.data.created_utc * 1000).toISOString(),
        thumbnail: image
      };
    });

  } catch {
    return [];
  }
}

async function fetchGoogleNews(niche) {

  const feed = await parser.parseURL(
    `https://news.google.com/rss/search?q=${niche}&hl=en-US&gl=US&ceid=US:en`
  );

  const results = [];

  for (const item of feed.items.slice(0, 6)) {

    let image = await fetchOGImage(item.link);

    if (!image) {
      const match = item.content?.match(/<img.*?src="(.*?)"/);
      if (match) image = match[1];
    }

    results.push({
      title: item.title,
      url: item.link,
      description: item.contentSnippet || item.title,
      source: 'Google News',
      category: niche,
      publishedAt: new Date(item.pubDate).toISOString(),
      thumbnail: cleanImage(image)
    });
  }

  return results;
}

const NICHES = {
  technology: ['technology', 'programming'],
  entertainment: ['movies', 'music'],
  finance: ['finance', 'stocks'],
  health: ['health', 'fitness'],
  gaming: ['gaming', 'pcgaming']
};

async function main() {

  if (!fs.existsSync(DATA_DIR))
    fs.mkdirSync(DATA_DIR, { recursive: true });

  let all = [];

  for (const niche of Object.keys(NICHES)) {

    console.log("Fetching:", niche);

    const news = await fetchGoogleNews(niche);
    all.push(...news);

    for (const sub of NICHES[niche]) {
      const reddit = await fetchRedditTrends(sub, niche);
      all.push(...reddit);
    }
  }

  const unique = Array.from(
    new Map(all.map(x => [x.title.toLowerCase(), x])).values()
  );

  let history = [];

  if (fs.existsSync(HISTORY_FILE))
    history = JSON.parse(fs.readFileSync(HISTORY_FILE));

  const updatedHistory = [...unique, ...history]
    .filter((v, i, a) =>
      a.findIndex(t => t.title.toLowerCase() === v.title.toLowerCase()) === i
    )
    .slice(0, 2000);

  const metadata = {
    lastUpdated: new Date().toISOString(),
    totalTrends: unique.length
  };

  fs.writeFileSync(TRENDS_FILE, JSON.stringify(unique, null, 2));
  fs.writeFileSync(HISTORY_FILE, JSON.stringify(updatedHistory, null, 2));
  fs.writeFileSync(
    path.join(DATA_DIR, 'metadata.json'),
    JSON.stringify(metadata, null, 2)
  );

  console.log("Done. Trends:", unique.length);
}

main();