(() => {
  const css = document.createElement('style');
  css.textContent = `
    .dd-player-gate[hidden], .dd-player-chip[hidden] { display: none !important; }
    .dd-player-gate {
      position: fixed; inset: 0; z-index: 2147483000; display: grid; place-items: center;
      padding: 20px; overflow: auto;
      background: #0879b8 url('/assets/frutiger-aero-ocean.webp') center / cover fixed;
      font: 16px/1.5 'Trebuchet MS', 'Segoe UI', sans-serif; color: #073654;
    }
    .dd-player-gate::before {
      content: ''; position: absolute; inset: 0; pointer-events: none;
      background:
        radial-gradient(circle at 18% 22%, #ffffff5c 0 3px, transparent 4px),
        radial-gradient(circle at 30% 16%, #ffffff47 0 5px, transparent 6px),
        radial-gradient(circle at 78% 78%, #ffffff4d 0 4px, transparent 5px),
        radial-gradient(circle at 86% 30%, #ffffff38 0 7px, transparent 8px),
        radial-gradient(circle at 64% 12%, #ffffff2e 0 10px, transparent 11px);
    }
    .dd-player-card {
      position: relative; z-index: 1; width: min(100%, 460px); margin: auto; padding: 6px;
      border: 1px solid #ffffffeb; border-radius: 22px;
      background: linear-gradient(120deg, #e0faffcc, #48b4e6a8 40%, #d1f7ffd8);
      backdrop-filter: blur(14px);
      box-shadow: 0 24px 70px #003e6b66, inset 0 0 0 1px #2b94b8aa, inset 0 2px 6px #fff;
    }
    .dd-player-titlebar {
      display: flex; align-items: center; gap: 10px; min-height: 44px; padding: 7px 14px;
      color: #08466e; text-shadow: 0 1px #fff; font-size: 12px; font-weight: bold;
      letter-spacing: .3px;
    }
    .dd-player-orb {
      width: 26px; height: 26px; flex-shrink: 0; border: 1px solid white; border-radius: 50%;
      background: radial-gradient(ellipse at 35% 12%, white, #75e6ff 30%, #008dc9 65%, #0768a9);
      box-shadow: 0 2px 5px #00679a80;
    }
    .dd-player-dots { display: flex; gap: 5px; margin-left: auto; }
    .dd-player-dots i {
      width: 17px; height: 9px; border: 1px solid #ffffffc4; border-radius: 5px;
      background: linear-gradient(#f1ffff, #69b8dc);
    }
    .dd-player-content {
      padding: 22px 26px 26px; border: 1px solid #ffffffd9; border-radius: 15px;
      background: linear-gradient(135deg, #f7fefff2, #e4f6ffef 60%, #eefff7f2);
      box-shadow: inset 0 1px 4px #176d8b1f;
    }
    .dd-player-card h1 {
      margin: 0 0 10px; font-size: clamp(1.5rem, 5vw, 2rem); line-height: 1.15;
      letter-spacing: -.5px; color: #056ca4; text-shadow: 0 1px #fff, 0 3px 8px #0e7b9a33;
    }
    .dd-player-card p { margin: 0 0 16px; color: #35536a; }
    .dd-player-note {
      padding: 10px 12px; border: 1px solid #e9c46a; border-radius: 10px;
      color: #7a5300 !important; background: linear-gradient(#fffdf5, #ffefc4);
      box-shadow: inset 0 1px #fff;
    }
    .dd-player-card label { display: block; margin-bottom: 6px; font-weight: bold; color: #075e88; text-shadow: 0 1px #fff; }
    .dd-player-card input, .dd-player-card button {
      width: 100%; min-height: 46px; border-radius: 10px; font: inherit;
    }
    .dd-player-card input {
      padding: 9px 12px; border: 1px solid #7fb8cf; color: #0a3550; background: #fff;
      box-shadow: inset 0 2px 4px #0a5c7a1f;
    }
    .dd-player-card input:focus-visible { outline: 3px solid #0b7fb5; outline-offset: 2px; }
    .dd-player-hint { margin: 8px 0 0 !important; font-size: .82rem; color: #4b6a7d !important; }
    .dd-player-card button {
      margin-top: 14px; border: 2px solid #fff; color: #174c15; font-weight: bold;
      text-shadow: 0 1px #e4ffd3; cursor: pointer;
      background: linear-gradient(#edffdc, #abe86a 48%, #6cbd31 49%, #b7eb62);
      box-shadow: 0 5px 12px #15734c45, inset 0 0 0 1px #419c29, inset 0 2px 5px #fff;
      transition: filter .15s;
    }
    .dd-player-card button:hover { filter: brightness(1.06); }
    .dd-player-card button:focus-visible { outline: 3px solid #005aa8; outline-offset: 3px; }
    .dd-player-card button:disabled { opacity: .65; cursor: wait; filter: none; }
    .dd-player-error { min-height: 1.5em; margin-top: 10px !important; color: #a51f1f !important; font-weight: bold; }
    .dd-player-chip {
      position: fixed; right: 12px; bottom: 12px; z-index: 2147482000;
      padding: 8px 13px; border: 1px solid #ffffffd9; border-radius: 999px;
      color: #08466e; font: bold 12px/1.3 'Trebuchet MS', 'Segoe UI', sans-serif;
      background: linear-gradient(#f7fffff2, #cfeeffe6 48%, #b9e6f7e6 49%, #e8fffff2);
      box-shadow: 0 4px 14px #00527640, inset 0 1px #fff;
    }
    @media (max-width: 520px) {
      .dd-player-gate { padding: 12px; }
      .dd-player-content { padding: 18px 16px 20px; }
      .dd-player-titlebar { padding: 6px 10px; }
    }
    @media (prefers-reduced-motion: reduce) { .dd-player-card button { transition: none; } }
  `;
  document.head.append(css);

  const gate = document.createElement('div');
  gate.className = 'dd-player-gate';
  gate.innerHTML = `
    <section class="dd-player-card" role="dialog" aria-modal="true" aria-labelledby="dd-player-title">
      <div class="dd-player-titlebar">
        <span class="dd-player-orb" aria-hidden="true"></span>
        <span>DillDoe Player Setup</span>
        <span class="dd-player-dots" aria-hidden="true"><i></i><i></i><i></i></span>
      </div>
      <div class="dd-player-content">
        <h1 id="dd-player-title">Choose your player name</h1>
        <p class="dd-player-intro">Other players and games see this name, so use your real name or a nickname people will recognize — like “Alex”, “Apple”, or “Kya”. Use letters and spaces only; random typing such as “asdasd” is not accepted.</p>
        <p class="dd-player-note" hidden></p>
        <form>
          <label for="dd-player-name">Real name or nickname</label>
          <input id="dd-player-name" name="username" minlength="2" maxlength="24" pattern="[\\p{L} ]{2,24}" autocomplete="nickname" autocapitalize="words" spellcheck="false" required>
          <p class="dd-player-hint">2–24 letters and spaces. Numbers and symbols are not allowed.</p>
          <button type="submit">Save my name</button>
          <p class="dd-player-error" role="status" aria-live="polite"></p>
        </form>
      </div>
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
  const PLAYER_THEMES = new Set(['frutiger', 'pink', 'ps2', 'dark', 'flesh']);
  const THEME_KEY = 'dilldoe-theme';
  let playerReady = false;
  let reportedTheme = '';
  let themeReportQueue = Promise.resolve();

  async function request(url, options = {}) {
    const response = await fetch(url, { credentials: 'same-origin', cache: 'no-store', ...options });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || 'Player service is unavailable.');
    return result;
  }

  function currentTheme() {
    try {
      const saved = localStorage.getItem(THEME_KEY);
      return PLAYER_THEMES.has(saved) ? saved : 'frutiger';
    } catch (error) {
      return 'frutiger';
    }
  }

  function reportTheme(theme = currentTheme()) {
    if (!playerReady || !PLAYER_THEMES.has(theme) || theme === reportedTheme) return;
    reportedTheme = theme;
    themeReportQueue = themeReportQueue
      .then(() => request('/api/player/theme', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ theme }),
      }))
      .catch(() => { reportedTheme = ''; });
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
        playerReady = true;
        reportTheme();
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
      playerReady = true;
      reportTheme();
    } catch (error) {
      message.textContent = error.message;
    } finally {
      if (!gate.hidden && !form.hidden) {
        input.disabled = false;
        button.disabled = false;
      }
    }
  });

  document.addEventListener('dilldoe-theme-change', event => {
    reportTheme(event.detail?.theme);
  });

  loadPlayer();
})();
