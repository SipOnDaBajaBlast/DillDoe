# DillDoe
Free game Website1.0

Website: **https://dill-doh.vercel.app/**

To update the website, edit files on the **App** branch and save your changes. The existing Vercel GitHub integration builds and publishes them automatically.

- Edit **games.html** to change the game library.
- Edit **index.html** to change the homepage.
- Edit files in **games/** to change individual game pages.

Vercel builds the current pages and streams game files from the existing GitHub releases. The shared game-loading code remains in `cloudflare/`, but running the website does not require Cloudflare hosting. The build entry point is `vercel/build.mjs`.

## Homepage sponsor frames

The homepage has two moving sponsor previews behind the main window. These are labeled demos, do not load an ad network, and do not earn money. Edit their content in `index.html`; their styling and controls are in `assets/home-sponsors.css` and `assets/home-sponsors.js`. The supplied artwork is `assets/sponsor-window.png`.

Connect a paying sponsor only after agreeing on the placement. Google AdSense prohibits floating ad boxes; approved AdSense units need separate stationary, visible placements rather than these moving previews.

## Cloudflare backup

Cloudflare automatic publishing is disabled. Its previous build workflow is kept for manual restoration if needed. The Vercel website serves pages directly; it does not redirect visitors to Cloudflare.

Game asset releases and website source files are preserved independently of either hosting project.
