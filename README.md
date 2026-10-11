# DillDoe
Free game Website1.0

Website: **https://dill-doh.vercel.app/**

To update the website, edit files on the **App** branch and save your changes. The existing Vercel GitHub integration builds and publishes them automatically.

- Edit **games.html** to change the game library.
- Edit **index.html** to change the homepage.
- Edit files in **games/** to change individual game pages.

Vercel builds the current pages and streams game files from the existing GitHub releases. The shared game-loading code remains in `cloudflare/`, but running the website does not require Cloudflare hosting. The build entry point is `vercel/build.mjs`.

## Homepage sponsor frames

The homepage has two stationary sponsor previews beside the main window, stacking below it on smaller screens. These are labeled demos and do not earn money. Edit their content in `index.html`; their styling and close controls are in `assets/home-sponsors.css` and `assets/home-sponsors.js`. The supplied artwork is `assets/sponsor-window.png`.

Connect a paying sponsor only after agreeing on the placement. To place Google ads inside a frame, first obtain the actual display ad-unit code and keep the entire ad unobscured by the artwork. Do not use floating or moving AdSense placements.

The homepage includes the owner's AdSense loader and verification meta tag for publisher `ca-pub-6483528780801608`. The root `ads.txt` authorizes that publisher, and `privacy.html` describes advertising and browser storage. Site approval, Auto ads settings, and any required Google consent messages are managed in AdSense. This loader is separate from the sponsor demos; no ad-unit identifier has been supplied yet.

## Cloudflare backup

Cloudflare automatic publishing is disabled. Its previous build workflow is kept for manual restoration if needed. The Vercel website serves pages directly; it does not redirect visitors to Cloudflare.

Game asset releases and website source files are preserved independently of either hosting project.
