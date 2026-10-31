// Auto-boots the single ROM in romlist.js when this page is opened with ?autostart=1.
// The launcher uses this so "Start engine" goes straight into the game.
//
// The engine declares `myClass` with a lexical binding, so it is NOT a property of window.
// We therefore resolve the bare identifier (same realm, classic script) and fall back to
// clicking the engine's own "Play Game" button, which is the supported load path.
(function () {
    var params = new URLSearchParams(window.location.search);
    if (params.get('autostart') !== '1') {
        return;
    }

    function engine() {
        try {
            if (typeof myClass !== 'undefined' && myClass) {
                return myClass;
            }
        } catch (e) { /* not defined yet */ }
        return window.myClass || null;
    }

    function tidy() {
        // Keep the game as the focus: drop the marketing header and the wide buttons
        // that the stock front-end shows around the canvas.
        var css = document.createElement('style');
        css.textContent = [
            'body { background: #000 !important; }',
            '#maindiv > h1 { display: none; }',
            '.github-link, .github-logo { display: none !important; }',
            '#mydiv { display: none !important; }',
            '#middleDiv { padding: 0 !important; }',
            '#canvasDiv { margin: 0 !important; }',
            '#canvas { display: block; margin: 0 auto; max-width: 100%; }'
        ].join('\n');
        document.head.appendChild(css);
    }

    var status=document.createElement('p');status.id='autoload-status';status.setAttribute('role','status');status.style.cssText='color:white;background:#152333;padding:12px;text-align:center';status.textContent='Initializing emulator…';document.body.prepend(status);
    var attempts = 0;
    var timer = setInterval(function () {
        attempts++;

        var mc = engine();
        var data = mc && mc.rivetsData;

        if (data && data.moduleInitializing === false) {
            clearInterval(timer);

            if (window.parent && window.parent !== window) {
                window.parent.postMessage({ type: 'mk64-ready' }, '*');
            }

            try {
                tidy();
                var playBtn = document.getElementById('btnPlayGame');
                if (playBtn) {
                    playBtn.click();          // inline onclick -> myClass.loadRom()
                } else {
                    mc.loadRom();             // no ROM list? then nothing to boot
                }
            } catch (err) {
                console.error('[autostart] failed to boot ROM:', err);
            }
        } else if (attempts >= 600) {
            clearInterval(timer);
            status.textContent='The emulator could not initialize. Try a recent Chrome, Edge, or Firefox browser and reload.';
        }
    }, 250);
})();
