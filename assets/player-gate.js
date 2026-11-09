(() => {
  const css = document.createElement('style');
  css.textContent = `
    .dd-player-gate[hidden], .dd-player-chip[hidden] { display: none !important; }
    .dd-player-gate {
      position: fixed; inset: 0; z-index: 2147483000; display: grid; place-items: center;
      padding: 20px; background: #07111eeF; color: #eef6ff;
      font: 16px/1.5 system-ui, sans-serif;
    }
    .dd-player-card {
      width: min(100%, 440px); padding: 28px; border: 1px solid #ffffff26;
      border-radius: 18px; background: #12243a; box-shadow: 0 24px 80px #0009;
    }
    .dd-player-card h1 { margin: 0 0 8px; font-size: 1.6rem; }
    .dd-player-card p { margin: 0 0 18px; color: #bed0e3; }
    .dd-player-note {
      padding: 10px 12px; border: 1px solid #ffd47a55; border-radius: 10px;
      color: #ffe6b3 !important; background: #ffd47a14;
    }
    .dd-player-card label { display: block; margin-bottom: 6px; font-weight: 650; }
    .dd-player-card input, .dd-player-card button {
      width: 100%; min-height: 46px; border-radius: 9px; font: inherit;
    }
    .dd-player-card input { padding: 9px 12px; border: 1px solid #7188a2; color: #102033; background: white; }
    .dd-player-hint { margin: 8px 0 0 !important; font-size: .82rem; }
    .dd-player-card button { margin-top: 12px; border: 0; color: #062315; background: #78e5a5; font-weight: 700; cursor: pointer; }
    .dd-player-card button:disabled { opacity: .65; cursor: wait; }
    .dd-player-error { min-height: 1.5em; margin-top: 10px !important; color: #ffb9b9 !important; }
    .dd-player-chip {
      position: fixed; right: 12px; bottom: 12px; z-index: 2147482000;
      padding: 7px 11px; border: 1px solid #ffffff40; border-radius: 999px;
      color: white; background: #10243acc; font: 12px/1.3 system-ui, sans-serif;
    }
  `;
  document.head.append(css);

  const gate = document.createElement('div');
  gate.className = 'dd-player-gate';
  gate.innerHTML = `
    <section class="dd-player-card" role="dialog" aria-modal="true" aria-labelledby="dd-player-title">
      <h1 id="dd-player-title">Choose your player name</h1>
      <p class="dd-player-intro">Other players and games see this name, so use your real name or a nickname people will recognize — like “Alex”, “Apple”, or “Kya”. Use letters and spaces only; random typing such as “asdasd” is not accepted.</p>
      <p class="dd-player-note" hidden></p>
      <form>
        <label for="dd-player-name">Real name or nickname</label>
        <input id="dd-player-name" name="username" minlength="2" maxlength="24" pattern="[\p{L} ]{2,24}" autocomplete="nickname" autocapitalize="words" spellcheck="false" required>
        <p class="dd-player-hint">2–24 letters and spaces. Numbers and symbols are not allowed.</p>
        <button type="submit">Save my name</button>
        <p class="dd-player-error" role="status" aria-live="polite"></p>
      </form>
    </section>
  `;
  document.body.append(gate);
  const chip = document.createElement('div');
  chip.className = 'dd-player-chip';
  chip.hidden = true;
  chip.setAttribute('aria-label', 'Current player');
  document.body.append(chip);

  const form = gate.querySelector('form');
  const input = gate.querySelector('input');
  const button = gate.querySelector('button');
  const message = gate.querySelector('.dd-player-error');
  const title = gate.querySelector('h1');
  const intro = gate.querySelector('.dd-player-intro');
  const note = gate.querySelector('.dd-player-note');
  const defaultTitle = title.textContent;
  const defaultIntro = intro.textContent;

  async function request(url, options = {}) {
    const response = await fetch(url, { credentials: 'same-origin', cache: 'no-store', ...options });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || 'Player service is unavailable.');
    return result;
  }

  async function loadPlayer() {
    input.disabled = true;
    button.disabled = true;
    message.textContent = 'Checking player name…';
    try {
      const player = await request('/api/player/status');
      if (player.banned) {
        gate.querySelector('h1').textContent = 'This player is banned';
        form.hidden = true;
        message.textContent = 'This browser can no longer use a player name on this site.';
        return;
      }
      if (player.registered) {
        gate.hidden = true;
        chip.textContent = `Player: ${player.username}`;
        chip.hidden = false;
        return;
      }
      title.textContent = defaultTitle;
      intro.textContent = defaultIntro;
      note.hidden = true;
      note.replaceChildren();
      if (player.reset) {
        title.textContent = 'Pick your player name again';
        note.hidden = false;
        note.textContent = 'We updated the player name rules, so please enter your real name or a nickname.';
        if (player.previousUsername) {
          const previous = document.createElement('strong');
          previous.textContent = player.previousUsername;
          note.append(' Your previous name was ', previous, '.');
        }
      }
      gate.hidden = false;
      input.disabled = false;
      button.disabled = false;
      input.focus();
      message.textContent = '';
    } catch (error) {
      gate.hidden = false;
      message.textContent = `${error.message} Reload the page to retry.`;
      input.disabled = true;
      button.disabled = true;
    }
  }

  form.addEventListener('submit', async event => {
    event.preventDefault();
    message.textContent = '';
    input.disabled = true;
    button.disabled = true;
    try {
      const player = await request('/api/player/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: input.value }),
      });
      gate.hidden = true;
      note.hidden = true;
      chip.textContent = `Player: ${player.username}`;
      chip.hidden = false;
    } catch (error) {
      message.textContent = error.message;
    } finally {
      if (!gate.hidden && !form.hidden) {
        input.disabled = false;
        button.disabled = false;
      }
    }
  });

  loadPlayer();
})();
