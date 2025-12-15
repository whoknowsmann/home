const booksGrid = document.getElementById('books-grid');
const writingList = document.getElementById('writing-list');
const snowToggle = document.getElementById('snow-toggle');
const snowCanvas = document.getElementById('snow-canvas');
const ctx = snowCanvas ? snowCanvas.getContext('2d') : null;
let snowflakes = [];
let snowActive = true;
const lookupCache = new Map();

function resizeCanvas() {
  if (!snowCanvas) return;
  snowCanvas.width = window.innerWidth;
  snowCanvas.height = window.innerHeight;
}

function createSnowflakes(count = 120) {
  if (!snowCanvas) return;
  snowflakes = Array.from({ length: count }, () => ({
    x: Math.random() * snowCanvas.width,
    y: Math.random() * snowCanvas.height,
    radius: Math.random() * 2 + 1,
    speed: Math.random() * 1 + 0.5,
    drift: Math.random() * 0.5 - 0.25,
  }));
}

function drawSnow() {
  if (!snowCanvas || !ctx) return;
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
  if (!snowToggle) return;
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

async function lookupBookData(book) {
  const cacheKey = `${book.title}|${book.author || ''}`;
  if (lookupCache.has(cacheKey)) return lookupCache.get(cacheKey);

  const query = encodeURIComponent(`${book.title} ${book.author || ''}`.trim());
  const googleUrl = `https://www.googleapis.com/books/v1/volumes?q=${query}&maxResults=1`;

  let info = { title: book.title, author: book.author };

  try {
    const res = await fetch(googleUrl);
    if (res.ok) {
      const data = await res.json();
      if (data.items && data.items.length) {
        const volume = data.items[0].volumeInfo;
        info.title = volume.title || info.title;
        info.author = (volume.authors && volume.authors.join(', ')) || info.author;
        const cover = volume.imageLinks?.thumbnail || volume.imageLinks?.smallThumbnail;
        if (cover) info.cover = cover.replace('http://', 'https://');
      }
    }
  } catch (err) {
    console.warn('Book lookup failed', err);
  }

  if (!info.cover) {
    const coverId = book.isbn || book.id;
    info.cover = coverId
      ? `https://covers.openlibrary.org/b/isbn/${coverId}-L.jpg`
      : 'assets/logo.svg';
  }

  lookupCache.set(cacheKey, info);
  return info;
}

async function renderBooks(books) {
  booksGrid.innerHTML = '';

  const enriched = await Promise.all(
    books.map(async (book) => {
      const info = await lookupBookData(book);
      return { ...book, ...info };
    })
  );

  enriched.forEach((book) => {
    const card = document.createElement('article');
    card.className = 'card book-card';

    const cover = document.createElement('img');
    const coverId = book.isbn || book.id;
    cover.className = 'cover';
    cover.alt = `${book.title} cover`;
    cover.loading = 'lazy';
    cover.src = book.cover;
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
    const bits = [];
    if (book.author) bits.push(book.author);
    if (book.status) bits.push(book.status);
    if (coverId) bits.push(`ID ${coverId}`);
    meta.textContent = bits.join(' · ');

    const status = book.status ? document.createElement('span') : null;
    if (status) {
      status.className = 'status';
      status.textContent = book.status;
      body.append(title, meta, status);
    } else {
      body.append(title, meta);
    }

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
  if (snowCanvas && snowToggle) {
    resizeCanvas();
    createSnowflakes();
    drawSnow();

    snowToggle.addEventListener('click', toggleSnow);
    window.addEventListener('resize', () => {
      resizeCanvas();
      createSnowflakes();
    });
  }

  if (booksGrid) {
    const limit = booksGrid.dataset.limit ? Number(booksGrid.dataset.limit) : null;
    const featuredOnly = booksGrid.dataset.featured === 'true';

    fetchJSON('data/books.json')
      .then((books) => {
        let selection = books;
        if (featuredOnly) selection = selection.filter((book) => book.featured);
        if (limit) selection = selection.slice(0, limit);
        return renderBooks(selection);
      })
      .catch((err) => {
        booksGrid.innerHTML = `<p class="meta">${err.message}</p>`;
      });
  }

  if (writingList) {
    fetchJSON('data/posts.json')
      .then(renderPosts)
      .catch((err) => {
        writingList.innerHTML = `<p class="meta">${err.message}</p>`;
      });
  }
}

init();
