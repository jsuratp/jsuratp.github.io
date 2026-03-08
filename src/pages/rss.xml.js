import rss from '@astrojs/rss';
import trends from '../data/trends.json';

export async function GET(context) {
  return rss({
    title: 'TrendPulse - Latest Trending News',
    description: 'Fresh trending topics across technology, finance, health, and more. Updated hourly.',
    site: context.site,
    items: trends.map((trend) => ({
      title: trend.title,
      pubDate: new Date(trend.publishedAt),
      description: trend.description,
      link: `/trend/${trend.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')}`,
    })),
  });
}
