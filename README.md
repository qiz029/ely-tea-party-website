# Ely Tea Party website

The public introduction, built-in character previews and release downloads at https://elyteaparty.com. Static HTML, CSS and JavaScript; no framework, visitor accounts, cookies or external font dependencies. The hero's water is a WebGPU shader in `src/ocean.js`; browsers without WebGPU see the CSS gradient beneath it, and pausing the animations stops it. The avatar marketplace and binary/update hosting migration are separate follow-ups.

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

## Release links

`release.json` records the verified public release. After publishing a new app version, update its version and asset names, verify the public files, rebuild and deploy. Downloads currently go to GitHub Releases; the website does not claim R2 hosting or alter the desktop updater.

## Deployment

Every push to `main` deploys: `.github/workflows/deploy.yml` checks out the app beside this repository, builds, and runs `wrangler deploy` with the `CLOUDFLARE_API_TOKEN` repository secret (a token from Cloudflare's "Edit Cloudflare Workers" template). Without the secret the workflow only builds. `npm run deploy` does the same from a local checkout with Wrangler's OAuth login. Either way the site goes to the owner's Cloudflare account, with custom domains `elyteaparty.com` and `www.elyteaparty.com`; never place credentials in this repository. The Worker serves static assets only. Check both public hosts, the 404 status, character state buttons, pause/play, narrow screens and release links after deployment.

The browser pauses character previews when the system requests reduced motion, and offers a manual pause button. Characters and app artwork retain the project's attribution. The page links to ELYTerminal and includes the MIT license.
