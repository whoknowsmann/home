# who knows, man

Tiny personal corner of the internet. Static files, scribbled logo, books and posts pulled from JSON. No frameworks to babysit.

## How to poke at it locally

1. Open a terminal in the repo root.
2. Run a quick static server. Python works fine:
   ```bash
   python3 -m http.server 3000
   ```
3. Visit [http://localhost:3000](http://localhost:3000) and click around.

### Swap in new books or posts

- All the lists live in `data/`. Add a new object to `data/books.json` or `data/posts.json` and reload the page.
- A book entry is just `{ "id": "123", "title": "Your Book", "author": "You" }`. Google Books gets poked with the title/author to find a cover; if you have a reliable ISBN, add an `isbn` field as a backup for Open Library.
- Want something to surface on the homepage shelf? Add `"featured": true` to that book.

## Ship it to Vercel

- `npm i -g vercel` if you want the CLI. Or use the dashboard; either way is fine.
- From the repo root, `vercel` and accept the defaults. It detects a static site, no build step needed.
- When you're ready for production: `vercel --prod`.

## Pointing whoknowsman.com

- In the Vercel project, go to **Settings → Domains** and add `whoknowsman.com` (and `www` if you want it).
- If the domain lives elsewhere, add the A/CNAME records Vercel gives you or switch nameservers to them.
- Wait a bit for DNS to catch up; HTTPS is automatic once it resolves.
