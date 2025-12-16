import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const booksPath = path.join(root, 'data', 'books.json');
const coversDir = path.join(root, 'assets', 'covers');
const PLACEHOLDER = '/assets/covers/placeholder.svg';
const RATE_LIMIT_MS = 200;
const downloadMode = process.argv.includes('--download');

if (!fs.existsSync(coversDir)) {
  fs.mkdirSync(coversDir, { recursive: true });
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const mimeToExt = (type = '') => {
  if (type.includes('png')) return 'png';
  if (type.includes('webp')) return 'webp';
  if (type.includes('svg')) return 'svg';
  return 'jpg';
};

const normalizeCoverPath = (p = '') => (p.startsWith('/') ? p : `/${p}`);

const slugify = (book) => {
  const base = `${book.title || 'book'}-${book.author || 'author'}`;
  const isbn = book.isbn13 || book.isbn10 || '';
  return [base, isbn]
    .filter(Boolean)
    .join('-')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
};

const fileExists = async (p) => {
  try {
    await fs.promises.access(p, fs.constants.F_OK);
    return true;
  } catch (err) {
    return false;
  }
};

async function validateRemoteImage(url) {
  if (!url) return null;
  try {
    const res = await fetch(url, { redirect: 'follow' });
    if (!res.ok) return null;
    const contentType = res.headers.get('content-type') || '';
    if (!contentType.startsWith('image/')) return null;
    await sleep(RATE_LIMIT_MS);
    return url;
  } catch (err) {
    console.warn('Remote check failed', url, err.message);
    return null;
  }
}

async function downloadImage(url, slugBase) {
  try {
    const res = await fetch(url, { redirect: 'follow' });
    if (!res.ok) return null;
    const contentType = res.headers.get('content-type') || '';
    if (!contentType.startsWith('image/')) return null;
    const buffer = Buffer.from(await res.arrayBuffer());
    const ext = mimeToExt(contentType);
    const filename = `${slugBase}.${ext}`;
    const dest = path.join(coversDir, filename);
    await fs.promises.writeFile(dest, buffer);
    await sleep(RATE_LIMIT_MS);
    return normalizeCoverPath(path.posix.join('assets', 'covers', filename));
  } catch (err) {
    console.warn('Failed downloading', url, err.message);
    return null;
  }
}

const tryOpenLibraryIsbn = async (isbn) =>
  validateRemoteImage(`https://covers.openlibrary.org/b/isbn/${isbn}-L.jpg?default=false`);

const tryOpenLibraryOlid = async (olid) =>
  validateRemoteImage(`https://covers.openlibrary.org/b/olid/${olid}-L.jpg?default=false`);

async function tryGoogleVolume(volumeId) {
  try {
    const res = await fetch(
      `https://www.googleapis.com/books/v1/volumes/${encodeURIComponent(volumeId)}?fields=volumeInfo(imageLinks)`
    );
    if (!res.ok) return null;
    const data = await res.json();
    const links = data.volumeInfo?.imageLinks;
    const thumb = links?.extraLarge || links?.large || links?.thumbnail || links?.smallThumbnail;
    return validateRemoteImage(thumb);
  } catch (err) {
    console.warn('Google volume lookup failed', err.message);
    return null;
  }
}

async function tryGoogleIsbn(isbn) {
  try {
    const res = await fetch(
      `https://www.googleapis.com/books/v1/volumes?q=isbn:${encodeURIComponent(isbn)}&maxResults=1&fields=items(id,volumeInfo/imageLinks)`
    );
    if (!res.ok) return null;
    const data = await res.json();
    const volume = data.items?.[0];
    const links = volume?.volumeInfo?.imageLinks;
    const thumb = links?.extraLarge || links?.large || links?.thumbnail || links?.smallThumbnail;
    return validateRemoteImage(thumb);
  } catch (err) {
    console.warn('Google ISBN lookup failed', err.message);
    return null;
  }
}

async function tryGoogleSearch(book) {
  if (!book.title || !book.author) return null;
  const query = `intitle:${book.title}+inauthor:${book.author}`;
  try {
    const res = await fetch(
      `https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(query)}&maxResults=1&fields=items(volumeInfo/title,volumeInfo/authors,volumeInfo/imageLinks)`
    );
    if (!res.ok) return null;
    const data = await res.json();
    const volume = data.items?.[0]?.volumeInfo;
    if (!volume) return null;
    const authorMatches = (volume.authors || []).some((a) => a.toLowerCase().includes((book.author || '').toLowerCase()));
    const titleMatches = (volume.title || '').toLowerCase().includes((book.title || '').toLowerCase().slice(0, 10));
    if (!authorMatches || !titleMatches) return null;
    const links = volume.imageLinks;
    const thumb = links?.extraLarge || links?.large || links?.thumbnail || links?.smallThumbnail;
    return validateRemoteImage(thumb);
  } catch (err) {
    console.warn('Google search lookup failed', err.message);
    return null;
  }
}

async function resolveRemoteCover(book) {
  const isbnCandidates = [book.isbn13, book.isbn10, book.isbn]
    .filter(Boolean)
    .map((id) => String(id).replace(/[^0-9X]/gi, ''));

  const orderedLookups = [];

  if (book.coverRemote) {
    orderedLookups.push(() => validateRemoteImage(book.coverRemote));
  }

  isbnCandidates.forEach((isbn) => {
    orderedLookups.push(() => tryOpenLibraryIsbn(isbn));
  });

  if (book.olid) {
    orderedLookups.push(() => tryOpenLibraryOlid(book.olid));
  }

  if (book.googleVolumeId) {
    orderedLookups.push(() => tryGoogleVolume(book.googleVolumeId));
  }

  isbnCandidates.forEach((isbn) => {
    orderedLookups.push(() => tryGoogleIsbn(isbn));
  });

  orderedLookups.push(() => tryGoogleSearch(book));

  for (const attempt of orderedLookups) {
    const found = await attempt();
    if (found) return found;
  }

  return null;
}

async function processBook(book) {
  const slugBase = slugify(book);
  const override = book.coverOverride;

  if (override) {
    const normalized = normalizeCoverPath(override.replace(/^\//, ''));
    const localPath = path.join(root, normalized.replace(/^\//, ''));
    if (await fileExists(localPath)) {
      book.cover = normalized;
      return;
    }
    console.warn('coverOverride missing, using placeholder:', override);
  }

  const existingCover = book.cover;
  if (existingCover && existingCover.startsWith('/')) {
    const normalized = normalizeCoverPath(existingCover.replace(/^\//, ''));
    const localPath = path.join(root, normalized.replace(/^\//, ''));
    if (await fileExists(localPath)) {
      book.cover = normalized;
      return;
    }
  }

  book.cover = PLACEHOLDER;

  const remote = await resolveRemoteCover(book);
  book.coverRemote = remote || null;

  if (downloadMode && remote) {
    const saved = await downloadImage(remote, slugBase);
    if (saved) {
      book.cover = saved;
    }
  }
}

async function run() {
  const books = JSON.parse(await fs.promises.readFile(booksPath, 'utf8'));

  for (const book of books) {
    await processBook(book);
  }

  await fs.promises.writeFile(booksPath, JSON.stringify(books, null, 2) + '\n');
  console.log(`Covers processed in ${downloadMode ? 'download' : 'metadata'} mode.`);
}

run().catch((err) => {
  console.error('Failed to resolve covers', err);
  process.exitCode = 1;
});
