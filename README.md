# DillDoe
Free game Website1.0

Website: **https://dill-doh.vercel.app/**

To update the website, edit files on the **App** branch and save your changes. The existing Vercel GitHub integration builds and publishes them automatically.

- Edit **games.html** to change the game library.
- Edit **index.html** to change the homepage.
- Edit files in **games/** to change individual game pages.

Vercel builds the current pages and streams game files from the existing GitHub releases. The shared game-loading code remains in `cloudflare/`, but running the website does not require Cloudflare hosting. The build entry point is `vercel/build.mjs`.

## Cloudflare backup

Cloudflare automatic publishing is disabled. Its previous build workflow is kept for manual restoration if needed. The Vercel website serves pages directly; it does not redirect visitors to Cloudflare.

Game asset releases and website source files are preserved independently of either hosting project.
