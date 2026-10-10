# DillDoe on Cloudflare Pages

This deployment serves the original game library and its embedded games at one origin. The website address can use `pages.dev` or a custom domain. Game downloads are streamed from the existing GitHub repositories and releases through the same website origin.

Run `npm ci` and `npm run build`. For Git integration, use `cloudflare` as the root directory, `npm run build` as the build command, and `dist` as the output directory. For a direct deployment, run `npm run deploy` after authenticating with Cloudflare.

The Worker handles only game and download routes. Ordinary library pages are static assets and do not use a Function invocation. Game downloads stream bytes and validate ranges; large game packs are never buffered in Worker memory. GTA supports batched and resumed range reads. Halo saves its automatic download on the device and displays download progress.

Daybreak, Date Jeff/Fear Me, and Doki Doki Kombat Klub still need their original source files. Their existing Vercel embeds remain until those files are supplied. The movie service and proxy are separate services and have not been migrated. This deployment does not promise unlimited Function usage; Cloudflare free-plan limits still apply.
