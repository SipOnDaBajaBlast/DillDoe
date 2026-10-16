export function patchFeedPitHtml(html, entry) {
  if (!html.includes('engine.startGame({')) throw new Error('Unexpected Feed the Pit launcher');
  const parts = entry.splitFiles['feedthepit.pck'].map(path => ({path, size: entry.files[path]}));
  const script = `<script src="/assets/feed-pit-loader.js?v=3"></script><script>const feedPitParts=${JSON.stringify(parts)};</script>`;
  return html.replace('<head>', '<head>' + script)
    .replace('src="feedthepit.js"', 'src="feedthepit.js?loader=3"')
    .replace('engine.startGame({', 'startFeedThePit(engine, GODOT_CONFIG, {')
    .replace('}).then(() => {', '}, feedPitParts).then(() => {')
    .replace(/setStatusMode\('notice'\);\r?\n\t\tinitializing = false;/, "setStatusMode('notice');\n\t\tconst retry = document.createElement('button'); retry.textContent = 'Retry download'; retry.onclick = () => location.reload(); statusNotice.appendChild(retry);\n\t\tinitializing = false;");
}
