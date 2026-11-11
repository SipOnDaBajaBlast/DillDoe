(() => {
  const { body } = document;
  const frame = document.getElementById('game');
  const status = document.getElementById('status');
  const progress = document.getElementById('progress');
  const prefix = body.dataset.partPrefix;
  const parts = Number(body.dataset.parts);

  async function load() {
    const buffers = [];
    let total = 0;
    for (let part = 1; part <= parts; part++) {
      status.textContent = `Loading game file ${part} of ${parts}…`;
      const name = `${prefix}.part${String(part).padStart(4, '0')}`;
      const response = await fetch(name);
      if (!response.ok) throw new Error(`Could not load part ${part} (${response.status}).`);
      const buffer = await response.arrayBuffer();
      buffers.push(buffer);
      total += buffer.byteLength;
      progress.value = Math.round((part / parts) * 100);
    }

    const game = new Uint8Array(total);
    let offset = 0;
    for (const buffer of buffers) {
      game.set(new Uint8Array(buffer), offset);
      offset += buffer.byteLength;
    }

    status.textContent = 'Starting game…';
    const html = new TextDecoder().decode(game);
    const base = `<base href="${new URL('.', location.href).href}">`;
    const withBase = /<head\b[^>]*>/i.test(html)
      ? html.replace(/<head\b[^>]*>/i, match => `${match}${base}`)
      : /<html\b[^>]*>/i.test(html)
        ? html.replace(/<html\b[^>]*>/i, match => `${match}<head>${base}</head>`)
        : `${base}${html}`;
    frame.src = URL.createObjectURL(new Blob([withBase], { type: 'text/html;charset=utf-8' }));
    frame.hidden = false;
    frame.addEventListener('load', () => { status.hidden = true; progress.hidden = true; }, { once: true });
  }

  load().catch(error => {
    status.textContent = `Game could not start: ${error.message}`;
  });
})();
