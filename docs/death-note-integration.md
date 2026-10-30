# Death Note browser integration

Prepared from the supplied Unity WebGL folder on October 30, 2026.

## Publishing

- Library card: `games.html` (fallback copy: `cloudflare/public/games.html`).
- Game page: `/games/DeathNote`; generated guide: `/game/DeathNote.html`.
- Runtime: `/ports/death-note/`, preserving Unity's IndexedDB save origin.
- Source pack: `dilldoe-death-note-v1.bin`, 207,560,317 bytes.
- SHA-256: `bfbf0ded15d08a8c2c2f2d1d901f1de3fc5788dd76a40455782ca20e95552e3d`.
- Pack location: the site's existing `dilldoe-game-assets-v1` release, after public-upload approval.
- Build with the existing Cloudflare workflow after the pack is available. Do not push the new catalog before uploading its source pack.

The 192,348,226-byte Unity data download is stored in ten static pieces, each at most 20 MiB. A narrowly scoped fetch adapter streams those pieces to the original Unity loader without changing their bytes or adding Function routes. Unity still handles its own gzip decompression and game-data cache. Serve `.unityweb` and `.partN` as binary data without `Content-Encoding`.

## Verification

- Split archive SHA-256 matches the supplied original archive exactly.
- Static materialization of all 14 runtime files succeeded; none exceeds the Pages per-file limit.
- 28 Cloudflare tests passed, including stream cloning, exact byte order, error handling, and existing game routing.
- Generated guide and Play link validated; library search finds one Death Note card, with a loaded local thumbnail and 64 total games.
- Actual browser runtime reached its menu and started a new game.
- Clicked the desk, used the computer, opened the notebook, returned with Escape, opened pause, and saved back to the menu.
- Full playthrough, all notebook text-entry behavior, and audible sound quality have not been verified.

The supplied runtime emitted a resolution fallback warning and a concurrent save-sync warning during startup. Neither prevented the tested interactions. No original gameplay binaries were modified.
