# DillDoe
Free game Website1.0

Website: **https://dilldoe-games.pages.dev/**

To update the website, edit files on the **App** branch and save your changes. GitHub's **Actions → Update website** workflow builds and publishes them automatically.

- Edit **games.html** to change the game library.
- Edit **index.html** to change the homepage.
- Edit files in **games/** to change individual game pages.

See [publishing details](cloudflare/README.md) for the hosting setup and game asset updates.

## Old Vercel link

The root `vercel.json` redirects every old page to the same path on `https://dilldoe-games.pages.dev/`. For example, `/games/HaloCE.html` keeps that path on the new website. Cloudflare publishing ignores this Vercel configuration.

Vercel currently blocks the team for exceeded fair use limits, so it cannot publish or serve this redirect yet. After Vercel restores access, redeploy the `dill-doh` project from the `App` branch. Until then, share the new website link directly.
