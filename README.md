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
