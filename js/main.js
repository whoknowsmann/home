const booksGrid = document.getElementById('books-grid');
const writingList = document.getElementById('writing-list');
const snowToggle = document.getElementById('snow-toggle');
const snowCanvas = document.getElementById('snow-canvas');
const ctx = snowCanvas ? snowCanvas.getContext('2d') : null;
let snowflakes = [];
let snowActive = true;
const lookupCache = new Map();
const ratingCache = new Map();
let modal;
let modalContent;
let modalClose;
let modalCover;
let modalTitle;
let modalAuthor;
let modalDescription;
let modalRatings;
let modalReadMore;

function stripTags(text) {
  const temp = document.createElement('div');
  temp.innerHTML = text || '';
  return (temp.textContent || '').trim();
}

function buildExcerpt(text, sentenceLimit = 2) {
  const sentences = text.split(/(?<=[.!?])\s+/).filter(Boolean);

  if (sentences.length <= sentenceLimit) {
    return { excerpt: text, hasMore: false };
  }

  const excerpt = sentences.slice(0, sentenceLimit).join(' ');
  return { excerpt, full: sentences.join(' '), hasMore: true };
}

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

  const query = book.isbn
    ? `isbn:${encodeURIComponent(book.isbn)}`
    : encodeURIComponent(`${book.title} ${book.author || ''}`.trim());
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
        if (volume.description) info.description = volume.description;
      }
    }
  } catch (err) {
    console.warn('Book lookup failed', err);
  }

  if (!info.description && book.isbn) {
    try {
      const search = await fetch(
        `https://openlibrary.org/search.json?isbn=${encodeURIComponent(book.isbn)}`
      );
      if (search.ok) {
        const results = await search.json();
        if (results.docs && results.docs.length && results.docs[0].key) {
          const workKey = results.docs[0].key;
          const workRes = await fetch(`https://openlibrary.org${workKey}.json`);
          if (workRes.ok) {
            const work = await workRes.json();
            if (typeof work.description === 'string') info.description = work.description;
            if (work.description?.value) info.description = work.description.value;
          }
        }
      }
    } catch (err) {
      console.warn('Open Library lookup failed', err);
    }
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

async function fetchGoodreadsRating(book) {
  const goodreadsId = book.goodreadsId || book.id;
  if (!goodreadsId) return null;
  if (ratingCache.has(goodreadsId)) return ratingCache.get(goodreadsId);

  const ratingUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(
    `https://www.goodreads.com/book/show/${goodreadsId}`
  )}`;

  try {
    const res = await fetch(ratingUrl);
    if (!res.ok) throw new Error('Could not load Goodreads page');
    const html = await res.text();
    const match = html.match(/itemprop="ratingValue"[^>]*>([0-9.]+)/);
    const rating = match ? Number(match[1]).toFixed(2) : null;
    ratingCache.set(goodreadsId, rating);
    return rating;
  } catch (err) {
    console.warn('Goodreads rating lookup failed', err);
    ratingCache.set(goodreadsId, null);
    return null;
  }
}

function clampTitle(text, max = 45) {
  if (!text) return '';
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function ensureModal() {
  if (modal) return;

  modal = document.createElement('div');
  modal.className = 'modal';
  modal.id = 'book-modal';

  modalContent = document.createElement('div');
  modalContent.className = 'modal-content card';

  modalClose = document.createElement('button');
  modalClose.className = 'modal-close';
  modalClose.setAttribute('aria-label', 'Close dialog');
  modalClose.textContent = '×';

  const modalBody = document.createElement('div');
  modalBody.className = 'modal-body';

  modalCover = document.createElement('img');
  modalCover.className = 'modal-cover';
  modalCover.alt = '';
  modalCover.loading = 'lazy';

  const details = document.createElement('div');
  details.className = 'modal-details';

  modalTitle = document.createElement('h3');
  modalAuthor = document.createElement('p');
  modalAuthor.className = 'meta';

  modalDescription = document.createElement('p');
  modalDescription.className = 'modal-description';

  modalRatings = document.createElement('div');
  modalRatings.className = 'modal-ratings';

  modalReadMore = document.createElement('button');
  modalReadMore.type = 'button';
  modalReadMore.className = 'read-more';
  modalReadMore.textContent = '…read more';
  modalReadMore.hidden = true;

  modalReadMore.addEventListener('click', () => {
    const full = modalDescription.dataset.full;
    const current = modalDescription.textContent;
    if (!full || current === full) {
      modalDescription.textContent = modalDescription.dataset.excerpt || current;
      modalReadMore.textContent = '…read more';
    } else {
      modalDescription.textContent = full;
      modalReadMore.textContent = 'show less';
    }
  });

  details.append(modalTitle, modalAuthor, modalDescription, modalReadMore, modalRatings);
  modalBody.append(modalCover, details);
  modalContent.append(modalClose, modalBody);
  modal.append(modalContent);
  document.body.append(modal);

  modal.addEventListener('click', (e) => {
    if (e.target === modal) closeModal();
  });

  modalClose.addEventListener('click', closeModal);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeModal();
  });
}

function closeModal() {
  if (!modal) return;
  modal.classList.remove('open');
  document.body.style.overflow = '';
}

async function openBookModal(book) {
  ensureModal();
  modalTitle.textContent = book.title;
  modalAuthor.textContent = book.author || '';

  const cleanDescription = stripTags(
    book.description || 'No description yet. ISBNs should pull one soon.'
  );
  const { excerpt, full, hasMore } = buildExcerpt(cleanDescription, 2);

  modalDescription.textContent = excerpt;
  modalDescription.dataset.excerpt = excerpt;
  modalDescription.dataset.full = full || excerpt;
  modalReadMore.hidden = !hasMore;
  modalReadMore.textContent = hasMore ? '…read more' : '';

  modalCover.src = book.cover;
  modalCover.alt = `${book.title} cover`;
  modalRatings.innerHTML = '';

  const grRating = await fetchGoodreadsRating(book);
  const wkRating =
    typeof book.wkRating === 'number' ? `${book.wkRating.toFixed(1)} / 5` : 'Not rated yet';

  const ratingList = document.createElement('ul');
  ratingList.innerHTML = `
    <li><strong>Goodreads:</strong> ${grRating ? `${grRating} / 5` : 'N/A'}</li>
    <li><strong>who knows, man:</strong> ${wkRating}</li>
  `;

  modalRatings.append(ratingList);
  modal.classList.add('open');
  document.body.style.overflow = 'hidden';
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
    card.tabIndex = 0;

    const cover = document.createElement('img');
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
    title.textContent = clampTitle(book.title);

    const meta = document.createElement('p');
    meta.className = 'meta';
    const bits = [];
    if (book.author) bits.push(book.author);
    if (book.status) bits.push(book.status);
    if (book.isbn) bits.push(`ISBN ${book.isbn}`);
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
    card.addEventListener('click', () => openBookModal(book));
    card.addEventListener('keypress', (evt) => {
      if (evt.key === 'Enter') openBookModal(book);
    });
    booksGrid.append(card);
  });
}

function renderPosts(posts) {
  writingList.innerHTML = '';
  posts.forEach((post) => {
    const card = document.createElement('a');
    card.className = 'card post-card';
    card.href = post.url || '#';

    if (post.image) {
      const thumb = document.createElement('img');
      thumb.className = 'post-thumb';
      thumb.loading = 'lazy';
      thumb.alt = `${post.title} photo`;
      thumb.src = post.image;
      card.append(thumb);
    }

    const body = document.createElement('div');
    body.className = 'post-card-body';

    const title = document.createElement('h3');
    title.textContent = post.title;

    const summary = document.createElement('p');
    summary.textContent = post.summary;

    body.append(title, summary);
    card.append(body);
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
