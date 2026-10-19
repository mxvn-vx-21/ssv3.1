# $TENCYL V2 (Cloudflare Worker + D1) - Deployed

One Worker serves the public site (server-rendered from D1), `/dashboard`, and the API. **Nothing here touches your production database until you run the commands below yourself.**

## Upgrading an existing deployment (safe order)
1. Back up first: Dashboard → JSON Data → *Backup incl. inquiries*.
2. `wrangler d1 execute stencyl --remote --file=migrations/0002_v2.sql` — run **once**. Additive only: new columns on `inquiries` (existing rows get status `New`, notification status `unknown`) and new tables `versions`, `events`. Not repeatable (SQLite has no `ADD COLUMN IF NOT EXISTS`); a "duplicate column" error means it was already applied. Rollback notes are in the file.
3. `wrangler deploy`.
The Worker also runs *before* the migration (inquiries keep working; new features show "migration not applied"), so step order is forgiving. Existing live/draft/client content is read as-is and gets safe defaults for the new fields.
Fresh install: `schema.sql` then `migrations/0002_v2.sql`.

## Environment (Worker secrets — `wrangler secret put NAME`)
`ADMIN_PASSWORD` (12+ chars) · `RESEND_API_KEY` · `DISCORD_WEBHOOK_URL`. Never sent to the browser or included in exports. Local dev: `.dev.vars`.

## What's new
**Public:** mobile nav + active-section indicator + scroll progress, dark/light toggle (dark default; saved choice wins), loading state, availability chip (dashboard-controlled, off by default), project search/category filters/sorting/featured badges/detail dialog/copy-link (`/#project-<slug>`), Services, Process timeline, FAQ accordion, estimator (suggests one of your visible tiers, clamped to ₹250–₹1,000, can pre-fill the inquiry form), copy-brief, submission reference number, optional public contact email + copy button, back-to-top, offline notice, dynamic © year, custom 404, `robots.txt`, `sitemap.xml`, canonical + Open Graph tags, favicon/apple-touch/OG image generated from your logo. Fixed: nav links `#hero`/`#projects` now work.
**Dashboard:** real overview metrics + activity; Services/Process and FAQ managers (with "Add starter content"); project search/slug/details/bulk visibility; Inquiry CRM (status, tags, internal notes, filters, link to client draft, copy, CSV/JSON export, delete with confirm, per-channel email/Discord status, safe retry); client search/filter, 5 statuses, archive/restore, linked inquiries; Version History (snapshot per publish/restore, 50 kept, diff vs live or between versions, preview, restore as a *new* version); Analytics; Site Health; Ctrl/Cmd+S; save conflicts are rejected (revision check) instead of overwriting.

## Notes on behaviour
- Notification retry atomically claims a failed channel (`failed|pending → sending`) and sends Resend with an idempotency key, so it cannot duplicate the inquiry or an already-sent channel. If a Worker crashes mid-send a channel can stay `sending`; reset with `UPDATE inquiries SET email_status='failed' WHERE id='…'`.
- Pre-V2 inquiries have notification status `unknown` and are not retryable (we can't know what was delivered).
- Inquiry rate limit is now 5/hour/IP and only counts well-formed submissions.
- Analytics: counters per day/event/page/referrer-type/device only. No IPs, cookies or URLs stored; Do Not Track respected; only the live site reports (previews don't).
- Internal notes are stored only on the inquiry row; never in configs/exports. They appear in the inquiry export only if you tick "include internal notes". Content exports never contain inquiries; only *Backup* does.
- SEO: update your SEO description in the dashboard (stored copy has a typo and the older text). Meta tag text is set from there.

## JSON schema (v1, additive)
Config adds optional `site.availability{enabled,text}`, `site.contactEmail`, `projects[].slug/details`, `services[]`, `process[]`, `faq[]` (all `{…,visible,order}`). Older files without them still import. Pricing: whole numbers 250–1000, enforced on every write and import.

## Needs extra setup / not included
- **Media library / R2 uploads: not built.** Thumbnails remain URL references. Add an R2 binding and an upload route before offering uploads.
- Not built: dedicated project detail routes (dialog + hash links instead), drag-and-drop ordering (↑/↓ buttons), autosave, undo/redo, theme-color/3D-intensity/section-order editor, project-only JSON import/export, light theme for the dashboard (public site has it).
- Email requires a verified `stencylstudio.com` domain in Resend.

## Tests (`npm test`, Node 22)
Unit tests for the validator, pricing limits, CSV escaping, diff, normalization; integration tests run the real Worker against an in-memory SQLite stand-in for D1: auth, CSRF, login rate limit, optimistic concurrency, draft→publish→restore, client isolation and share-link hashing/revocation, inquiry flow, notification failure+retry, CRM filters, exports without secrets, import validation, analytics privacy, public routes.
**Not tested:** real Cloudflare D1/Workers runtime, real Resend/Discord delivery, browser rendering of the public site or dashboard (including the 3D scene and new UI), mobile layouts, R2.

---
# V3 — Interaction & motion
**Cursor (root cause fixed):** the old cursor was a 14px square that trailed the pointer, and nothing ever hid the native cursor, so both showed. It is gone. The new system is five inline-SVG states recreated from your reference images (outlined arrow, click sparkle, I-beam, spinner, prohibited), drawn in the browser's top layer (Popover API) so it also appears above the project dialog and command palette. The native cursor is hidden **only after a real mouse move has activated the custom one**; touch/coarse pointers, browsers without the Popover API, or any runtime error leave the native cursor untouched. `<select>`/date inputs use the native cursor (their popups are OS-drawn). Position is set directly from the pointer (no lag), tip hotspot aligned within 2px.
**Command palette:** Ctrl/Cmd+K or the header ⌕ button. Navigates to sections that actually exist/are visible, toggles theme, copies the contact email (if configured), back to top, searches projects, launches live URLs. Arrow keys / Home / End / Enter / Esc, `role=combobox`+`listbox`, native modal focus trap, scroll lock, focus restored; the shortcut is not hijacked while typing in a field. Public site only; the dashboard has its own navigation and is untouched.
**Motion:** word-masked headline reveal, staged hero (eyebrow → heading → text → CTAs), masked section titles with drawing divider lines and tracking-in labels, varied reveals (clip for cards/forms, scale for pricing, slide for process, rise for others), scroll-driven hero depth via CSS `animation-timeline` where supported, spring-physics `$` (pointer parallax, pointer-following light, click/tap kick, scroll-linked depth/lighting). Only transform/opacity/clip-path animate. No scroll hijacking. Reduced-motion: everything shows immediately.
**Glass:** pointer-tracking highlights on buttons/cards, ±6px magnet on primary CTAs only, subtle tilt (≤5–7°) on project cards only, hero spotlight, press/disabled/busy states, theme switch transitions colours only for 450ms.
**Not changed:** worker, API, database, dashboard. No migration needed for V3.
**Heads-up:** the hero headline is still your `hero.headline` setting (`$tencyl`); to match the reference, set it to the tagline in the dashboard.

## V3 verification
`npm test` (21 worker/validator tests) plus `tests/e2e` (needs `playwright` + Chromium): `node tests/e2e/render.mjs && python3 tests/e2e/e2e.py` — 40 checks covering cursor states/alignment/top-layer, palette, theme, reveal behaviour, touch, mobile and reduced motion. Last run: 40/40 in Chromium 141. **Not verified:** the WebGL `$` (three.js loads from a CDN that was unreachable in the test sandbox, so only the fallback was exercised), Firefox/Safari, real touch hardware, performance profiling.

---
# V3.1 — fixes + image host
**Fixed**
- **Footer invisible on the live site:** its reveal was observed on an inner box that is padded and shifted down, so at the very bottom of the page it never counted as "visible". Now the `<footer>` itself is observed, and reaching the bottom of the page reveals anything still hidden.
- **Hard edge in the hero:** the pointer spotlight was clipped to the hero's box (≈1200px wide), leaving a visible lighter/darker boundary. It is now full-width and fades out without edges.
- **Lighter band on a neighbouring box after a click:** not reproducible in headless Chromium; most likely a GPU-compositing artifact from the cursor's `mix-blend-mode: difference` layered over `backdrop-filter` panels. The blend mode is removed (the cursor now uses a dark halo to stay visible on any background). **Please confirm on your machine.**
- **`$` all white/flat:** `transmission` glass renders as a flat white shape on a transparent canvas. It is now polished dark glass/chrome (high-gloss, bright bevel reflections + soft edge lines) with a faint backglow. Not rendered here (three.js CDN unreachable in my sandbox) — tune `color`, `metalness`, `roughness`, `envMapIntensity` in the `const mat=new THREE.MeshPhysicalMaterial(...)` line.
- **Project thumbnails** are always 16:9 (`object-fit: cover`); the dashboard thumbnail preview too.

**Image host** — `https://stencylstudio.com/imghost` (sign in with the dashboard password; also linked in the dashboard sidebar)
- Upload (click or drag-drop), custom name, optional label; the image is then public at `https://stencylstudio.com/{name}` (`/{name}.png` etc. also resolve). Copy URL, Replace (same name), Delete, search.
- Names: a–z, 0–9, `-`, `_` (1–60). Reserved: dashboard, imghost, api, preview, p, robots, sitemap, favicon, og, apple-touch-icon, index, admin, assets, static, login, logout.
- Accepted: PNG, JPEG, GIF, WebP, AVIF, verified from the file's **bytes** (renamed text files and SVG are refused). Served with `nosniff`, a sandboxing CSP, `ETag`/cache headers and `Access-Control-Allow-Origin: *` so the images can be used from other sites.
- Deleting an image that your live or draft content references asks for explicit confirmation first.
- **Storage:** works out of the box in D1 (apply `migrations/0003_images.sql`; max ≈1.3 MB per image). For 5 MB images create an R2 bucket and bind it as `IMAGES` (commented block in `wrangler.toml`; keep your own `database_id`). If you add R2 later, existing D1 images are not migrated automatically.
- Use an image as a project thumbnail: upload → Copy URL → paste into the project's Thumbnail URL in the dashboard.

**Deploy:** `wrangler d1 execute stencyl --remote --file=migrations/0003_images.sql` (safe to re-run), then `wrangler deploy`.

**Tests:** 26 worker/unit tests; `tests/e2e` — 40 file-based browser checks (`render.mjs` + `e2e.py`) and 20 server-based checks (`server.mjs` + `e2e_server.py`: live footer, 16:9, hero edge, full image-host flow). All pass in Chromium 141. Not verified: WebGL `$`, Firefox/Safari, real GPU rendering, R2 against real Cloudflare.
