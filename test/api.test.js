// E2E: запуск реального сервера во временных каталогах и полный цикл
// «подача ZIP → заявка → превью → одобрение → лайк → удаление из каталога».
import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import net from 'node:net';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import AdmZip from 'adm-zip';

const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'antology-e2e-'));
const PORT = await new Promise((resolve) => {
  const srv = net.createServer();
  srv.listen(0, '127.0.0.1', () => {
    const port = srv.address().port;
    srv.close(() => resolve(port));
  });
});
const BASE = `http://127.0.0.1:${PORT}`;
const AUTH = 'Basic ' + Buffer.from(':e2e-admin-pass').toString('base64');

const child = spawn(process.execPath, ['api/server.js'], {
  cwd: path.resolve(import.meta.dirname, '..'),
  env: {
    ...process.env,
    PORT: String(PORT),
    ADMIN_PASSWORD: 'e2e-admin-pass',
    SESSION_SECRET: 'e2e-secret',
    ANTOLOGY_GAMES_DIR: path.join(tmp, 'games'),
    ANTOLOGY_PENDING_DIR: path.join(tmp, 'pending'),
    ANTOLOGY_DATA_DIR: path.join(tmp, 'data'),
  },
  stdio: 'ignore',
});
after(async () => {
  child.kill();
  await Promise.race([
    once(child, 'exit'),
    new Promise(r => setTimeout(r, 2000)),
  ]).catch(() => {});
  await fs.rm(tmp, { recursive: true, force: true }).catch(() => {});
});

async function waitForServer(timeoutMs = 5000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const r = await fetch(BASE + '/api/games');
      if (r.ok) return;
    } catch {}
    await new Promise(r => setTimeout(r, 100));
  }
  throw new Error('Сервер не поднялся за 5 секунд');
}

const SLUG = 'e2e-game';
const META = {
  slug: SLUG,
  title: 'E2E игра',
  summary: 'Проверка полного цикла',
  description: 'Полное описание для e2e',
  author: { name: 'Тестер', class: '11Б' },
  genre: 'puzzle',
  ageRating: '6+',
  coverImage: 'cover.svg',
  createdAt: '2026-11-26',
};

function gameZip() {
  const zip = new AdmZip();
  zip.addFile(`${SLUG}/game.json`, Buffer.from(JSON.stringify(META, null, 2)));
  zip.addFile(`${SLUG}/index.html`, Buffer.from('<!DOCTYPE html><html><body><h1>ok</h1></body></html>'));
  zip.addFile(`${SLUG}/style.css`, Buffer.from('body{}'));
  zip.addFile(`${SLUG}/script.js`, Buffer.from('console.log(1);'));
  zip.addFile(`${SLUG}/cover.svg`, Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="4" height="4"></svg>'));
  return zip.toBuffer();
}

describe('полный цикл модерации', () => {
  it('сервер поднимается', async () => { await waitForServer(); });

  it('заявки без пароля недоступны', async () => {
    const r = await fetch(BASE + '/api/pending');
    assert.equal(r.status, 401);
  });

  it('подача ZIP создаёт заявку', async () => {
    const fd = new FormData();
    fd.append('file', new Blob([gameZip()], { type: 'application/zip' }), 'game.zip');
    fd.append('slug', '');
    const r = await fetch(BASE + '/api/upload', { method: 'POST', body: fd });
    const data = await r.json();
    assert.equal(r.status, 200, JSON.stringify(data));
    assert.equal(data.ok, true);
    assert.equal(data.slug, SLUG);
  });

  it('превью заявки открывается, URL абсолютные', async () => {
    const r = await fetch(BASE + '/api/pending', { headers: { Authorization: AUTH } });
    const items = await r.json();
    assert.equal(items.length, 1);
    assert.ok(items[0].playUrl.startsWith('/api/pending/'), items[0].playUrl);
    assert.ok(items[0].coverUrl.startsWith('/api/pending/'), items[0].coverUrl);
    const preview = await fetch(BASE + items[0].playUrl, { headers: { Authorization: AUTH } });
    assert.equal(preview.status, 200);
  });

  it('повторная подача того же slug отклоняется', async () => {
    const fd = new FormData();
    fd.append('file', new Blob([gameZip()], { type: 'application/zip' }), 'game.zip');
    fd.append('slug', '');
    const r = await fetch(BASE + '/api/upload', { method: 'POST', body: fd });
    const data = await r.json();
    assert.equal(r.status, 400);
    assert.ok(data.errors.some(e => e.includes('ждёт проверки')));
  });

  let cookie = '';
  it('одобрение публикует игру в каталог', async () => {
    const items = await (await fetch(BASE + '/api/pending', { headers: { Authorization: AUTH } })).json();
    const r = await fetch(`${BASE}/api/pending/${items[0].pendingId}/approve`, {
      method: 'POST', headers: { Authorization: AUTH },
    });
    assert.equal(r.status, 200);
    const games = await (await fetch(BASE + '/api/games')).json();
    const game = games.find(g => g.slug === SLUG);
    assert.ok(game, 'игра появилась в каталоге');
    assert.equal(game.description, META.description);
    cookie = (await fetch(BASE + '/api/games')).headers.getSetCookie()[0].split(';')[0];
    const page = await fetch(BASE + '/' + game.playUrl);
    assert.equal(page.status, 200);
  });

  it('лайк ставится и снимается в одной сессии', async () => {
    const like = () => fetch(`${BASE}/api/games/${SLUG}/like`, {
      method: 'POST', headers: { Cookie: cookie },
    }).then(r => r.json());
    const first = await like();
    assert.deepEqual(first, { likes: 1, liked: true });
    const second = await like();
    assert.deepEqual(second, { likes: 0, liked: false });
  });

  it('удаление без пароля запрещено, с паролем — удаляет игру и её лайки', async () => {
    // ставим лайк, чтобы проверить очистку голосов
    const like = await fetch(`${BASE}/api/games/${SLUG}/like`, {
      method: 'POST', headers: { Cookie: cookie },
    });
    assert.equal((await like.json()).liked, true);

    const forbidden = await fetch(`${BASE}/api/admin/games/${SLUG}`, { method: 'DELETE' });
    assert.equal(forbidden.status, 401);

    const r = await fetch(`${BASE}/api/admin/games/${SLUG}`, {
      method: 'DELETE', headers: { Authorization: AUTH },
    });
    assert.equal(r.status, 200);

    const games = await (await fetch(BASE + '/api/games')).json();
    assert.equal(games.length, 0);
    const votes = JSON.parse(await fs.readFile(path.join(tmp, 'data', 'votes.json'), 'utf8'));
    assert.deepEqual(votes, {});
  });
});
