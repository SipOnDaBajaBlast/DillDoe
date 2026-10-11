# DillDoe
Free game Website1.0

Website: **https://dilldoe-games.pages.dev/**

To update the website, edit files on the **App** branch and save your changes. The **Update website** GitHub Action builds and publishes them to Cloudflare automatically.

- Edit **games.html** to change the game library.
- Edit **index.html** to change the homepage.
- Edit files in **games/** to change individual game pages.

Cloudflare serves the website and streams game files from the existing GitHub releases. The build entry point is `cloudflare/build.mjs`. Static pages and game download routes use the existing Cloudflare configuration. Free-plan Function limits still apply to game routes.

## Homepage sponsor frames

The homepage has two stationary display ad frames beside the main window on wide screens, stacking below it on smaller screens. Both use the owner's AdSense unit `3349064473`. Their styling and initialization are in `assets/home-sponsors.css` and `assets/home-sponsors.js`. The supplied artwork is `assets/sponsor-window.png`. Inline ad-size rules in `index.html` use Google's documented responsive-code customization so ads stay within the frame. The title bar moves the main window, including its navigation buttons, below the ads; arrow keys move it and Home resets it.

Display ads stay in document flow and are initialized once each. They do not move, refresh automatically, or sit beneath artwork or the draggable window. The AdSense library is loaded only once on the homepage.

The homepage includes the owner's AdSense loader and verification meta tag for publisher `ca-pub-6483528780801608`. The root `ads.txt` authorizes that publisher, and `privacy.html` describes advertising and browser storage. Site approval, optional Auto ads settings, and any required Google consent messages are managed in AdSense. Empty ad areas before approval do not mean that a paid ad was served.

## Library and game-page advertising

The library has one clearly labeled banner. Its cards open game pages under `/game/` with a description, playing tips, troubleshooting, related games, and one responsive display ad using unit `3349064473`. Play opens the original `/games/` page directly. Playable files and their isolation headers remain intact; there are no ads over gameplay, timers, or required ad clicks.

`vercel/game-pages.mjs` generates these pages from the game cards in root `games.html` during every Cloudflare build. Edit game notes in `vercel/game-guides.mjs`; add notes there when adding a new game card. The build checks that every linked game exists and has notes. It also produces `sitemap.xml` and `robots.txt` so the library and game pages can be discovered by search engines. These do not guarantee indexing or traffic.

Game start pages use the Frutiger Aero theme in `assets/game-guide.css` with the owner's supplied `assets/frutiger-aero-ocean.webp` background. The glass window, green Play button, and information panels adapt to phones while the Google ad stays in a separate labeled area.

Super Mario Galaxy uses T4ctica1YT/SMGwebport, pinned to commit `40837804e15e2b3ee6ebc6c41f7afd0bcb158954`, through `/ports/smg-webport/`. Its source inventory is in `cloudflare/lib/game-catalog.json`. The port retains its own download progress, OPFS storage, settings, and optional movies. Game assets stream from the public upstream repository rather than being copied into the Pages deployment. Credit: [T4ctica1YT/SMGwebport](https://github.com/T4ctica1YT/SMGwebport), based on Petari and GalaxyQuest.

`assets/site-ads.js` loads AdSense once per page, requests each unit once near the viewport, and skips ads when the page is embedded. No ads are refreshed automatically. Empty slots reserve space to avoid moving navigation when an ad arrives. Google approval and actual ad availability are still required; adding placements does not guarantee more income. Separate units can be created later in AdSense for separate placement reports.

## Former Vercel address

The old Vercel address is reserved for redirecting visitors to Cloudflare. Vercel account limits can prevent that redirect from being served; use the Cloudflare URL directly in that case. Add `dilldoe-games.pages.dev` to AdSense and request review for that address; the old address’s approval does not automatically approve a new site.

Game asset releases and website source files are preserved independently of either hosting project.
