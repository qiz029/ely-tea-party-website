# Ely Tea Party website

The public introduction, built-in character previews and release downloads at https://elyteaparty.com. Static HTML, CSS and JavaScript; no framework, visitor accounts, cookies or external font dependencies. The hero's water is a WebGPU shader in `src/ocean.js`; browsers without WebGPU see the CSS gradient beneath it, and pausing the animations stops it. The avatar marketplace and binary/update hosting migration are separate follow-ups.

## Development

This repository sits beside a checkout of the app, [ELY-Open-Source/ely-tea-party](https://github.com/ELY-Open-Source/ely-tea-party): the build copies its screenshot, icon, license and WebP characters from `../ELYTerminal`, or from wherever `ELY_REPO` points. Run `npm run dev` here, then open http://localhost:8787. `npm run build` writes `dist/`. Node.js 22+ is recommended. Generated output and Wrangler state are ignored.

`art/` holds the sharper animated AVIFs the page prefers: 256 px agents for the tea table, 384 px poses for the cast spotlight and the whale. `scripts/web-art.py` keys them from `../cmux-todd-ui`'s 960 px clips (or `CMUX_TODD_UI`); it needs ffmpeg with libaom. Character names, colors, pose labels and lines in `src/cast.js` are copied from the app's `src/agents.rs` and `src/agents/quips.rs`; change them there first.

## Release links

`release.json` records the verified public release. After publishing a new app version, update its version and asset names, verify the public files, rebuild and deploy. Downloads currently go to GitHub Releases; the website does not claim R2 hosting or alter the desktop updater.

## Deployment

Every push to `main` deploys: `.github/workflows/deploy.yml` checks out the app beside this repository, builds, and runs `wrangler deploy` with the `CLOUDFLARE_API_TOKEN` repository secret (a token from Cloudflare's "Edit Cloudflare Workers" template). Without the secret the workflow only builds. `npm run deploy` does the same from a local checkout with Wrangler's OAuth login. Either way the site goes to the owner's Cloudflare account, with custom domains `elyteaparty.com` and `www.elyteaparty.com`; never place credentials in this repository. The Worker serves static assets only. Check both public hosts, the 404 status, character state buttons, pause/play, narrow screens and release links after deployment.

The browser pauses character previews when the system requests reduced motion, and offers a manual pause button. Characters and app artwork retain the project's attribution. The page links to ELYTerminal and includes the MIT license.
