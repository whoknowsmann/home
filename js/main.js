const booksGrid = document.getElementById('books-grid');
const writingList = document.getElementById('writing-list');
const snowToggle = document.getElementById('snow-toggle');
const snowCanvas = document.getElementById('snow-canvas');
const ctx = snowCanvas.getContext('2d');
let snowflakes = [];
let snowActive = true;

function resizeCanvas() {
  snowCanvas.width = window.innerWidth;
  snowCanvas.height = window.innerHeight;
}

function createSnowflakes(count = 120) {
  snowflakes = Array.from({ length: count }, () => ({
    x: Math.random() * snowCanvas.width,
    y: Math.random() * snowCanvas.height,
    radius: Math.random() * 2 + 1,
    speed: Math.random() * 1 + 0.5,
    drift: Math.random() * 0.5 - 0.25,
  }));
}

function drawSnow() {
  if (!snowActive) return;
  ctx.clearRect(0, 0, snowCanvas.width, snowCanvas.height);

  snowflakes.forEach((flake) => {
    flake.y += flake.speed;
    flake.x += flake.drift;

    if (flake.y > snowCanvas.height) flake.y = -5;
    if (flake.x > snowCanvas.width) flake.x = 0;
    if (flake.x < 0) flake.x = snowCanvas.width;

    ctx.beginPath();
    ctx.arc(flake.x, flake.y, flake.radius, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
    ctx.fill();
  });

  requestAnimationFrame(drawSnow);
}

function toggleSnow() {
  snowActive = !snowActive;
  snowToggle.setAttribute('aria-pressed', String(snowActive));
  snowToggle.textContent = snowActive ? 'snow: on' : 'snow: off';
  if (snowActive) {
    drawSnow();
  } else {
    ctx.clearRect(0, 0, snowCanvas.width, snowCanvas.height);
  }
}

function fetchJSON(path) {
  return fetch(path).then((res) => {
    if (!res.ok) throw new Error('Failed to load ' + path);
    return res.json();
  });
}

function renderBooks(books) {
  booksGrid.innerHTML = '';
  books.forEach((book) => {
    const card = document.createElement('article');
    card.className = 'card book-card';

    const cover = document.createElement('img');
    cover.className = 'cover';
    cover.alt = `${book.title} cover`;
    cover.loading = 'lazy';
    cover.src = `https://covers.openlibrary.org/b/isbn/${book.isbn}-L.jpg`;
    cover.onerror = () => {
      cover.onerror = null;
      cover.src = 'assets/logo.svg';
      cover.style.objectFit = 'contain';
      cover.style.background = '#fff';
    };

    const body = document.createElement('div');
    const title = document.createElement('h3');
    title.textContent = book.title;

    const meta = document.createElement('p');
    meta.className = 'meta';
    meta.textContent = `${book.author} · ISBN ${book.isbn}`;

    const status = document.createElement('span');
    status.className = 'status';
    status.textContent = book.status;

    body.append(title, meta, status);
    card.append(cover, body);
    booksGrid.append(card);
  });
}

function renderPosts(posts) {
  writingList.innerHTML = '';
  posts.forEach((post) => {
    const card = document.createElement('a');
    card.className = 'card';
    card.href = post.url || '#';
    card.target = post.url ? '_blank' : '_self';
    card.rel = post.url ? 'noreferrer' : '';

    const title = document.createElement('h3');
    title.textContent = post.title;

    const summary = document.createElement('p');
    summary.textContent = post.summary;

    card.append(title, summary);
    writingList.append(card);
  });
}

function init() {
  resizeCanvas();
  createSnowflakes();
  drawSnow();

  snowToggle.addEventListener('click', toggleSnow);
  window.addEventListener('resize', () => {
    resizeCanvas();
    createSnowflakes();
  });

  fetchJSON('data/books.json').then(renderBooks).catch((err) => {
    booksGrid.innerHTML = `<p class="meta">${err.message}</p>`;
  });

  fetchJSON('data/posts.json').then(renderPosts).catch((err) => {
    writingList.innerHTML = `<p class="meta">${err.message}</p>`;
  });
}

init();
