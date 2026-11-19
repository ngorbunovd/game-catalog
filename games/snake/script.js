(() => {
  const canvas = document.getElementById('board');
  const ctx = canvas.getContext('2d');
  const scoreEl = document.getElementById('score');
  const statusEl = document.getElementById('status');

  const CELL = 20;
  const COLS = canvas.width / CELL;
  const ROWS = canvas.height / CELL;

  let snake, dir, nextDir, food, score, timer, speed, alive;

  function randomFood() {
    while (true) {
      const f = { x: (Math.random() * COLS) | 0, y: (Math.random() * ROWS) | 0 };
      if (!snake.some(s => s.x === f.x && s.y === f.y)) return f;
    }
  }

  function reset() {
    snake = [{ x: 10, y: 10 }, { x: 9, y: 10 }, { x: 8, y: 10 }];
    dir = { x: 1, y: 0 };
    nextDir = { x: 1, y: 0 };
    score = 0;
    speed = 150;
    alive = true;
    scoreEl.textContent = '0';
    statusEl.textContent = '';
    food = randomFood();
    clearInterval(timer);
    timer = setInterval(tick, speed);
    draw();
  }

  function tick() {
    if (!alive) return;
    dir = nextDir;
    const head = { x: snake[0].x + dir.x, y: snake[0].y + dir.y };

    if (head.x < 0 || head.x >= COLS || head.y < 0 || head.y >= ROWS) return die();
    if (snake.some(s => s.x === head.x && s.y === head.y)) return die();

    snake.unshift(head);
    if (head.x === food.x && head.y === food.y) {
      score++;
      scoreEl.textContent = score;
      food = randomFood();
      if (speed > 60) {
        speed -= 5;
        clearInterval(timer);
        timer = setInterval(tick, speed);
      }
    } else {
      snake.pop();
    }
    draw();
  }

  function die() {
    alive = false;
    clearInterval(timer);
    statusEl.textContent = 'Игра окончена. Пробел — заново';
  }

  function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    ctx.fillStyle = '#ef4444';
    ctx.beginPath();
    ctx.arc(food.x * CELL + CELL / 2, food.y * CELL + CELL / 2, CELL / 2 - 2, 0, Math.PI * 2);
    ctx.fill();

    for (let i = 0; i < snake.length; i++) {
      const s = snake[i];
      ctx.fillStyle = i === 0 ? '#22d3ee' : '#38bdf8';
      ctx.fillRect(s.x * CELL + 1, s.y * CELL + 1, CELL - 2, CELL - 2);
    }
  }

  const KEYS = {
    ArrowUp: { x: 0, y: -1 }, ArrowDown: { x: 0, y: 1 },
    ArrowLeft: { x: -1, y: 0 }, ArrowRight: { x: 1, y: 0 },
    w: { x: 0, y: -1 }, s: { x: 0, y: 1 }, a: { x: -1, y: 0 }, d: { x: 1, y: 0 },
    W: { x: 0, y: -1 }, S: { x: 0, y: 1 }, A: { x: -1, y: 0 }, D: { x: 1, y: 0 },
  };

  document.addEventListener('keydown', e => {
    if (e.code === 'Space') {
      e.preventDefault();
      if (!alive) reset();
      return;
    }
    const nd = KEYS[e.key];
    if (!nd) return;
    e.preventDefault();
    if (nd.x === -dir.x && nd.y === -dir.y) return;
    nextDir = nd;
  });

  reset();
})();