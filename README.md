# who knows, man

A tiny, static-first personal site for notes, books, and whatever else is rattling around.

## Local development

This is just HTML/CSS/JS. Use any static server. Example with Python:

```bash
python3 -m http.server 3000
```

Then visit [http://localhost:3000](http://localhost:3000).

## Deploying to Vercel

1. Install the Vercel CLI if you want to deploy from the terminal:
   ```bash
   npm i -g vercel
   ```
2. From the repo root, run `vercel` and follow the prompts. It will detect this as a static site.
3. Future deploys are as easy as `vercel --prod`.

## Custom domain (whoknowsman.com)

1. In the Vercel dashboard, open the project and add the domain `whoknowsman.com` under **Settings → Domains**.
2. If the domain is registered elsewhere, point its nameservers to Vercel or add the provided A/CNAME records.
3. Wait for DNS to settle; Vercel handles the certificate automatically.
