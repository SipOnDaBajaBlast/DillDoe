# DillDoe on Cloudflare Pages

This deployment serves the original game library and its embedded games at one origin. The website address can use `pages.dev` or a custom domain. Game downloads are streamed from the existing GitHub repositories and releases through the same website origin.

## Updating your website

Edit your usual website files on the **App** branch of **MagiczLunchly/DillDoe**: `games.html` for the game library, `index.html` for the home page, and files in `games/` for individual game pages. Saving a change on GitHub or pushing a commit automatically builds and publishes the site at **https://dilldoe-games.pages.dev/**. The **Actions → Update website** page shows progress and any errors. Publishing normally takes a few minutes. You can also use **Run workflow** there to publish again.

The build reads the current files from the repository root every time and converts known old game embeds to the migrated Cloudflare game routes. You do not need to edit the duplicate fallback pages in `cloudflare/public/`. Large game assets live in the existing releases; changing those files requires a separate asset update, rather than uploading them with the website.

The workflow uses the encrypted repository secret `CLOUDFLARE_API_TOKEN` with Cloudflare Pages publishing permission. Keep this credential out of source files. The account ID is configured in the workflow. Cloudflare's existing production branch label is `main`; the editable GitHub branch remains `App`.

For local builds, run `npm ci` and `npm run build` inside this directory. The output is `dist`. For a manual deployment, run `npm run deploy` after authenticating with Cloudflare.

The Worker handles only game and download routes. Ordinary library pages are static assets and do not use a Function invocation. Game downloads stream bytes and validate ranges; large game packs are never buffered in Worker memory. GTA supports batched and resumed range reads. Halo saves its automatic download on the device and displays download progress.

Daybreak, Date Jeff/Fear Me, and Doki Doki Kombat Klub were recovered from their original Vercel deployments. Browser assets are checked against Vercel's original SHA-1 file identifiers before packaging. The movie service and proxy are separate services and have not been migrated. This deployment does not promise unlimited Function usage; Cloudflare free-plan limits still apply.
