import express from 'express';
import fs from 'fs/promises';
import path from 'path';
import { GAMES_DIR, readVotes, writeVotes, isValidSlug } from '../lib/storage.js';

const router = express.Router();

// Управление опубликованными играми. Slug валидируется isValidSlug
// (только a-z0-9-), поэтому обход по каталогам исключён.
router.delete('/games/:slug', async (req, res) => {
  const { slug } = req.params;
  if (!isValidSlug(slug)) return res.status(400).json({ error: 'Некорректный slug' });
  try {
    await fs.rm(path.join(GAMES_DIR, slug), { recursive: true });
  } catch {
    return res.status(404).json({ error: `Игра «${slug}» не найдена в каталоге` });
  }
  // Удаляем и лайки игры, чтобы в votes.json не копились сироты
  const votes = await readVotes();
  if (votes[slug]) {
    delete votes[slug];
    await writeVotes(votes);
  }
  res.json({ ok: true, slug });
});

export default router;
