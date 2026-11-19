import express from 'express';
import multer from 'multer';
import AdmZip from 'adm-zip';
import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { PENDING_DIR, GAMES_DIR, isValidSlug } from '../lib/storage.js';
import { validateGameFolder } from '../lib/validate.js';

const router = express.Router();
const upload = multer({
  dest: '/tmp/antology-uploads/',
  limits: { fileSize: 15 * 1024 * 1024 },
});

// Служебный мусор, который macOS и Windows кладут в архивы автоматически
const IGNORED_DIRS = new Set(['__MACOSX', '.git', '.vscode', '.idea', 'node_modules']);
const IGNORED_FILES = new Set(['.DS_Store', 'Thumbs.db', 'desktop.ini']);
const IGNORED_PREFIXES = ['._'];  // AppleDouble-файлы (._index.html и т.п.)

function shouldIgnore(entryName) {
  const parts = entryName.split('/').filter(Boolean);
  return parts.some(p =>
    IGNORED_DIRS.has(p) ||
    IGNORED_FILES.has(p) ||
    IGNORED_PREFIXES.some(pref => p.startsWith(pref))
  );
}

router.post('/', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ errors: ['Не приложен ZIP-файл'] });

    const zip = new AdmZip(req.file.path);
    const entries = zip.getEntries().filter(e => !shouldIgnore(e.entryName));

    if (entries.length === 0) {
      return res.status(400).json({
        errors: ['Архив пуст или содержит только служебные файлы macOS/Windows']
      });
    }

    // Определяем общий корень: одна папка внутри архива
    const roots = new Set();
    for (const e of entries) {
      const parts = e.entryName.split('/').filter(Boolean);
      if (parts.length) roots.add(parts[0]);
    }

    let rootPrefix = null;
    if (roots.size === 1) {
      rootPrefix = [...roots][0];
    } else {
      // Если корней несколько — попробуем найти папку, где лежит game.json
      const candidates = new Set();
      for (const e of entries) {
        const parts = e.entryName.split('/').filter(Boolean);
        if (parts.length === 2 && parts[1] === 'game.json') {
          candidates.add(parts[0]);
        }
      }
      if (candidates.size === 1) rootPrefix = [...candidates][0];
    }

    // Вытаскиваем slug из game.json внутри архива
    let innerSlug = null;
    const gameJsonPath = rootPrefix ? `${rootPrefix}/game.json` : 'game.json';
    const gameJsonEntry = entries.find(e => e.entryName === gameJsonPath);
    if (gameJsonEntry) {
      try {
        const parsed = JSON.parse(gameJsonEntry.getData().toString('utf8'));
        if (parsed && typeof parsed.slug === 'string') innerSlug = parsed.slug;
      } catch {}
    }

    let slug = (req.body.slug || '').trim();
    if (!slug) slug = innerSlug || rootPrefix || '';

    if (!isValidSlug(slug)) {
      return res.status(400).json({ errors: [
        `Некорректный slug: «${slug}». Разрешены латиница, цифры и дефис, 2–41 символов, начиная с буквы или цифры.`
      ]});
    }

    // Занятость
    try {
      await fs.access(path.join(GAMES_DIR, slug));
      return res.status(400).json({ errors: [`Игра «${slug}» уже существует`] });
    } catch {}
    const pendingList = await fs.readdir(PENDING_DIR);
    for (const p of pendingList) {
      try {
        const m = JSON.parse(await fs.readFile(path.join(PENDING_DIR, p, 'meta.json'), 'utf8'));
        if (m.slug === slug) return res.status(400).json({ errors: [`Заявка «${slug}» уже ждёт проверки`] });
      } catch {}
    }

    // Распаковка
    const pendingId = crypto.randomUUID();
    const targetDir = path.join(PENDING_DIR, pendingId, slug);
    await fs.mkdir(targetDir, { recursive: true });

    for (const e of entries) {
      if (e.isDirectory) continue;
      let rel = e.entryName;
      if (rootPrefix && rel.startsWith(rootPrefix + '/')) rel = rel.slice(rootPrefix.length + 1);
      const safe = rel.split('/').filter(p => p && p !== '..' && p !== '.').join('/');
      if (!safe) continue;
      const out = path.join(targetDir, safe);
      if (!out.startsWith(targetDir + path.sep) && out !== targetDir) continue;
      await fs.mkdir(path.dirname(out), { recursive: true });
      await fs.writeFile(out, e.getData());
    }

    const { errors, warnings, meta } = await validateGameFolder(targetDir, slug);
    if (errors.length) {
      await fs.rm(path.join(PENDING_DIR, pendingId), { recursive: true, force: true });
      return res.status(400).json({ errors, warnings });
    }

    await fs.writeFile(
      path.join(PENDING_DIR, pendingId, 'meta.json'),
      JSON.stringify({
        slug,
        submittedAt: new Date().toISOString(),
        ip: req.ip,
        warnings,
        gameMeta: meta,
      }, null, 2)
    );

    try { await fs.unlink(req.file.path); } catch {}

    res.json({ ok: true, pendingId, slug, warnings });
  } catch (err) {
    console.error('[upload]', err);
    res.status(500).json({ errors: ['Ошибка сервера: ' + err.message] });
  }
});

export default router;