// Vercel serverless function - caches OL metadata in Upstash Redis
// Handles: book metadata, author data, search results
// Cache TTL: 30 days for metadata, 7 days for search results

const CACHE_TTL_META = 60 * 60 * 24 * 30;   // 30 days
const CACHE_TTL_SEARCH = 60 * 60 * 24 * 7;  // 7 days

async function kvGet(key) {
  const url = `${process.env.KV_REST_API_URL}/get/${encodeURIComponent(key)}`;
  const r = await fetch(url, {
    headers: { Authorization: `Bearer ${process.env.KV_REST_API_TOKEN}` }
  });
  const d = await r.json();
  return d.result ? JSON.parse(d.result) : null;
}

async function kvSet(key, value, ttl) {
  const url = `${process.env.KV_REST_API_URL}/set/${encodeURIComponent(key)}`;
  await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.KV_REST_API_TOKEN}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ value: JSON.stringify(value), ex: ttl })
  });
}

async function fetchOLBook(key) {
  const url = `https://openlibrary.org${key}.json`;
  const r = await fetch(url);
  if (!r.ok) return null;
  return r.json();
}

async function fetchOLAuthor(key) {
  const r = await fetch(`https://openlibrary.org/authors/${key}.json`);
  if (!r.ok) return null;
  return r.json();
}

async function fetchOLAuthorWorks(key) {
  const r = await fetch(`https://openlibrary.org/authors/${key}/works.json?limit=200`);
  if (!r.ok) return null;
  return r.json();
}

async function fetchOLSearch(q, limit = 20, offset = 0, extra = '') {
  const fields = 'key,title,author_name,cover_i,first_publish_year,isbn,number_of_pages_median,alternative_title,edition_key';
  const url = `https://openlibrary.org/search.json?q=${encodeURIComponent(q)}&limit=${limit}&offset=${offset}&fields=${fields}${extra}`;
  const r = await fetch(url);
  if (!r.ok) return null;
  return r.json();
}

async function fetchOLAuthorSearch(q) {
  const r = await fetch(`https://openlibrary.org/search/authors.json?q=${encodeURIComponent(q)}&limit=1`);
  if (!r.ok) return null;
  return r.json();
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const { type, key, q, limit, offset, extra } = req.query;

  if (!type) return res.status(400).json({ error: 'Missing type parameter' });

  try {
    switch (type) {

      case 'book': {
        if (!key) return res.status(400).json({ error: 'Missing key' });
        const cacheKey = `book:${key}`;
        const cached = await kvGet(cacheKey);
        if (cached) return res.json({ data: cached, cached: true });
        const data = await fetchOLBook(key);
        if (!data) return res.status(404).json({ error: 'Not found' });
        await kvSet(cacheKey, data, CACHE_TTL_META);
        return res.json({ data, cached: false });
      }

      case 'author': {
        if (!key) return res.status(400).json({ error: 'Missing key' });
        const cacheKey = `author:${key}`;
        const cached = await kvGet(cacheKey);
        if (cached) return res.json({ data: cached, cached: true });
        const [authorData, worksData] = await Promise.all([
          fetchOLAuthor(key),
          fetchOLAuthorWorks(key)
        ]);
        if (!authorData) return res.status(404).json({ error: 'Not found' });
        const data = { author: authorData, works: worksData };
        await kvSet(cacheKey, data, CACHE_TTL_META);
        return res.json({ data, cached: false });
      }

      case 'author_search': {
        if (!q) return res.status(400).json({ error: 'Missing q' });
        const cacheKey = `author_search:${q.toLowerCase().trim()}`;
        const cached = await kvGet(cacheKey);
        if (cached) return res.json({ data: cached, cached: true });
        const data = await fetchOLAuthorSearch(q);
        if (!data) return res.status(404).json({ error: 'Not found' });
        await kvSet(cacheKey, data, CACHE_TTL_META);
        return res.json({ data, cached: false });
      }

      case 'search': {
        if (!q) return res.status(400).json({ error: 'Missing q' });
        const pageOffset = parseInt(offset) || 0;
        const pageLimit = parseInt(limit) || 20;
        // Only cache first page of common searches
        const shouldCache = pageOffset === 0 && q.length >= 3;
        const cacheKey = `search:${q.toLowerCase().trim()}:${pageLimit}`;
        if (shouldCache) {
          const cached = await kvGet(cacheKey);
          if (cached) return res.json({ data: cached, cached: true });
        }
        const data = await fetchOLSearch(q, pageLimit, pageOffset, extra || '');
        if (!data) return res.status(404).json({ error: 'Not found' });
        if (shouldCache) await kvSet(cacheKey, data, CACHE_TTL_SEARCH);
        return res.json({ data, cached: false });
      }

      default:
        return res.status(400).json({ error: `Unknown type: ${type}` });
    }
  } catch(e) {
    console.error('Meta API error:', e);
    return res.status(500).json({ error: e.message });
  }
}
