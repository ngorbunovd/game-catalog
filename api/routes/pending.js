import express from 'express';
import fs from 'fs/promises';
import path from 'path';
import { PENDING_DIR, GAMES_DIR } from '../lib/storage.js';

const router = express.Router();

// Раздача файлов игры из pending для превью
router.use('/:id/preview/:slug', (req, res, next) => {
  const dir = path.join(PENDING_DIR, req.params.id, req.params.slug);
  express.static(dir, { index: 'index.html' })(req, res, next);
});

router.get('/', async (req, res) => {
  const entries = await fs.readdir(PENDING_DIR);
  const result = [];
  for (const p of entries) {
    try {
      const meta = JSON.parse(await fs.readFile(path.join(PENDING_DIR, p, 'meta.json'), 'utf8'));
      result.push({
        pendingId: p,
        slug: meta.slug,
        submittedAt: meta.submittedAt,
        warnings: meta.warnings || [],
        title: meta.gameMeta?.title,
        summary: meta.gameMeta?.summary,
        author: meta.gameMeta?.author,
        // Абсолютные пути: страница админки открывается с /admin/ (со слэшем),
        // относительный путь превратился бы в /admin/api/pending/... и дал 404
        coverUrl: `/api/pending/${p}/preview/${meta.slug}/${meta.gameMeta?.coverImage || 'cover.svg'}`,
        playUrl: `/api/pending/${p}/preview/${meta.slug}/`,
      });
    } catch {}
  }
  result.sort((a, b) => (b.submittedAt || '').localeCompare(a.submittedAt || ''));
  res.json(result);
});

router.post('/:id/approve', async (req, res) => {
  const { id } = req.params;
  const pendingDir = path.join(PENDING_DIR, id);
  try {
    const meta = JSON.parse(await fs.readFile(path.join(pendingDir, 'meta.json'), 'utf8'));
    const slug = meta.slug;
    const src = path.join(pendingDir, slug);
    const dst = path.join(GAMES_DIR, slug);
    try {
      await fs.access(dst);
      return res.status(400).json({ error: `Игра "${slug}" уже существует` });
    } catch {}
    await fs.rename(src, dst);
    await fs.rm(pendingDir, { recursive: true, force: true });
    res.json({ ok: true, slug });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/:id/reject', async (req, res) => {
  try {
    await fs.rm(path.join(PENDING_DIR, req.params.id), { recursive: true, force: true });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;