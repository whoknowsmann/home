# who knows, man

Tiny personal corner of the internet. Static files, bold wordmark, books and posts pulled from JSON. No frameworks to babysit.

## How to poke at it locally

1. Open a terminal in the repo root.
2. Run a quick static server. Python works fine:
   ```bash
   python3 -m http.server 3000
   ```
3. Visit [http://localhost:3000](http://localhost:3000) and click around.

### Swap in new books or posts

- All the lists live in `data/`. Add a new object to `data/books.json` or `data/posts.json` and reload the page.
- A book entry is `{ "title": "Your Book", "author": "You", "isbn13": "978..." }` plus optional `isbn10`, `olid`, or `googleVolumeId` to make cover resolution easier. Add `"wkRating": 4.5` if you want to show your own rating, and the Goodreads ID can sit in `"id"` to power the community rating lookup.
- Mark the active stack with `"status": "Currently reading"`; those float to the homepage and the top of the bookshelf page. `"featured": true` is optional if you want to highlight something later.
- Blog posts live in `/posts/{slug}.html`. Point each entry’s `url` at that page and toss an `image` URL in the JSON if you want a thumbnail on the cards.

### Covers are local, predictable, and safe

- Runtime never hotlinks covers. Cards read the `cover` path from `data/books.json`; if it's missing or a file fails to load, `/assets/covers/placeholder.svg` shows instead.
- Default resolver mode (metadata only):

  ```bash
  npm run resolve-covers
  ```

  This updates `coverRemote` hints in the JSON without downloading anything, so the repo stays text-only.

- Download mode (run locally when you want real covers):

  ```bash
  npm run resolve-covers -- --download
  ```

  This saves images into `assets/covers/` and rewrites `cover` to point at those files. Commit the images via normal git when you're not constrained by the Codex PR flow (which blocks binaries).

- If a book is stubborn, add identifiers (`isbn13`, `olid`, `googleVolumeId`) or drop your own file into `assets/covers/` and set `"coverOverride": "/assets/covers/your-file.jpg"`. The placeholder will still render if the file is missing.

## Ship it to Vercel

- `npm i -g vercel` if you want the CLI. Or use the dashboard; either way is fine.
- From the repo root, `vercel` and accept the defaults. It detects a static site, no build step needed.
- When you're ready for production: `vercel --prod`.

## Pointing whoknowsman.com

- In the Vercel project, go to **Settings → Domains** and add `whoknowsman.com` (and `www` if you want it).
- If the domain lives elsewhere, add the A/CNAME records Vercel gives you or switch nameservers to them.
- Wait a bit for DNS to catch up; HTTPS is automatic once it resolves.
