import fs from 'node:fs/promises';
import path from 'node:path';
import notes from './game-guides.mjs';

const escape = text => text.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const publicOrigin = 'https://dilldoe-games.pages.dev';

export async function buildGamePages(output) {
    const libraryPath = path.join(output, 'games.html');
    let library = await fs.readFile(libraryPath, 'utf8');
    const games = [...library.matchAll(/<a href="(games\/[^"?#]+\.html)" class="game-card">([\s\S]*?)<\/a>/g)].map(match => {
        const file = decodeURIComponent(match[1]);
        const title = match[2].match(/<div class="game-title">([^<]+)<\/div>/)?.[1];
        return {file, sourceHref: match[1], title, slug: path.basename(file, '.html')};
    });
    if (!games.length) throw new Error('No library game links found; refusing to publish an empty guide catalog.');
    await fs.mkdir(path.join(output, 'game'), {recursive: true});
    const urls = ['/', '/games', '/privacy.html'];
    for (const game of games) {
        if (!game.title || game.file.includes('..') || game.slug.includes('/')) throw new Error('Invalid game entry');
        await fs.access(path.join(output, game.file));

        const note = notes[game.slug] || ['Casual', 'Play ' + game.title + ' in your browser.', 'Follow on-screen prompts and controls to play.'];
        const [category, description, tip] = note;

        const guideRoute = '/game/' + encodeURIComponent(game.slug) + '.html';
        const playRoute = '/' + game.file.split('/').map(encodeURIComponent).join('/');
        const related = games.filter(other => other !== game && notes[other.slug]?.[0] === category).slice(0, 3);
        const suggestions = related.length ? related : games.filter(other => other !== game).slice(0, 3);
        const html = `<!DOCTYPE html>
<html lang="en"><head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escape(game.title)} — Play &amp; Tips | DillDoe</title>
<meta name="description" content="${escape(description)}">
<link rel="canonical" href="${publicOrigin}${guideRoute}">
<meta property="og:title" content="${escape(game.title)} | DillDoe">
<meta property="og:description" content="${escape(description)}">
<meta property="og:type" content="website"><meta property="og:url" content="${publicOrigin}${guideRoute}">
<link rel="stylesheet" href="/assets/game-guide.css">
</head><body>
<nav class="guide-nav" aria-label="Main navigation"><a href="/games">← Game library</a><a href="/index.html">Home</a></nav>
<main class="game-guide">
<div class="guide-titlebar"><span class="guide-app-icon" aria-hidden="true">▶</span><span>DillDoe_Unblocked_v2.0.exe</span><span class="guide-window-dots" aria-hidden="true"><i></i><i></i><i></i></span></div>
<div class="guide-content">
<div class="guide-category">${escape(category)}</div>
<h1>${escape(game.title)}</h1>
<div class="guide-intro"><div><p>${escape(description)}</p>
<a class="guide-play" href="${playRoute}"><span class="guide-play-icon" aria-hidden="true">▶</span><span>Play ${escape(game.title)}</span></a>
<p class="guide-note">Opens the game directly.</p></div>
</div>
<div class="guide-details"><section class="guide-panel guide-panel-wide"><h2>Getting started</h2>
<ol class="guide-instructions"><li>Choose Play to open the game. The first load can take longer while game files download.</li><li>Use the game’s title screen or settings to check its keyboard, touch, or controller support.</li><li>For more room, use the game’s fullscreen control when available. Use your browser’s Back button to return here.</li></ol>
</section><section class="guide-panel"><h2>Playing tips</h2><p>${escape(tip)}</p></section>
<section class="guide-panel"><h2>If the game does not load</h2><p>Check your connection and wait for any download progress to finish. Some games need a recent browser and enough free device storage. If controls do not respond, give the game focus and review its settings. Avoid clearing browser site data if you want to keep locally stored saves.</p></section>
<section class="guide-panel guide-panel-wide"><h2>More to explore</h2><ul class="guide-related">${suggestions.map(other => `<li><a href="/game/${encodeURIComponent(other.slug)}.html">${escape(other.title)}</a></li>`).join('')}</ul></section></div>
</div></main><footer class="guide-footer"><span><a href="/privacy.html">Privacy</a> · <a href="/games">All games</a></span></footer>
</body></html>`;
        await fs.writeFile(path.join(output, 'game', game.slug + '.html'), html);
        library = library.replace(`href="${game.sourceHref}" class="game-card"`, `href="${guideRoute}" class="game-card"`);
        urls.push(guideRoute);
    }
    await fs.writeFile(libraryPath, library);
    await fs.writeFile(path.join(output, 'sitemap.xml'), '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' + urls.map(url => `  <url><loc>${escape(publicOrigin + url)}</loc></url>`).join('\n') + '\n</urlset>\n');
    await fs.writeFile(path.join(output, 'robots.txt'), 'User-agent: *\nAllow: /\n\nSitemap: ' + publicOrigin + '/sitemap.xml\n');
    console.log('Prepared ' + games.length + ' game pages with direct Play links.');
}
