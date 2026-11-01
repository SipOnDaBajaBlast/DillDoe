# Class of 09 and Hotline Miami integration

Pinned source: genizy/web-port, commit a8bea5fd11f88e5a9192857f434e299c40efe7e6.

- Added original Class of 09 separately from the existing The Flip Side entry. Both new cards are adjacent immediately before Deltarune, near the main library midpoint.
- Added matching guide pages, controls, Play buttons, local covers and fullscreen players. No ads or source links were added to the website interface.
- Both source subdirectories use individual pinned-file downloads rather than downloading the entire multi-game repository. SHA-256 values verify the downloaded files.
- Removed the Class of 09 launcher's external CDN references. Load RenPy's setup script before its runtime and reject failed split game downloads.
- Preserved the original opening video through the existing large-file/range router; all other game files fit Cloudflare's static file limit.
- Hotline Miami: fit the canvas within the viewport, remove the decorative launcher scaling, and make the canvas focusable. Fixed the original GameMaker focus routine, which tried to read frames from a parent div and threw on mouse input.
- Unused Windows DLLs are excluded from the browser deployment. Microsoft Defender reported no threats in the downloaded source directory.
- Local browser checks: both title menus; Class of 09 New Game and a story choice; Hotline Miami Start Game and tutorial startup. Full games, every story branch and audible playback were not tested.
