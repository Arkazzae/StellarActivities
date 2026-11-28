import { modes } from '../modes.js';
import { getBestScore } from '../storage.js';
import { store } from '../store.js';

const groups = {
  single: { name: 'Single', description: 'One player', detail: 'Choose a solo run.' },
  multi: { name: 'Multi', description: 'Two players, one keyboard', detail: 'Take turns on the same keyboard.' },
  settings: { name: 'Settings', description: 'Effects and sound' },
};

const masthead = `█▀▀▀▄  █▀▀▀▄  █▀▀▀▀  ▄▀▀▀▄  ▄▀▀▀▀  █   █
█▄▄▄▀  █▄▄▄▀  █▄▄▄   █▄▄▄█  █      █▄▄▄█
█   █  █ ▀▄   █      █   █  █      █   █
▀▀▀▀   ▀   ▀  ▀▀▀▀▀  ▀   ▀   ▀▀▀▀  ▀   ▀`;

export function renderMenu(screen, group, navigate, preview) {
  const current = groups[group];
  const choices = current ? Object.entries(modes).filter(([, mode]) => mode.group === group) : Object.entries(groups);
  screen.innerHTML = `
    <div class="menu-layout">
      <div class="menu-heading">
        <h1>${current ? current.name : '<span class="sr-only">Terminal Breach</span><span class="title-line" aria-hidden="true">T E R M I N A L</span><span class="ascii-title" aria-hidden="true">' + masthead + '</span>'}</h1>
        <p class="intro">${current ? current.detail : 'Type the commands before you are traced.'}</p>
      </div>
      <figure class="engraving"><pre class="signal" aria-hidden="true"></pre></figure>
      <fieldset class="terminal-box"><legend>${current ? 'Select mode' : 'Main menu'}</legend>
        <nav class="choices" aria-label="${current ? 'Game modes' : 'Main menu'}"></nav>
      </fieldset>
    </div>
    <footer class="foot"><span class="navigation"></span><span>ENDLESS BEST <strong>${getBestScore().toLocaleString()}</strong></span></footer>`;
  const nav = screen.querySelector('nav');
  for (const [id, item] of choices) {
    const button = document.createElement('button');
    button.className = 'choice';
    if (!current) button.dataset.page = id;
    button.innerHTML = `<b>${item.name}</b><small>${item.description}</small>`;
    const art = current ? item.art : id === 'multi' ? 'dual' : 'open';
    button.onfocus = () => preview(art);
    button.onclick = () => {
      if (current) store.startGame(id);
      else navigate(id);
    };
    nav.append(button);
  }
  const navigation = screen.querySelector('.navigation');
  if (current) {
    const back = document.createElement('button');
    back.className = 'quiet';
    back.textContent = '← Back';
    back.onclick = () => navigate(null);
    navigation.append(back);
  } else navigation.innerHTML = '<span class="key-help">↑ ↓ Select &nbsp; ↵ Enter</span>';
  return { kind: current ? choices[0][1].art : 'open', first: nav.firstElementChild };
}

export function renderSettings(screen, navigate, changeSetting) {
  screen.innerHTML = `
    <div class="menu-layout">
      <div class="menu-heading"><h1>Settings</h1></div>
      <fieldset class="terminal-box"><legend>Preferences</legend>
        <div class="choices">
          <button class="choice preference" data-setting="effects" aria-label="Animated effects"><b>Animated effects</b><span></span></button>
          <button class="choice preference" data-setting="sound" aria-label="Sound"><b>Sound</b><span></span></button>
        </div>
      </fieldset>
    </div>
    <footer class="foot"><button class="quiet back">← Back</button></footer>`;
  const toggles = [...screen.querySelectorAll('[data-setting]')];
  for (const button of toggles) {
    button.onclick = () => changeSetting(button.dataset.setting);
  }
  screen.querySelector('.back').onclick = () => navigate(null);
  return {
    first: toggles[0],
    refresh(settings) {
      for (const button of toggles) {
        const enabled = settings[button.dataset.setting];
        button.setAttribute('aria-pressed', String(enabled));
        button.querySelector('span').textContent = enabled ? '[ON]' : '[OFF]';
      }
    },
  };
}
