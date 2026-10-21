# Widoph Logistics – website & back office

Australia → Nigeria freight site for **WIDOPH LOGISTICS PTY LTD** (demo prepared by Fredrick Abodunrin).
Node.js serverless API + MongoDB, static frontend with a Three.js globe. Deploys to Vercel as-is.

## What's in it

**Homepage** (`/`)
- 3D dotted-earth globe with animated Sydney → Lagos air route and sea lane (falls back to the original SVG illustration without WebGL; respects reduced motion)
- Instant quote form → saved to MongoDB, reference number, WhatsApp follow-up link. No prices are calculated (pricing basis not yet confirmed – placeholder note kept in the form)
- Live shipment tracking (`WDP-DEMO-1024` is the demo), shareable links like `/?track=WDP-XXXX-XXXX`
- Sydney LCL schedule loaded from the database (placeholder rows until real dates are entered)
- Services, How it works, Guide teaser, Why Widoph, FAQ, contact footer, floating WhatsApp / call buttons

**Back office** (`/admin`, password protected)
- Quote inbox with live refresh, status pipeline (new → contacted → quoted → won / lost), internal notes, one-tap WhatsApp / email / call, CSV export
- Convert a quote into a shipment → generates a tracking number
- Move shipments through the six tracking stages with location + customer-facing notes
- Edit the Sydney LCL schedule shown on the homepage

## Run locally

```bash
npm install
cp .env.example .env      # optional – without MONGODB_URI data lives in memory
npm run dev               # http://localhost:3000  ·  admin: /admin
```

Locally, without `ADMIN_PASSWORD`, the admin password is `widoph-admin`.

## Deploy to Vercel

1. Create a free MongoDB Atlas cluster, add a database user, and allow access from anywhere (`0.0.0.0/0`, Vercel uses dynamic IPs). Copy the connection string.
2. Push this folder to GitHub and import it in Vercel (framework preset: **Other** – `vercel.json` already sets the build and output directory).
3. Add environment variables in Vercel → Settings → Environment Variables:
   - `MONGODB_URI` – Atlas connection string
   - `ADMIN_PASSWORD` – back office password (**required**; admin is disabled in production without it)
   - optional: `MONGODB_DB` (default `widoph`), `AUTH_SECRET`, `RESEND_API_KEY` + `NOTIFY_EMAIL` to email the team on every new quote
4. Deploy. Indexes, the demo shipment and placeholder schedule rows are created automatically on the first request.

Check `/api/health` after deploying – it reports `"db": "mongodb"` when the database is connected.

## Project layout

```
api/          Vercel serverless functions (quotes, track, shipments, schedule, login, health)
lib/          shared server code – MongoDB access, auth, validation, email
src/globe.js  Three.js globe source → bundled to public/js/globe.js by `npm run build`
public/       static site: index.html, admin.html, css, js, assets
server.js     local dev server that mirrors Vercel routing
Homepage (responsive)-html/   original design reference (not deployed)
```

## Swapping the brand

Colours are placeholders: change `--navy` / `--accent` at the top of `public/css/styles.css` (and `admin.css`). The logo slot is the `.logo` block in the header and footer.

## Placeholders still to confirm with Widoph

FAQ answers, transit times, LCL schedule dates (enter them in `/admin`), the full guide link, pricing basis for an estimate, partner logo.
