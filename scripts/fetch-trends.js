import fs from 'fs';
import path from 'path';
import axios from 'axios';
import Parser from 'rss-parser';
import * as cheerio from 'cheerio';
import crypto from 'crypto';
import sharp from 'sharp';
import dotenv from 'dotenv';

dotenv.config();

const parser = new Parser({ explicitArray: false });

const ROOT = process.cwd();
const DATA_DIR = path.join(ROOT, 'src/data');
const TRENDS_FILE = path.join(DATA_DIR, 'trends.json');
const HISTORY_FILE = path.join(DATA_DIR, 'history.json');
const METADATA_FILE = path.join(DATA_DIR, 'metadata.json');
const IMAGE_DIR = path.join(ROOT, 'public/images/cache');
const FALLBACK_DIR = path.join(ROOT, 'public/images/fallback');

const PLACEHOLDER_FILENAME = 'placeholder.jpg';
const PLACEHOLDER_PATH = path.join(IMAGE_DIR, PLACEHOLDER_FILENAME);
const MAX_CONCURRENCY = Number(process.env.FETCH_TRENDS_CONCURRENCY || 5);
const DOWNLOAD_TIMEOUT = Number(process.env.FETCH_TRENDS_TIMEOUT_MS || 20000);
const DOWNLOAD_RETRIES = Number(process.env.FETCH_TRENDS_RETRIES || 3);
const MIN_IMAGE_DIMENSION = 200;
const CACHE_TTL_MS = Number(process.env.FETCH_TRENDS_CACHE_TTL_MS || 24 * 60 * 60 * 1000);

const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 13_6_1) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  'Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:126.0) Gecko/20100101 Firefox/126.0',
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Mobile/15E148 Safari/604.1'
];

const NICHES = {
  technology: ['technology', 'programming'],
  entertainment: ['movies', 'music'],
  finance: ['finance', 'stocks'],
  health: ['health', 'fitness'],
  gaming: ['gaming', 'pcgaming']
};

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function md5(value) {
  return crypto.createHash('md5').update(value).digest('hex');
}

function normalizeUrl(url) {
  if (!url || typeof url !== 'string') return null;
  let cleaned = url.trim().replace(/&amp;/g, '&');
  if (cleaned.startsWith('//')) cleaned = `https:${cleaned}`;
  if (cleaned.startsWith('http://')) cleaned = cleaned.replace(/^http:/, 'https:');
  if (/^https?:\/\//i.test(cleaned)) return cleaned;
  return null;
}

function isLocalImagePath(value) {
  return typeof value === 'string' && value.startsWith('/images/cache/');
}

function isLikelyBadImagePath(url) {
  if (!url) return true;
  const low = url.toLowerCase();
  const bad = ['logo', 'icon', 'avatar', 'pixel', 'tracking', 'badge', 'png:1x1', '1x1'];
  return bad.some((x) => low.includes(x));
}

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function ensurePlaceholder() {
  ensureDir(IMAGE_DIR);
  if (fs.existsSync(PLACEHOLDER_PATH)) return `/images/cache/${PLACEHOLDER_FILENAME}`;

  await sharp({
    create: {
      width: 640,
      height: 360,
      channels: 3,
      background: { r: 245, g: 245, b: 245, alpha: 1 }
    }
  })
    .jpeg({ quality: 80 })
    .toFile(PLACEHOLDER_PATH);

  return `/images/cache/${PLACEHOLDER_FILENAME}`;
}

async function downloadToCache(url) {
  const normalized = normalizeUrl(url);
  if (!normalized) return null;
  if (isLikelyBadImagePath(normalized)) return null;
  if (isLocalImagePath(normalized)) return normalized;

  const filename = `${md5(normalized)}.jpg`;
  const filePath = path.join(IMAGE_DIR, filename);

  if (fs.existsSync(filePath)) {
    try {
      const meta = await sharp(filePath).metadata();
      if (meta.width >= MIN_IMAGE_DIMENSION && meta.height >= MIN_IMAGE_DIMENSION) {
        return `/images/cache/${filename}`;
      }
      fs.unlinkSync(filePath);
    } catch {
      fs.unlinkSync(filePath);
    }
  }

  ensureDir(IMAGE_DIR);

  for (let attempt = 1; attempt <= DOWNLOAD_RETRIES; attempt++) {
    try {
      const response = await axios.get(normalized, {
        responseType: 'stream',
        timeout: DOWNLOAD_TIMEOUT,
        maxRedirects: 5,
        headers: {
          'User-Agent': USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)],
          Accept: 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8'
        }
      });

      if (response.status !== 200 || !response.headers['content-type']?.startsWith('image')) {
        throw new Error(`http status ${response.status} content-type ${response.headers['content-type']}`);
      }

      const tmpPath = `${filePath}.tmp`;
      await new Promise((resolve, reject) => {
        const writer = fs.createWriteStream(tmpPath);
        response.data.pipe(writer);
        writer.on('finish', resolve);
        writer.on('error', reject);
      });

      const metadata = await sharp(tmpPath).metadata();
      if (!metadata.width || !metadata.height || metadata.width < MIN_IMAGE_DIMENSION || metadata.height < MIN_IMAGE_DIMENSION) {
        fs.unlinkSync(tmpPath);
        throw new Error(`bad dimension ${metadata.width}x${metadata.height}`);
      }

      fs.renameSync(tmpPath, filePath);
      return `/images/cache/${filename}`;
    } catch (err) {
      if (attempt === DOWNLOAD_RETRIES) {
        console.warn(`downloadToCache failed (${attempt}/${DOWNLOAD_RETRIES}):`, normalized, err.message);
      } else {
        await sleep(attempt * 1000);
      }
    }
  }

  return null;
}

function extractRssImage(item) {
  if (!item) return null;
  const candidates = [];

  if (item['media:content']) {
    const mcs = Array.isArray(item['media:content']) ? item['media:content'] : [item['media:content']];
    mcs.forEach((m) => {
      if (m?.$?.url) candidates.push(m.$.url);
      if (m?.url) candidates.push(m.url);
    });
  }

  if (item['media:thumbnail']) {
    const mts = Array.isArray(item['media:thumbnail']) ? item['media:thumbnail'] : [item['media:thumbnail']];
    mts.forEach((m) => {
      if (m?.$?.url) candidates.push(m.$.url);
      if (m?.url) candidates.push(m.url);
    });
  }

  if (item.enclosure?.url) candidates.push(item.enclosure.url);
  if (item.thumbnail) candidates.push(item.thumbnail);

  if (item.content) {
    const $ = cheerio.load(item.content);
    const src = $('img').first().attr('src');
    if (src) candidates.push(src);
  }

  for (const c of candidates) {
    const normalized = normalizeUrl(c);
    if (normalized && !isLikelyBadImagePath(normalized)) return normalized;
  }

  return null;
}

async function fetchPageImageCandidates(articleUrl) {
  if (!articleUrl || !normalizeUrl(articleUrl)) return [];

  try {
    const response = await axios.get(articleUrl, {
      timeout: 9000,
      headers: {
        'User-Agent': USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)]
      },
      maxRedirects: 5
    });

    const html = response.data;
    const $ = cheerio.load(html);
    const images = [];

    ['og:image', 'og:image:secure_url'].forEach((name) => {
      const content = $(`meta[property='${name}']`).attr('content');
      if (content) images.push(content);
    });

    const twitter = $('meta[name="twitter:image"]').attr('content');
    if (twitter) images.push(twitter);

    $('script[type="application/ld+json"]').each((i, el) => {
      const text = $(el).html();
      if (!text) return;
      try {
        const parsed = JSON.parse(text);
        if (parsed) {
          if (parsed.image) {
            if (typeof parsed.image === 'string') images.push(parsed.image);
            else if (Array.isArray(parsed.image)) images.push(parsed.image[0]);
            else if (parsed.image.url) images.push(parsed.image.url);
          }
        }
      } catch (e) {
        // ignore invalid JSON-LD
      }
    });

    const articleImg = $('article img').first().attr('src');
    if (articleImg) images.push(articleImg);

    const firstImg = $('img').first().attr('src');
    if (firstImg) images.push(firstImg);

    return images.map(normalizeUrl).filter((x) => x && !isLikelyBadImagePath(x));
  } catch (err) {
    return [];
  }
}

function getYouTubeThumbnail(url) {
  if (!url) return null;
  const match = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
  if (match) return `https://img.youtube.com/vi/${match[1]}/maxresdefault.jpg`;
  return null;
}

async function fetchBingImage(title) {
  if (!process.env.BING_API_KEY || !title) return null;

  try {
    const response = await axios.get('https://api.bing.microsoft.com/v7.0/images/search', {
      params: { q: title, count: 1, safeSearch: 'Strict' },
      headers: {
        'Ocp-Apim-Subscription-Key': process.env.BING_API_KEY,
        'User-Agent': USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)]
      },
      timeout: 9000
    });

    return normalizeUrl(response.data?.value?.[0]?.contentUrl || null);
  } catch {
    return null;
  }
}

async function getFinalImage(item) {
  const title = item.title || '';
  const url = item.url || '';
  const candidates = new Set();

  const rssImage = extractRssImage(item);
  if (rssImage) candidates.add(rssImage);

  const pageCandidates = await fetchPageImageCandidates(url);
  pageCandidates.forEach((img) => candidates.add(img));

  const yt = getYouTubeThumbnail(url);
  if (yt) candidates.add(yt);

  const bingImg = await fetchBingImage(title);
  if (bingImg) candidates.add(bingImg);

  for (const candidate of candidates) {
    const local = await downloadToCache(candidate);
    if (local) return local;
  }

  return ensurePlaceholder();
}

async function fetchGoogleNews(niche) {
  try {
    const feed = await parser.parseURL(`https://news.google.com/rss/search?q=${encodeURIComponent(niche)}&hl=en-US&gl=US&ceid=US:en`);
    const items = (feed.items || []).slice(0, 6);

    const results = [];
    for (const item of items) {
      results.push({
        title: item.title,
        url: item.link,
        description: item.contentSnippet || item.title,
        source: 'Google News',
        category: niche,
        publishedAt: item.pubDate ? new Date(item.pubDate).toISOString() : new Date().toISOString(),
        thumbnail: item.thumbnail || null
      });
    }

    return results;
  } catch (e) {
    console.warn('fetchGoogleNews failed', e.message);
    return [];
  }
}

async function fetchRedditTrends(subreddit, niche) {
  try {
    const res = await axios.get(`https://www.reddit.com/r/${subreddit}/hot.json?limit=10`, {
      headers: { 'User-Agent': 'TrendPulseBot/1.0' },
      timeout: 10000
    });

    const items = (res.data?.data?.children || []).map((child) => {
      const post = child.data;
      let image = null;

      if (post.preview?.images?.length) image = post.preview.images[0].source.url;
      if (!image && post.thumbnail?.startsWith('http')) image = post.thumbnail;
      if (!image && post.url) image = getYouTubeThumbnail(post.url);

      return {
        title: post.title,
        url: post.url?.startsWith('/') ? `https://reddit.com${post.url}` : post.url,
        description: post.selftext?.slice(0, 200) || `Trending on r/${subreddit}`,
        source: `Reddit r/${subreddit}`,
        category: niche,
        publishedAt: new Date((post.created_utc || 0) * 1000).toISOString(),
        thumbnail: image
      };
    });

    return items;
  } catch (e) {
    console.warn('fetchRedditTrends failed', e.message);
    return [];
  }
}

async function fetchGoogleTrends() {
  try {
    const res = await axios.get('https://trends.google.com/trends/api/dailytrends?hl=en-US&tz=-480&geo=US', {
      timeout: 9000,
      headers: {
        'User-Agent': USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)]
      }
    });

    const json = JSON.parse(res.data.replace(/^\/\//, ''));
    const trends = json.default.trendingSearchesDays?.[0]?.trendingSearches || [];

    return trends.slice(0, 10).map((t) => ({
      title: t.title.query,
      url: `https://trends.google.com/trends/trendingsearches/daily?geo=US#${encodeURIComponent(t.title.query)}`,
      description: t.formattedTraffic,
      source: 'Google Trends',
      category: 'general',
      publishedAt: new Date().toISOString(),
      thumbnail: null
    }));
  } catch (e) {
    console.warn('fetchGoogleTrends failed', e.message);
    return [];
  }
}

function sortByImagePresence(a, b) {
  const aHas = isLocalImagePath(a.thumbnail) && fs.existsSync(path.join(ROOT, a.thumbnail));
  const bHas = isLocalImagePath(b.thumbnail) && fs.existsSync(path.join(ROOT, b.thumbnail));
  if (aHas !== bHas) return bHas ? 1 : -1;

  const dateA = new Date(a.publishedAt).getTime() || 0;
  const dateB = new Date(b.publishedAt).getTime() || 0;
  return dateB - dateA;
}

function cleanupOldImages(keepImages = new Set()) {
  if (!fs.existsSync(IMAGE_DIR)) return;

  const now = Date.now();
  for (const file of fs.readdirSync(IMAGE_DIR)) {
    const filePath = path.join(IMAGE_DIR, file);
    if (!fs.existsSync(filePath)) continue;

    if (file === PLACEHOLDER_FILENAME) continue;

    const localPath = `/images/cache/${file}`;
    if (keepImages.has(localPath)) continue;

    try {
      const stats = fs.statSync(filePath);
      if (now - stats.mtimeMs > CACHE_TTL_MS) {
        fs.unlinkSync(filePath);
      }
    } catch {
      // ignore
    }
  }
}

async function main() {
  console.log('Starting fetch-trends...');

  ensureDir(DATA_DIR);
  ensureDir(IMAGE_DIR);
  ensureDir(FALLBACK_DIR);

  await ensurePlaceholder();

  let all = [];

  for (const niche of Object.keys(NICHES)) {
    console.log('Fetching niche:', niche);
    const googleNews = await fetchGoogleNews(niche);
    all.push(...googleNews);

    for (const sub of NICHES[niche]) {
      const reddit = await fetchRedditTrends(sub, niche);
      all.push(...reddit);
    }
  }

  const googleTrends = await fetchGoogleTrends();
  all.push(...googleTrends);

  const uniqueByKey = new Map();
  for (const item of all) {
    if (!item || !item.title || !item.url) continue;
    const key = `${item.title.trim().toLowerCase()}|${item.url.trim()}`;
    if (!uniqueByKey.has(key)) uniqueByKey.set(key, item);
  }

  let unique = Array.from(uniqueByKey.values());

  // resolve arc final thumbnails
  for (const item of unique) {
    const final = await getFinalImage(item);
    item.thumbnail = final || (await ensurePlaceholder());
  }

  unique = unique.sort(sortByImagePresence);

  const usedImagePaths = new Set(unique.map((i) => i.thumbnail).filter(isLocalImagePath));

  const history = fs.existsSync(HISTORY_FILE) ? JSON.parse(fs.readFileSync(HISTORY_FILE, 'utf8') || '[]') : [];

  const updatedHistory = [...unique, ...history]
    .filter((v, i, a) => a.findIndex((x) => x.title.trim().toLowerCase() === v.title.trim().toLowerCase()) === i)
    .slice(0, 2000);

  const metadata = {
    lastUpdated: new Date().toISOString(),
    totalTrends: unique.length
  };

  cleanupOldImages(usedImagePaths);

  fs.writeFileSync(TRENDS_FILE, JSON.stringify(unique, null, 2));
  fs.writeFileSync(HISTORY_FILE, JSON.stringify(updatedHistory, null, 2));
  fs.writeFileSync(METADATA_FILE, JSON.stringify(metadata, null, 2));

  console.log('Done. Trends:', unique.length);
}

main().catch((err) => {
  console.error('fetch-trends failed', err);
  process.exit(1);
});
