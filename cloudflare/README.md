# DillDoe on Cloudflare Pages

This deployment serves the original game library and its embedded games at one origin. The website address can use `pages.dev` or a custom domain. Game downloads are streamed from the existing GitHub repositories and releases through the same website origin.

## Updating your website

Edit your usual website files on the **App** branch of **MagiczLunchly/DillDoe**: `games.html` for the game library, `index.html` for the home page, and files in `games/` for individual game pages. Saving a change on GitHub or pushing a commit automatically builds and publishes the site at **https://dilldoe-games.pages.dev/**. The **Actions → Update website** page shows progress and any errors. Publishing normally takes a few minutes. You can also use **Run workflow** there to publish again.

The build reads the current files from the repository root every time and converts known old game embeds to the migrated Cloudflare game routes. You do not need to edit the duplicate fallback pages in `cloudflare/public/`. Large game assets live in the existing releases; changing those files requires a separate asset update, rather than uploading them with the website.

The workflow uses the encrypted repository secret `CLOUDFLARE_API_TOKEN` with Cloudflare Pages publishing permission. Keep this credential out of source files. The account ID is configured in the workflow. Cloudflare's existing production branch label is `main`; the editable GitHub branch remains `App`.

For local builds, run `npm ci` and `npm run build` inside this directory. The output is `dist`. For a manual deployment, run `npm run deploy` after authenticating with Cloudflare.

Suitable game files up to Pages' 25 MiB per-file limit are downloaded and size-checked at build time, then published as static assets. Large WebAssembly runtimes are also served statically when gzip brings their encoded size below that limit; their decoded bytes and URLs stay the same. HTML, JavaScript, images, audio, and playable documents stay on the original site origin so existing browser saves and workers keep working. Fetchable shader/JSON/XML/metadata files use the static-only `dilldoe-gamefiles.pages.dev` project with CORS. This splits the existing files between two free Pages projects without running a second Worker. The build validates both 20,000-file limits before publishing.

Only remaining oversized game files and special download APIs invoke the Worker. There is no catch-all `/ports/*` Function route. GTA's legacy `/data/*` route remains available for older open players; updated players fetch verified small data directly from the static host. That data was compared against the existing release packs and is SHA-256-checked during builds. Unknown/large GTA reads go through `/data/file?file=...`, preserving range and version parameters; POST batches keep their original API. The I/O worker requests 512 KiB instead of 128 KiB per slice while preserving its existing saved cache block format. Binary downloads retain their original streaming/range validation. Halo and the emulated games retain their existing on-device download storage. A 30-second failure backoff prevents repeated fetch retries during outages; GTA's I/O worker also uses it.

The build outputs `dist` for the main website and `dist-games` for the static data host. The workflow publishes the data host first, then the main site, using the existing encrypted Cloudflare credential. Pinned public source archives and SHA-256-verified release packs are cached between workflow runs. Ordinary website edits still publish automatically from the App branch. `static-game-report.json` records which files are static and how many oversized files remain for each game. The health check is static and does not spend a Function request.

This reduces Function invocations, not just transferred bytes. Static game requests are outside the daily Worker allowance. Oversized downloads and APIs still share that allowance, so the setup cannot promise unlimited dynamic traffic. Browser caches may revalidate static assets after one hour; HTML requests revalidate immediately. Clearing browser data still removes local game saves/downloads.

Daybreak, Date Jeff/Fear Me, and Doki Doki Kombat Klub were recovered from their original Vercel deployments. Browser assets are checked against Vercel's original SHA-1 file identifiers before packaging. The movie service and proxy are separate services and have not been migrated. This deployment does not promise unlimited Function usage; Cloudflare free-plan limits still apply.
