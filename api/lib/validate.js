import fs from 'fs/promises';
import path from 'path';

const ALLOWED_EXT = new Set([
  '.html', '.css', '.js', '.json',
  '.png', '.jpg', '.jpeg', '.webp', '.gif', '.svg',
  '.mp3', '.ogg', '.wav', '.woff2', '.txt', '.md',
]);
const COVER_EXT = new Set(['.png', '.jpg', '.jpeg', '.webp', '.svg']);
const GENRES = new Set(['arcade','puzzle','strategy','action','adventure','quiz','other']);
const AGES = new Set(['0+','6+','12+','16+','18+']);
const REQUIRED = ['slug','title','summary','description','author','coverImage','createdAt'];
const MAX_SIZE = 10 * 1024 * 1024;
const MAX_COVER = 500 * 1024;
const EXTERNAL_URL = /https?:\/\//i;
const DANGEROUS = /\b(eval|new\s+Function|document\.write)\s*\(/;

async function walk(dir, acc = []) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) await walk(full, acc);
    else acc.push(full);
  }
  return acc;
}

export async function validateGameFolder(gameDir, slug) {
  const errors = [], warnings = [];

  for (const f of ['index.html','style.css','script.js','game.json']) {
    try { await fs.access(path.join(gameDir, f)); }
    catch { errors.push(`Отсутствует обязательный файл: ${f}`); }
  }

  let meta = null;
  try { meta = JSON.parse(await fs.readFile(path.join(gameDir, 'game.json'), 'utf8')); }
  catch { errors.push('game.json не является валидным JSON'); }

  if (meta) {
    for (const f of REQUIRED) if (!meta[f]) errors.push(`Нет поля в game.json: ${f}`);
    if (meta.slug !== slug) errors.push(`slug в game.json («${meta.slug}») не совпадает с именем папки («${slug}»)`);
    if (meta.genre && !GENRES.has(meta.genre)) errors.push(`Недопустимый genre: ${meta.genre}`);
    if (meta.ageRating && !AGES.has(meta.ageRating)) errors.push(`Недопустимый ageRating: ${meta.ageRating}`);
    if (meta.author && (typeof meta.author !== 'object' || !meta.author.name || !meta.author.class))
      errors.push('author должен содержать name и class');

    if (meta.coverImage) {
      try {
        const st = await fs.stat(path.join(gameDir, meta.coverImage));
        if (st.size > MAX_COVER) errors.push(`Обложка больше ${MAX_COVER / 1024} КБ`);
        if (!COVER_EXT.has(path.extname(meta.coverImage).toLowerCase()))
          errors.push(`Недопустимый формат обложки: ${meta.coverImage}`);
      } catch { errors.push(`Файл обложки не найден: ${meta.coverImage}`); }
    }
  }

  const files = await walk(gameDir);
  let total = 0;
  for (const file of files) {
    const st = await fs.stat(file);
    total += st.size;
    const ext = path.extname(file).toLowerCase();
    const rel = path.relative(gameDir, file);
    if (!ALLOWED_EXT.has(ext)) errors.push(`Недопустимое расширение: ${rel}`);
    if (['.html','.css','.js'].includes(ext)) {
      const content = await fs.readFile(file, 'utf8');
      if (EXTERNAL_URL.test(content)) errors.push(`Внешняя ссылка (http/https) в ${rel}`);
      if (DANGEROUS.test(content)) warnings.push(`Опасный вызов (eval/Function/document.write) в ${rel}`);
    }
  }
  if (total > MAX_SIZE) errors.push(`Размер игры превышает ${MAX_SIZE / 1024 / 1024} МБ`);

  return { errors, warnings, meta };
}