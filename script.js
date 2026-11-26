const state = { games: [], filter: '', genre: '' };

const gamesEl = document.getElementById('games');
const emptyEl = document.getElementById('empty');
const errorEl = document.getElementById('error');

async function loadGames() {
  try {
    const r = await fetch('/api/games');
    if (!r.ok) throw new Error('Ошибка загрузки: ' + r.status);
    state.games = await r.json();
    render();
  } catch (e) {
    errorEl.textContent = e.message;
    errorEl.hidden = false;
  }
}

function render() {
  const filtered = state.games.filter(g => {
    const f = state.filter.toLowerCase();
    const matchText = !f ||
      g.title.toLowerCase().includes(f) ||
      (g.author?.name || '').toLowerCase().includes(f);
    const matchGenre = !state.genre || g.genre === state.genre;
    return matchText && matchGenre;
  });

  emptyEl.hidden = filtered.length > 0;
  gamesEl.innerHTML = filtered.map(cardHtml).join('');
  gamesEl.querySelectorAll('.like').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      toggleLike(btn.dataset.slug, btn);
    });
  });
  gamesEl.querySelectorAll('.play').forEach(a => {
    a.addEventListener('click', e => e.stopPropagation());
  });
  gamesEl.querySelectorAll('.game-card').forEach(card => {
    card.addEventListener('click', () => openGameModal(card.dataset.slug));
  });
}

const GENRE_RU = {
  arcade: 'Аркада', puzzle: 'Головоломка', strategy: 'Стратегия',
  action: 'Экшн', adventure: 'Приключение', quiz: 'Викторина', other: 'Другое',
};

function cardHtml(g) {
  const escape = s => String(s).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
  const tags = (g.tags || []).map(t => `<span class="tag">${escape(t)}</span>`).join('');
  return `
    <article class="game-card" data-slug="${escape(g.slug)}">
      <img class="cover" src="${escape(g.coverImage)}" alt="${escape(g.title)}" loading="lazy">
      <div class="body">
        <div class="badges">
          <span class="badge">${escape(GENRE_RU[g.genre] || g.genre || 'Другое')}</span>
          <span class="badge age">${escape(g.ageRating || '0+')}</span>
        </div>
        <h3>${escape(g.title)}</h3>
        <p class="summary">${escape(g.summary)}</p>
        ${tags ? `<div class="tags">${tags}</div>` : ''}
        <div class="author">${escape(g.author?.name || '')}${g.author?.class ? ', ' + escape(g.author.class) : ''}</div>
      </div>
      <div class="footer">
        <button class="like ${g.liked ? 'liked' : ''}" data-slug="${escape(g.slug)}" title="Нравится">
          <span class="heart">${g.liked ? '❤' : '♡'}</span>
          <span class="count">${g.likes}</span>
        </button>
        <a class="play" href="${escape(g.playUrl)}" target="_blank" rel="noopener">Играть →</a>
      </div>
    </article>
  `;
}

// Модалка с описанием игры
const gameModal = document.getElementById('game-modal');
const gameModalBody = document.getElementById('game-modal-body');

function openGameModal(slug) {
  const g = state.games.find(x => x.slug === slug);
  if (!g) return;
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
  const tags = (g.tags || []).map(t => `<span class="tag">${esc(t)}</span>`).join('');
  gameModalBody.innerHTML = `
    <img class="details-cover" src="${esc(g.coverImage)}" alt="">
    <h2>${esc(g.title)}</h2>
    <div class="badges">
      <span class="badge">${esc(GENRE_RU[g.genre] || g.genre || 'Другое')}</span>
      <span class="badge age">${esc(g.ageRating || '0+')}</span>
    </div>
    ${tags ? `<div class="tags">${tags}</div>` : ''}
    <p class="author-line">${esc(g.author?.name || '')}${g.author?.class ? ', ' + esc(g.author.class) : ''}</p>
    <p class="desc">${esc(g.description || g.summary || '')}</p>
    ${g.controls ? `<p class="controls">🎮 Управление: ${esc(g.controls)}</p>` : ''}
    <div class="actions">
      <a class="btn btn-primary" href="${esc(g.playUrl)}" target="_blank" rel="noopener">Играть →</a>
    </div>
  `;
  gameModal.showModal();
}

document.getElementById('close-game').addEventListener('click', () => gameModal.close());
gameModal.addEventListener('click', e => {
  if (e.target === gameModal) gameModal.close(); // клик по подложке
});

async function toggleLike(slug, btn) {
  btn.disabled = true;
  try {
    const r = await fetch(`/api/games/${slug}/like`, { method: 'POST' });
    if (!r.ok) throw new Error('Не удалось поставить лайк');
    const { likes, liked } = await r.json();
    btn.classList.toggle('liked', liked);
    btn.querySelector('.heart').textContent = liked ? '❤' : '♡';
    btn.querySelector('.count').textContent = likes;
    const g = state.games.find(x => x.slug === slug);
    if (g) { g.likes = likes; g.liked = liked; }
  } catch (e) {
    alert(e.message);
  } finally {
    btn.disabled = false;
  }
}

// Поиск и фильтр
document.getElementById('search').addEventListener('input', e => {
  state.filter = e.target.value;
  render();
});
document.getElementById('genre-filter').addEventListener('change', e => {
  state.genre = e.target.value;
  render();
});

// Модалка загрузки
const modal = document.getElementById('upload-modal');
const form = document.getElementById('upload-form');
const errBox = document.getElementById('upload-errors');
const okBox = document.getElementById('upload-success');

document.getElementById('open-upload').addEventListener('click', () => {
  errBox.hidden = true;
  okBox.hidden = true;
  form.reset();
  modal.showModal();
});
document.getElementById('close-upload').addEventListener('click', () => modal.close());

form.addEventListener('submit', async e => {
  e.preventDefault();
  errBox.hidden = true;
  okBox.hidden = true;
  const submitBtn = document.getElementById('submit-upload');
  submitBtn.disabled = true;
  submitBtn.textContent = 'Отправка...';

  try {
    const fd = new FormData(form);
    const r = await fetch('/api/upload', { method: 'POST', body: fd });
    const data = await r.json();
    if (!r.ok) {
      const list = (data.errors || ['Неизвестная ошибка']).map(x => `<li>${x}</li>`).join('');
      errBox.innerHTML = `<b>Не удалось отправить:</b><ul>${list}</ul>`;
      errBox.hidden = false;
      if (data.warnings?.length) {
        errBox.innerHTML += `<p style="margin-top:8px">Предупреждения: ${data.warnings.join('; ')}</p>`;
      }
    } else {
      okBox.textContent = `Заявка «${data.slug}» отправлена преподавателю на проверку.`;
      okBox.hidden = false;
      form.reset();
      setTimeout(() => modal.close(), 2000);
    }
  } catch (err) {
    errBox.textContent = 'Ошибка сети: ' + err.message;
    errBox.hidden = false;
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = 'Отправить';
  }
});

loadGames();

// Пиксельный снегопад на canvas — чистая декорация
(() => {
  const canvas = document.getElementById('snow');
  if (!canvas || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const ctx = canvas.getContext('2d');
  const flakes = Array.from({ length: 110 }, () => ({
    x: Math.random(),
    y: Math.random(),
    size: 2 + Math.floor(Math.random() * 3),   // пиксели 2–4
    speed: 0.4 + Math.random() * 1.1,          // px за кадр
    drift: (Math.random() - 0.5) * 0.5,
  }));
  let w, h;
  const resize = () => {
    w = canvas.width = innerWidth;
    h = canvas.height = innerHeight;
  };
  resize();
  addEventListener('resize', resize);

  const step = () => {
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(216, 230, 255, 0.85)';
    for (const f of flakes) {
      f.y += f.speed / h;
      f.x += f.drift / w;
      if (f.y > 1.02) { f.y = -0.02; f.x = Math.random(); }
      if (f.x > 1.02) f.x = -0.02;
      if (f.x < -0.02) f.x = 1.02;
      ctx.fillRect(Math.round(f.x * w), Math.round(f.y * h), f.size, f.size);
    }
    requestAnimationFrame(step);
  };
  step();
})();