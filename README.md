# Ely Tea Party website

The public introduction, built-in character previews and release downloads at https://elyteaparty.com. Static HTML, CSS and JavaScript without a framework or external fonts, plus a small Worker for the skin market below; only signing in (`/login/`) sets a cookie. The page's water is a WebGPU canvas behind everything, in `src/ocean.js`: caustics at the surface that darken as you scroll, and plankton that gathers into the tour's screenshot (any `[data-form]` image) before the real picture takes over. Browsers without WebGPU see the CSS gradient and the plain screenshot, and pausing the animations stops it. The tour then moves its camera over that screenshot, one step per feature; the glass guide at the left marks the section on screen.

## Development

This repository sits beside a checkout of the app, [ELY-Open-Source/ely-tea-party](https://github.com/ELY-Open-Source/ely-tea-party): the build copies its screenshot, icon, license and WebP characters from `../ELYTerminal`, or from wherever `ELY_REPO` points. Run `npm run dev` here, then open http://localhost:8787. `npm run build` writes `dist/`. Node.js 22+ is recommended. Generated output and Wrangler state are ignored.

`art/` holds the sharper animated AVIFs the page prefers: 256 px agents for the tea table, 384 px poses for the cast spotlight and the whale. `scripts/web-art.py` keys them from `../cmux-todd-ui`'s 960 px clips (or `CMUX_TODD_UI`); it needs ffmpeg with libaom. Character names, colors, pose labels and lines in `src/cast.js` are copied from the app's `src/agents.rs` and `src/agents/quips.rs`; change them there first.

## Search and sharing

`/en/` is generated, not written: the build takes the Chinese `src/index.html`, swaps every phrase listed in `i18n/en.json`, and fails if a listed phrase is missing from the page or any Chinese text is left on `/en/` (the "中文" switch aside). So change the Chinese page, then add or update its English in `i18n/en.json`. Text the script writes (status bubbles, the cast spotlight, platform hints) is localized in `src/app.js` and `src/cast.js`'s `en` blocks. Both pages link each other with `hreflang`, `x-default` is the Chinese page, and `sitemap.xml` lists both.

The page carries its title, description, keywords, canonical URL, Open Graph and Twitter cards, and JSON-LD (`SoftwareApplication` plus `WebSite`) whose version and download link the build fills from `release.json`; `sitemap.xml` takes the build date. The share cards `art/og.jpg` and `art/og-en.jpg` (1200×630) are `scripts/og.html` and `scripts/og.html?en` rendered by headless Chrome:

```sh
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new --hide-scrollbars \
  --force-device-scale-factor=1 --window-size=1200,630 --virtual-time-budget=3000 \
  --allow-file-access-from-files --screenshot=/tmp/og.png "file://$PWD/scripts/og.html"
python3 -c "from PIL import Image; Image.open('/tmp/og.png').convert('RGB').save('art/og.jpg', quality=88, optimize=True, progressive=True)"
```

## Changelog

`/releases/` and `/en/releases/` are built by `changelog.mjs` from `data/releases.json`, a snapshot of the app's published GitHub releases that `npm run releases` refreshes (set `GITHUB_TOKEN` to avoid the API's rate limit). Each deploy refreshes it first, and the workflow also runs daily, so a new app release shows up within a day without a commit here. Release notes written in both languages split by their headings: the Chinese page shows the Chinese sections, the English page the English ones. A release whose notes lack a page's language takes them from `data/releases.zh.json` or `data/releases.en.json` (Markdown keyed by tag, which covers 0.2.0–0.3.10 in Chinese); with neither, the page shows the original with a line saying so, and the build warns. `## Builds` sections, which list installer files, are left out.

## Downloads and the update store

Installers and the app's update manifest live in the R2 bucket `ely-tea-party-downloads`, served at `https://download.elyteaparty.com`: each release under `vX.Y.Z/` (the three installers and `SHA256SUMS`, cached for a year) and `latest.json` (cached 5 minutes) naming the newest version, each platform's URL, size and SHA-256, and the download and notes pages in both languages. The app (0.3.15 on) checks that manifest first and GitHub only when it can't be read; on macOS the disk image must match the listed hash before its signature checks.

`scripts/mirror.mjs` fills the store from GitHub's newest published release: it downloads the files, checks them against `SHA256SUMS`, uploads them, writes `latest.json` last so it never names missing files, and drops versions beyond the newest ten (GitHub keeps every one). `.github/workflows/mirror.yml` runs it hourly and, when it copied a new release, triggers the deploy so the download buttons follow. Run it by hand with `GITHUB_TOKEN=$(gh auth token) node scripts/mirror.mjs` (add `--force` to recopy the current version).

The build takes its download links and version from `latest.json`; when the store can't be read it falls back to `release.json`, GitHub's links for the last release recorded there.

The download section shows how many times the installers were downloaded: GitHub's count for every release plus the store's. `scripts/downloads.mjs`, run by the same hourly workflow, writes it to the store's `stats.json` and triggers the deploy when it changed. The store's part comes from R2's analytics, whole `GetObject` 200s on installer files, which reach back only 31 days, so `stats.json` keeps a running total and the hour it was counted `through`. That query needs the `CLOUDFLARE_API_TOKEN` to have **Account Analytics: Read**; without it the store's count stays where it was and the run warns. When `stats.json` can't be read the page leaves the count off.

## Skin market

`/skins/` (and `/en/skins/`) lists character packs people share; `/skins/<id>` shows one, with every action animated, a download of the `.elyskin` exactly as uploaded, and an `elyteaparty://skin/<id>` link the app (0.3.18 on) installs from; `/skins/upload/` publishes. `market.mjs` writes those three pages at build time; `src/skins.js`, `src/upload.js` and `src/market.js` fill them from the API.

## Accounts

Every page's header has a Sign in link, or once signed in the person's picture and a menu (`src/account.js`). `/login/` sends people to WorkOS AuthKit's email-code page (Magic Auth; no passwords and no social logins); WorkOS comes back to `/api/auth/callback`, which checks the state cookie, trades the code for the WorkOS user (`worker/workos.js`) and opens a 30-day session cookie. An account is found by its WorkOS id, else linked by a verified email, else made; a new account picks its handle on `/settings/` first. `/settings/` edits the display name, bio, up to four https links and the picture (cropped to 256 px in the browser, at most 1 MiB and 1024 px, stored in R2 under `avatars/<id>/`), shows the email and open sessions, signs out every device and deletes the account with its skins and WorkOS user. `/u/<handle>` is the public profile with the person's skins, its title and share card filled in by the Worker. `accounts.mjs` writes these pages; `src/login.js`, `src/settings.js` and `src/profile.js` fill them; `worker/auth.js`, `worker/profile.js` and `worker/avatars.js` answer them.

The Worker (`worker/`) owns the API. `worker/pack.js` reads a pack the way ELYTerminal's `docs/elyskin.md` says, walking the bytes so a 44 MiB pack never becomes one string: version 2 only, every structural and text rule, keys repeated in any object refused, images as canonical base64 that `worker/images.js` checks to be PNG, APNG, GIF or WebP within the size, frame and pixel limits (from their headers; the app decodes every frame on install). Packs and each action's image go to the R2 bucket `ely-tea-party-skins` under `skins/<id>/<sha256 prefix>/`; accounts, sessions, skins and reports live in the D1 database `ely-tea-party-market` (`migrations/`). An id is `<handle>.<slug>`: a pack whose `meta.id` names one of yours, or the upload page's "Publish as", replaces it. Three reports from different networks hide a skin until a moderator (`ADMIN_EMAILS`) restores it; every report mails the moderators through Cloudflare Email Sending. Rate limits: 30 sign-ins per network in 10 minutes, 30 uploads a day and 50 skins per account.

Locally: put `SECRET=<anything>` and `ADMIN_EMAILS=admin@example.com` in `.dev.vars`, run `npx wrangler d1 migrations apply ely-tea-party-market --local`, then `npm run dev`; mail is simulated and printed in the log. Pass `--local-upstream localhost:8787` to `wrangler dev` so sign-in comes back to localhost, and a WorkOS staging environment's `WORKOS_CLIENT_ID` and `WORKOS_API_KEY` (with `http://localhost:8787/api/auth/callback` as a redirect URI) to sign in for real. `node --test tests/pack.test.mjs` checks the reader against the app's own art; `tests/market.e2e.mjs` runs its own mock WorkOS and, against the `wrangler dev` its header names, signs in, edits a profile, uploads, replaces, reports, moderates and deletes.

Production needs, once: `wrangler d1 create ely-tea-party-market` (its id into `wrangler.jsonc`), `wrangler r2 bucket create ely-tea-party-skins`, `wrangler email sending enable auth.elyteaparty.com`, `wrangler secret put SECRET`, and a WorkOS production environment with Magic Auth on, `https://elyteaparty.com/api/auth/callback` and `https://www.elyteaparty.com/api/auth/callback` as its redirect URIs, its client id as `WORKOS_CLIENT_ID` in `wrangler.jsonc` and its API key through `wrangler secret put WORKOS_API_KEY`.

## Deployment

Every push to `main` deploys: `.github/workflows/deploy.yml` checks out the app beside this repository, builds, and runs `wrangler deploy` with the `CLOUDFLARE_API_TOKEN` repository secret (a token from Cloudflare's "Edit Cloudflare Workers" template). Without the secret the workflow only builds. `npm run deploy` does the same from a local checkout with Wrangler's OAuth login. Either way the site goes to the owner's Cloudflare account, with custom domains `elyteaparty.com` and `www.elyteaparty.com`; never place credentials in this repository. The Worker serves `dist/` and answers the skin market's `/api/*`, `/skins/<id>` and `/u/<handle>` pages; the deploy workflow applies D1 migrations first, so its token also needs **D1: Edit**. Check both public hosts, the 404 status, character state buttons, pause/play, narrow screens and release links after deployment.

The browser pauses character previews when the system requests reduced motion, and offers a manual pause button. Characters and app artwork retain the project's attribution. The page links to ELYTerminal and includes the MIT license.
