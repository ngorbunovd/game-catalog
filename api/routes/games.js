import express from 'express';
import { listGames, readVotes, writeVotes, readGameMeta, isValidSlug } from '../lib/storage.js';

const router = express.Router();
const likeRate = new Map();

router.get('/', async (req, res) => {
  const games = await listGames();
  const votes = await readVotes();
  res.json(games.map(g => ({
    slug: g.slug,
    title: g.title,
    summary: g.summary || '',
    author: g.author || {},
    genre: g.genre || 'other',
    ageRating: g.ageRating || '0+',
    tags: g.tags || [],
    coverImage: `games/${g.slug}/${g.coverImage || 'cover.svg'}`,
    playUrl: `games/${g.slug}/index.html`,
    likes: (votes[g.slug] || []).length,
    liked: (votes[g.slug] || []).includes(req.sessionId),
  })));
});

router.post('/:slug/like', async (req, res) => {
  const { slug } = req.params;
  if (!isValidSlug(slug)) return res.status(400).json({ error: 'invalid slug' });
  if (!(await readGameMeta(slug))) return res.status(404).json({ error: 'not found' });

  // Простой rate limit: 20 лайков в минуту на сессию
  const now = Date.now();
  const key = req.sessionId + ':' + slug;
  const recent = (likeRate.get(key) || []).filter(t => now - t < 60000);
  if (recent.length >= 20) return res.status(429).json({ error: 'rate limit' });
  recent.push(now);
  likeRate.set(key, recent);

  const votes = await readVotes();
  const voters = votes[slug] || [];
  let liked;
  if (voters.includes(req.sessionId)) {
    votes[slug] = voters.filter(v => v !== req.sessionId);
    liked = false;
  } else {
    votes[slug] = [...voters, req.sessionId];
    liked = true;
  }
  await writeVotes(votes);
  res.json({ likes: votes[slug].length, liked });
});

export default router;