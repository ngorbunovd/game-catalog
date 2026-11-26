// Юнит-тесты storage: чистые функции и работа с временными каталогами.
// Пути переопределяются через переменные окружения ДО импорта модуля.
import { before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'antology-store-'));
process.env.ANTOLOGY_GAMES_DIR = path.join(tmp, 'games');
process.env.ANTOLOGY_PENDING_DIR = path.join(tmp, 'pending');
process.env.ANTOLOGY_DATA_DIR = path.join(tmp, 'data');

const { GAMES_DIR, listGames, readVotes, writeVotes, isValidSlug, ensureDirs }
  = await import('../api/lib/storage.js');

const META = {
  slug: 'zzz', title: 'Z', summary: 's', description: 'd',
  author: { name: 'A', class: '1' }, coverImage: 'cover.svg', createdAt: '2026-01-01',
};

describe('isValidSlug', () => {
  it('принимает латиницу, цифры и дефис', () => {
    for (const s of ['ab', 'snake', 'my-game-2', 'a'.repeat(41)]) {
      assert.equal(isValidSlug(s), true, s);
    }
  });
  it('отклоняет мусор', () => {
    for (const s of ['', 'a', 'a'.repeat(42), '-abc', '.dot', 'up/..', 'Snake', 'змейка', 'a b', 42, null]) {
      assert.equal(isValidSlug(s), false, String(s));
    }
  });
});

describe('listGames', () => {
  before(async () => {
    await ensureDirs();
    // обе валидные игры содержат slug «zzz», не совпадающий с папкой —
    // listGames должен взять slug из имени папки
    await fs.mkdir(path.join(GAMES_DIR, 'aaa'), { recursive: true });
    await fs.writeFile(path.join(GAMES_DIR, 'aaa', 'game.json'), JSON.stringify({ ...META, createdAt: '2026-01-01' }));
    await fs.mkdir(path.join(GAMES_DIR, 'bbb'), { recursive: true });
    await fs.writeFile(path.join(GAMES_DIR, 'bbb', 'game.json'), JSON.stringify({ ...META, createdAt: '2026-02-01' }));
    // битый game.json — пропускается
    await fs.mkdir(path.join(GAMES_DIR, 'broken'), { recursive: true });
    await fs.writeFile(path.join(GAMES_DIR, 'broken', 'game.json'), 'nope');
    // служебная папка с подчёркиванием — пропускается
    await fs.mkdir(path.join(GAMES_DIR, '_template'), { recursive: true });
    await fs.writeFile(path.join(GAMES_DIR, '_template', 'game.json'), JSON.stringify(META));
  });

  it('возвращает только валидные игры, новее — первыми', async () => {
    const games = await listGames();
    assert.deepEqual(games.map(g => g.slug), ['bbb', 'aaa']);
  });

  it('slug берётся из имени папки, а не из game.json', async () => {
    const games = await listGames();
    // game.json у обеих игр содержит slug «zzz», папки — aaa и bbb
    assert.deepEqual(games.map(g => g.slug), ['bbb', 'aaa']);
  });
});

describe('readVotes/writeVotes', () => {
  it('круговорот значения', async () => {
    await writeVotes({ snake: ['s1'] });
    assert.deepEqual(await readVotes(), { snake: ['s1'] });
  });
  it('чтение отсутствующего файла — пустой объект', async () => {
    await fs.rm(path.join(tmp, 'data', 'votes.json'), { force: true });
    assert.deepEqual(await readVotes(), {});
  });
});
