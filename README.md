# DillDoe
Free game Website1.0

Website: **https://dill-doh.vercel.app/**

To update the website, edit files on the **App** branch and save your changes. The existing Vercel GitHub integration builds and publishes them automatically.

- Edit **games.html** to change the game library.
- Edit **index.html** to change the homepage.
- Edit files in **games/** to change individual game pages.

Vercel builds the current pages and streams game files from the existing GitHub releases. The shared game-loading code remains in `cloudflare/`, but running the website does not require Cloudflare hosting. The build entry point is `vercel/build.mjs`.

## Homepage sponsor frames

The homepage has two stationary display ad frames beside the main window on wide screens, stacking below it on smaller screens. Both use the owner's AdSense unit `3349064473`. Their styling and initialization are in `assets/home-sponsors.css` and `assets/home-sponsors.js`. The supplied artwork is `assets/sponsor-window.png`. Inline ad-size rules in `index.html` use Google's documented responsive-code customization so ads stay within the frame. The title bar moves the main window, including its navigation buttons, below the ads; arrow keys move it and Home resets it.

Display ads stay in document flow and are initialized once each. They do not move, refresh automatically, or sit beneath artwork or the draggable window. The AdSense library is loaded only once on the homepage.

The homepage includes the owner's AdSense loader and verification meta tag for publisher `ca-pub-6483528780801608`. The root `ads.txt` authorizes that publisher, and `privacy.html` describes advertising and browser storage. Site approval, optional Auto ads settings, and any required Google consent messages are managed in AdSense. Empty ad areas before approval do not mean that a paid ad was served.

## Cloudflare backup

Cloudflare automatic publishing is disabled. Its previous build workflow is kept for manual restoration if needed. The Vercel website serves pages directly; it does not redirect visitors to Cloudflare.

Game asset releases and website source files are preserved independently of either hosting project.
