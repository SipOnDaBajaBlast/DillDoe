# DillDoe
Free game Website1.0

Website: **https://dilldoe-games.pages.dev/**

To update the website, edit files on the **App** branch and save your changes. The **Update website** GitHub Action builds and publishes them to Cloudflare automatically.

- Edit **games.html** to change the game library.
- Edit **index.html** to change the homepage.
- Edit files in **games/** to change individual game pages.

Cloudflare serves the website and streams game files from the existing GitHub releases. The build entry point is `cloudflare/build.mjs`. Static pages and game download routes use the existing Cloudflare configuration. Free-plan Function limits still apply to game routes.

## Homepage and game pages

The homepage uses `assets/home-layout.css`. Its title bar moves the main window, including the navigation buttons; arrow keys move it and Home resets it.

The site has no advertising placements or AdSense scripts. `privacy.html` describes browser storage and external services.

`vercel/game-pages.mjs` generates game start pages from the game cards in root `games.html` during every Cloudflare build. Edit game notes in `vercel/game-guides.mjs`. The build checks that every linked game page exists and produces `sitemap.xml` and `robots.txt`.

Game start pages use the Frutiger Aero theme in `assets/game-guide.css` with `assets/frutiger-aero-ocean.webp`. The glass window, green Play button, and information panels adapt to phones.

## Webblox

`games/Webblox.html` embeds `/blox/`, Roblox's official browser client (WebClientApp) hosted with [webblox](https://github.com/x8rr/webblox-built). The files in `blox/` are webblox's host page plus the unmodified [epoxy-transport](https://github.com/MercuryWorkshop/epoxy-transport) 3.0.1 bundle (AGPL-3.0). DillDoe's changes:

- The Roblox engine is not stored here. `blox/host.js` asks Roblox for the live engine version and `blox/sw.js` streams `/blox/engine/<version>/…` straight from `setup.rbxcdn.com`, so engine downloads use no Function requests.
- Roblox API calls go through the Wisp relay at `/wisp/` in the Cloudflare Worker (`cloudflare/lib/wisp.mjs`, adapted from [webblox.js](https://github.com/hiwa1do/webblox.js)). It only connects to Roblox hosts on port 443 and only accepts pages from this site. TLS runs in the player's browser, so the relay never sees a Roblox session.
- The Worker adds the cross-origin isolation headers to `/blox/` and `/games/Webblox` only, because the `_headers` file is at its 100-rule limit.

Joining a game needs a Roblox account: players paste their `.ROBLOSECURITY` cookie, which stays in their browser's storage. Chrome or Edge on a computer works best.
