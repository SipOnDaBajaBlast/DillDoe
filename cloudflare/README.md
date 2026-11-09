# DillDoe on Cloudflare Pages

This deployment serves the original game library and its embedded games at one origin. The website address can use `pages.dev` or a custom domain. Game downloads are streamed from the existing GitHub repositories and releases through the same website origin.

## Updating your website

Edit your usual website files on the **App** branch of **MagiczLunchly/DillDoe**: `games.html` for the game library, `index.html` for the home page, and files in `games/` for individual game pages. Saving a change on GitHub or pushing a commit automatically builds and publishes the site at **https://dilldoe-games.pages.dev/**. The **Actions → Update website** page shows progress and any errors. Publishing normally takes a few minutes. You can also use **Run workflow** there to publish again.

The build reads the current files from the repository root every time and converts known old game embeds to the migrated Cloudflare game routes. You do not need to edit the duplicate fallback pages in `cloudflare/public/`. Large game assets live in the existing releases; changing those files requires a separate asset update, rather than uploading them with the website.

Normal page, style, image, ad, and game-library edits use a fast publish path. It builds the website files and reuses the game-file content hashes already stored in Cloudflare; it does not download, extract, hash, or upload the game collection again. Both the main website and existing static game routes remain in the same deployment, so game URLs and saves stay unchanged. The secondary game-data project is left in place during page-only updates.

Game catalog, release-pack, runtime transformation, or dependency changes automatically select the full game build. The workflow also checks that retained game hashes still exist and falls back to a full build when restoration is needed. To force a full rebuild, use **Actions → Update website → Run workflow → Rebuild and republish all game files**. Normal edits still require only saving or pushing to App.

The compact `__migration/static-build.json` inventory records the static game hashes and matching build fingerprint, not credentials or executable instructions. The checked-in bootstrap inventory permits the first fast update to reuse the previously verified game build. Full builds replace the live inventory automatically. A source mismatch never reuses an outdated inventory. Deployment uses Cloudflare's documented Direct Upload manifest API and the official Wrangler uploader; unchanged game blobs remain static and do not introduce a request proxy.

The workflow uses the encrypted repository secret `CLOUDFLARE_API_TOKEN` with Cloudflare Pages publishing permission. Keep this credential out of source files. The account ID is configured in the workflow. Cloudflare's existing production branch label is `main`; the editable GitHub branch remains `App`.

## Player names and moderation

The site asks each browser to choose a unique 3–20 character player name. It stores that name with a random, HttpOnly browser ID in Cloudflare D1. Browsers do not expose a person's computer-account or other service username; clearing this site's cookies or changing browsers creates a new browser profile.

Before publishing the player registry, create its database and apply the schema from this directory:

```sh
npx wrangler d1 create dilldoe-players
npx wrangler d1 execute dilldoe-players --remote --file migrations/0001_player_registry.sql
```

In Cloudflare, open **Workers & Pages → dilldoe-games → Settings → Bindings**. Add a production D1 binding named `PLAYER_DB` and select `dilldoe-players`. Under **Settings → Variables and Secrets**, add `PLAYER_ADMIN_PASSWORD` as a secret with a strong, unique password. Save and redeploy so the Worker receives the binding and secret. Do not put the password in GitHub, HTML, or JavaScript.

After the binding is active, visit `/players-admin.html`, sign in with that password, search player names, then use **Ban** or **Unban**. Admin sessions expire after 12 hours; repeated failed sign-ins are temporarily rate-limited. The registry stores the chosen name, browser ID, join/last-active times, and ban state. A player can create another browser profile by clearing cookies or switching browsers, so this is site moderation rather than verified real-world identity.

For local builds, run `npm ci` and `npm run build` inside this directory. The output is `dist`. For a manual deployment, run `npm run deploy` after authenticating with Cloudflare.

Suitable game files up to Pages' 25 MiB per-file limit are downloaded and size-checked at build time, then published as static assets. Large WebAssembly runtimes are also served statically when gzip brings their encoded size below that limit; their decoded bytes and URLs stay the same. HTML, JavaScript, images, audio, and playable documents stay on the original site origin so existing browser saves and workers keep working. Fetchable shader/JSON/XML/metadata files use the static-only `dilldoe-gamefiles.pages.dev` project with CORS. This splits the existing files between two free Pages projects without running a second Worker. The build validates both 20,000-file limits before publishing.

Only remaining oversized game files and special download APIs invoke the Worker. There is no catch-all `/ports/*` Function route. GTA's legacy `/data/*` route remains available for older open players; updated players fetch verified small data directly from the static host. That data was compared against the existing release packs and is SHA-256-checked during builds. Unknown/large GTA reads go through `/data/file?file=...`, preserving range and version parameters; POST batches keep their original API. The I/O worker requests 512 KiB instead of 128 KiB per slice while preserving its existing saved cache block format. Binary downloads retain their original streaming/range validation. Halo and the emulated games retain their existing on-device download storage. A 30-second failure backoff prevents repeated fetch retries during outages; GTA's I/O worker also uses it.

Full builds output `dist` for the main website and `dist-games` for the static data host. The workflow publishes the data host first, then the main site, using the existing encrypted Cloudflare credential. Pinned public source archives and SHA-256-verified release packs are cached between full builds. Fast builds produce only the current website files and retain the unchanged game manifest. Ordinary website edits still publish automatically from the App branch. `static-game-report.json` records which files are static and how many oversized files remain for each game. The health check is static and does not spend a Function request.

This reduces Function invocations, not just transferred bytes. Static game requests are outside the daily Worker allowance. Oversized downloads and APIs still share that allowance, so the setup cannot promise unlimited dynamic traffic. Browser caches may revalidate static assets after one hour; HTML requests revalidate immediately. Clearing browser data still removes local game saves/downloads.

Daybreak, Date Jeff/Fear Me, and Doki Doki Kombat Klub were recovered from their original Vercel deployments. Browser assets are checked against Vercel's original SHA-1 file identifiers before packaging. The movie service and proxy are separate services and have not been migrated. This deployment does not promise unlimited Function usage; Cloudflare free-plan limits still apply.
