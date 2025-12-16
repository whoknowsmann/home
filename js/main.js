const bookGrids = document.querySelectorAll('[data-books-grid], #books-grid');
const writingList = document.getElementById('writing-list');
const snowToggle = document.getElementById('snow-toggle');
const snowCanvas = document.getElementById('snow-canvas');
const ctx = snowCanvas ? snowCanvas.getContext('2d') : null;
let snowflakes = [];
let snowActive = true;
const lookupCache = new Map();
const detailCache = new Map();
const ratingCache = new Map();
const PLACEHOLDER_COVER = '/assets/covers/placeholder.svg';
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
  const cacheKey = book.isbn13 || book.isbn10 || book.isbn || book.id || `${book.title}|${book.author || ''}`;
  if (lookupCache.has(cacheKey)) return lookupCache.get(cacheKey);

  const base = { title: book.title, author: book.author };
  const titleQuery = book.lookupTitle || book.title || '';
  const authorQuery = book.author || '';
  const isbnQuery = book.isbn13 || book.isbn10 || book.isbn;
  const query = isbnQuery
    ? `isbn:${encodeURIComponent(isbnQuery)}`
    : `intitle:${encodeURIComponent(titleQuery)}${authorQuery ? `+inauthor:${encodeURIComponent(authorQuery)}` : ''}`;
  const googleUrl = `https://www.googleapis.com/books/v1/volumes?q=${query}&maxResults=1&fields=items(volumeInfo(title,authors,description,imageLinks,industryIdentifiers))`;

  const info = { ...base };

  try {
    const res = await fetch(googleUrl);
    if (res.ok) {
      const data = await res.json();
      if (data.items && data.items.length) {
        const volume = data.items[0].volumeInfo;
        const normalizedIsbn = (isbnQuery || '').replace(/[^0-9X]/gi, '');
        const identifiers = volume.industryIdentifiers || [];
        const isbnMatches = normalizedIsbn
          ? identifiers.some((id) => (id.identifier || '').replace(/[^0-9X]/gi, '') === normalizedIsbn)
          : false;

        const targetLastName = authorLastName(book.author);
        const volumeAuthors = (volume.authors && volume.authors.join(' ')) || '';
        const authorMatches = targetLastName
          ? volumeAuthors.toLowerCase().includes(targetLastName)
          : false;

        if (isbnMatches || authorMatches) {
          if (volume.description) info.description = volume.description;
        }
      }
    }
  } catch (err) {
    console.warn('Book lookup failed', err);
  }

  if (!info.description && isbnQuery) {
    try {
      const search = await fetch(`https://openlibrary.org/search.json?isbn=${encodeURIComponent(isbnQuery)}`);
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

function authorLastName(author = '') {
  const parts = author.trim().split(/\s+/);
  return parts.length ? parts[parts.length - 1].toLowerCase() : '';
}

function seriesOrderFromTitle(title = '') {
  const match = title.match(/#(\d+)/);
  return match ? Number(match[1]) : Number.POSITIVE_INFINITY;
}

function seriesNameFromTitle(title = '') {
  const match = title.match(/\(([^#)]+)#\d+/);
  return match ? match[1].trim().toLowerCase() : '';
}

function sortBooks(list) {
  return [...list].sort((a, b) => {
    const lastA = authorLastName(a.author);
    const lastB = authorLastName(b.author);
    if (lastA !== lastB) return lastA.localeCompare(lastB);

    const seriesA = seriesNameFromTitle(a.title);
    const seriesB = seriesNameFromTitle(b.title);
    if (seriesA !== seriesB) return seriesA.localeCompare(seriesB);

    const seriesOrderA = seriesOrderFromTitle(a.title);
    const seriesOrderB = seriesOrderFromTitle(b.title);
    if (seriesOrderA !== seriesOrderB) return seriesOrderA - seriesOrderB;

    return (a.title || '').localeCompare(b.title || '');
  });
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
  const cacheKey = book.isbn13 || book.isbn10 || book.isbn || book.id || book.title;
  const merged = detailCache.has(cacheKey)
    ? detailCache.get(cacheKey)
    : { ...book, cover: book.cover || PLACEHOLDER_COVER };

  modalTitle.textContent = merged.title;
  modalAuthor.textContent = merged.author || '';

  modalCover.src = merged.cover || PLACEHOLDER_COVER;
  modalCover.alt = `${merged.title} cover`;
  modalRatings.innerHTML = '';

  const info = detailCache.has(cacheKey) ? merged : await lookupBookData(book);
  const hydrated = { ...merged, ...info };
  detailCache.set(cacheKey, hydrated);

  const cleanDescription = stripTags(
    hydrated.description || 'No description yet. ISBNs should pull one soon.'
  );
  const { excerpt, full, hasMore } = buildExcerpt(cleanDescription, 2);

  modalDescription.textContent = excerpt;
  modalDescription.dataset.excerpt = excerpt;
  modalDescription.dataset.full = full || excerpt;
  modalReadMore.hidden = !hasMore;
  modalReadMore.textContent = hasMore ? '…read more' : '';

  modalCover.onerror = () => {
    modalCover.onerror = null;
    modalCover.src = PLACEHOLDER_COVER;
  };
  modalCover.src = hydrated.cover || PLACEHOLDER_COVER;

  const grRating = await fetchGoodreadsRating(book);
  const wkRating =
    typeof hydrated.wkRating === 'number'
      ? `${hydrated.wkRating.toFixed(1)} / 5`
      : 'Not rated yet';

  const goodreadsId = hydrated.goodreadsId || hydrated.id;
  const goodreadsUrl = goodreadsId
    ? `https://www.goodreads.com/book/show/${goodreadsId}`
    : null;

  const ratingList = document.createElement('ul');
  const grItem = document.createElement('li');
  const grLabel = document.createElement('strong');
  grLabel.textContent = 'Goodreads:';
  grItem.append(grLabel, document.createTextNode(' '));

  if (goodreadsUrl) {
    const link = document.createElement('a');
    link.href = goodreadsUrl;
    link.target = '_blank';
    link.rel = 'noreferrer noopener';
    link.textContent = grRating ? `${grRating} / 5` : 'View on Goodreads';
    grItem.append(link);
  } else {
    grItem.append(document.createTextNode(grRating ? `${grRating} / 5` : 'N/A'));
  }

  const wkItem = document.createElement('li');
  const wkLabel = document.createElement('strong');
  wkLabel.textContent = 'who knows, man:';
  wkItem.append(wkLabel, document.createTextNode(` ${wkRating}`));

  ratingList.append(grItem, wkItem);

  modalRatings.append(ratingList);
  modal.classList.add('open');
  document.body.style.overflow = 'hidden';
}

function renderBooks(grid, books) {
  grid.innerHTML = '';

  books.forEach((book) => {
    const card = document.createElement('article');
    card.className = 'card book-card';
    card.tabIndex = 0;

    const cover = document.createElement('img');
    cover.className = 'cover';
    cover.alt = `${book.title} cover`;
    cover.loading = 'lazy';
    cover.src = book.cover || PLACEHOLDER_COVER;
    cover.onerror = () => {
      cover.onerror = null;
      cover.src = PLACEHOLDER_COVER;
      cover.style.objectFit = 'contain';
      cover.style.background = '#fff';
    };

    const body = document.createElement('div');
    body.className = 'book-card-body';

    const title = document.createElement('h3');
    title.textContent = book.title;

    const authorLine = document.createElement('p');
    authorLine.className = 'author-line';
    authorLine.textContent = book.author || '';

    const meta = document.createElement('p');
    meta.className = 'meta';
    const bits = [];
    if (book.genre) bits.push(book.genre);
    if (book.status) bits.push(book.status);
    meta.textContent = bits.join(' · ');

    const status = book.status ? document.createElement('span') : null;
    if (status) {
      status.className = 'status';
      status.textContent = book.status;
      body.append(title, authorLine, meta, status);
    } else {
      body.append(title, authorLine, meta);
    }

    card.append(cover, body);
    card.addEventListener('click', () => openBookModal(book));
    card.addEventListener('keypress', (evt) => {
      if (evt.key === 'Enter') openBookModal(book);
    });
    grid.append(card);
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

  if (bookGrids.length) {
    fetchJSON('data/books.json')
      .then((books) => {
        bookGrids.forEach((grid) => {
          const limit = grid.dataset.limit ? Number(grid.dataset.limit) : null;
          const featuredOnly = grid.dataset.featured === 'true';
          const currentlyReadingOnly = grid.dataset.currentlyReading === 'true';

          let selection = [...books];
          if (currentlyReadingOnly) selection = selection.filter((book) => book.status === 'Currently reading');
          if (featuredOnly) selection = selection.filter((book) => book.featured);
          selection = sortBooks(selection);
          if (limit) selection = selection.slice(0, limit);

          try {
            renderBooks(grid, selection);
          } catch (err) {
            grid.innerHTML = `<p class="meta">${err.message}</p>`;
          }
        });
      })
      .catch((err) => {
        bookGrids.forEach((grid) => {
          grid.innerHTML = `<p class="meta">${err.message}</p>`;
        });
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
