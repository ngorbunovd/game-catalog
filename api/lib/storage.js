import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(__dirname, '../../');
export const GAMES_DIR = path.join(ROOT, 'games');
export const PENDING_DIR = path.join(ROOT, '_pending');
export const DATA_DIR = path.join(ROOT, 'data');
export const VOTES_FILE = path.join(DATA_DIR, 'votes.json');

export async function ensureDirs() {
  await fs.mkdir(GAMES_DIR, { recursive: true });
  await fs.mkdir(PENDING_DIR, { recursive: true });
  await fs.mkdir(DATA_DIR, { recursive: true });
  try { await fs.access(VOTES_FILE); }
  catch { await fs.writeFile(VOTES_FILE, '{}'); }
}

export async function readVotes() {
  try { return JSON.parse(await fs.readFile(VOTES_FILE, 'utf8')); }
  catch { return {}; }
}

export async function writeVotes(votes) {
  const tmp = VOTES_FILE + '.tmp';
  await fs.writeFile(tmp, JSON.stringify(votes, null, 2));
  await fs.rename(tmp, VOTES_FILE);
}

export async function listGames() {
  const entries = await fs.readdir(GAMES_DIR, { withFileTypes: true });
  const games = [];
  for (const e of entries) {
    if (!e.isDirectory() || e.name.startsWith('_')) continue;
    try {
      const meta = JSON.parse(
        await fs.readFile(path.join(GAMES_DIR, e.name, 'game.json'), 'utf8')
      );
      games.push({ ...meta, slug: e.name });
    } catch { /* skip invalid */ }
  }
  return games.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
}

export async function readGameMeta(slug) {
  try {
    return JSON.parse(
      await fs.readFile(path.join(GAMES_DIR, slug, 'game.json'), 'utf8')
    );
  } catch { return null; }
}

export const isValidSlug = slug =>
  typeof slug === 'string' && /^[a-z0-9][a-z0-9-]{1,40}$/.test(slug);