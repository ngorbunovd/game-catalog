// Юнит-тесты валидатора игры. Каждый тест работает в своём временном каталоге.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { validateGameFolder } from '../api/lib/validate.js';

const VALID_META = {
  slug: 'test-game',
  title: 'Тестовая игра',
  summary: 'Сводка',
  description: 'Описание',
  author: { name: 'Автор', class: '7А' },
  genre: 'arcade',
  ageRating: '0+',
  coverImage: 'cover.svg',
  createdAt: '2026-01-01',
};

async function makeGame(overrides = {}, files = {}) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'antology-val-'));
  const meta = { ...VALID_META, ...overrides };
  await fs.writeFile(path.join(dir, 'game.json'), JSON.stringify(meta, null, 2));
  await fs.writeFile(path.join(dir, 'index.html'), '<!DOCTYPE html><html><body><h1>ok</h1></body></html>');
  await fs.writeFile(path.join(dir, 'style.css'), 'body { color: red; }');
  await fs.writeFile(path.join(dir, 'script.js'), 'console.log("hi");');
  await fs.writeFile(path.join(dir, 'cover.svg'), '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"></svg>');
  for (const [name, content] of Object.entries(files)) {
    await fs.writeFile(path.join(dir, name), content);
  }
  return dir;
}

describe('validateGameFolder', () => {
  it('валидная игра проходит без ошибок и предупреждений', async () => {
    const dir = await makeGame();
    const { errors, warnings, meta } = await validateGameFolder(dir, 'test-game');
    assert.deepEqual(errors, []);
    assert.deepEqual(warnings, []);
    assert.equal(meta.title, 'Тестовая игра');
  });

  it('отсутствие обязательного файла — ошибка', async () => {
    const dir = await makeGame();
    await fs.rm(path.join(dir, 'script.js'));
    const { errors } = await validateGameFolder(dir, 'test-game');
    assert.ok(errors.some(e => e.includes('script.js')));
  });

  it('slug в game.json не совпадает с папкой — ошибка', async () => {
    const dir = await makeGame({ slug: 'other-slug' });
    const { errors } = await validateGameFolder(dir, 'test-game');
    assert.ok(errors.some(e => e.includes('не совпадает')));
  });

  it('битый JSON в game.json — ошибка', async () => {
    const dir = await makeGame();
    await fs.writeFile(path.join(dir, 'game.json'), '{ no-json');
    const { errors } = await validateGameFolder(dir, 'test-game');
    assert.ok(errors.some(e => e.includes('JSON')));
  });

  it('недопустимый genre и ageRating — ошибки', async () => {
    const dir = await makeGame({ genre: 'horror', ageRating: '21+' });
    const { errors } = await validateGameFolder(dir, 'test-game');
    assert.ok(errors.some(e => e.includes('genre')));
    assert.ok(errors.some(e => e.includes('ageRating')));
  });

  it('author без class — ошибка', async () => {
    const dir = await makeGame({ author: { name: 'Автор' } });
    const { errors } = await validateGameFolder(dir, 'test-game');
    assert.ok(errors.some(e => e.includes('author')));
  });

  it('несуществующая обложка — ошибка', async () => {
    const dir = await makeGame({ coverImage: 'nope.png' });
    const { errors } = await validateGameFolder(dir, 'test-game');
    assert.ok(errors.some(e => e.includes('обложки')));
  });

  it('обложка неподдерживаемого формата — ошибка', async () => {
    const dir = await makeGame({ coverImage: 'cover.bmp' });
    await fs.writeFile(path.join(dir, 'cover.bmp'), 'x');
    const { errors } = await validateGameFolder(dir, 'test-game');
    assert.ok(errors.some(e => e.includes('формат обложки')));
  });

  it('файл с запрещённым расширением — ошибка', async () => {
    const dir = await makeGame({}, { 'virus.exe': 'MZ' });
    const { errors } = await validateGameFolder(dir, 'test-game');
    assert.ok(errors.some(e => e.includes('.exe')));
  });

  it('http-ссылка в html — ошибка, даже в комментарии', async () => {
    const dir = await makeGame({}, { 'index2.html': '<!-- код из https://example.com -->' });
    const { errors } = await validateGameFolder(dir, 'test-game');
    assert.ok(errors.some(e => e.includes('Внешняя ссылка') && e.includes('index2.html')));
  });

  it('eval() — только предупреждение, не ошибка', async () => {
    const dir = await makeGame({}, { 'evil.js': 'eval("1+1");' });
    const { errors, warnings } = await validateGameFolder(dir, 'test-game');
    assert.deepEqual(errors, []);
    assert.ok(warnings.some(w => w.includes('eval')));
  });

  it('игра тяжелее 10 МБ — ошибка', async () => {
    const dir = await makeGame({}, { 'big.txt': Buffer.alloc(10 * 1024 * 1024 + 1, 0) });
    const { errors } = await validateGameFolder(dir, 'test-game');
    assert.ok(errors.some(e => e.includes('10 МБ')));
  });
});
