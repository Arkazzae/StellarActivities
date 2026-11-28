import { audio } from '../audio.js';
import { accuracy, store } from '../store.js';
import { modes, playerLabel } from '../modes.js';
import { comboMultiplier } from '../../scenarios.js';

const hostMarkup = '<span class="hostname">guest@breach:</span>~$';

export function mountPlaying(screen) {
  screen.innerHTML = `
    <div class="round-head"><h2 class="round-title"></h2><span class="clock"></span></div>
    <div class="metrics"><span>Score <b data-stat="score"></b></span><span>Combo <b data-stat="combo"></b></span><span>Acc <b data-stat="acc"></b></span><span data-stat="danger"></span></div>
    <div class="console-scroll" role="region" aria-label="Terminal session" tabindex="0">
      <div class="log" aria-label="Terminal output"></div>
      <form class="command">
        <div class="prompt"><span class="shell-prompt" aria-hidden="true">${hostMarkup}</span>
          <div class="line"><div class="ghost-line" aria-hidden="true"><span class="ink"></span><span class="hint"></span><span class="block-caret"></span></div><input id="typed" type="text" aria-label="Command" aria-describedby="target command-status" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" enterkeyhint="go" maxlength="100"></div>
          <button class="enter-key quiet" type="submit" aria-label="Submit command">Enter</button>
        </div>
        <label class="command-label" id="command-status" for="typed"></label>
        <span class="sr-only" id="target"></span>
      </form>
    </div>
    <footer class="foot round-foot"><button type="button" class="quiet leave">← Menu</button><span class="assists"><button type="button" class="quiet complete">Tab · Complete</button><button type="button" class="quiet slow">Esc · Slow</button></span></footer>`;
  const input = screen.querySelector('input');
  const log = screen.querySelector('.log');
  const scrollback = screen.querySelector('.console-scroll');
  const caret = screen.querySelector('.block-caret');
  const overlay = screen.querySelector('.ghost-line');
  const title = screen.querySelector('.round-title');
  const clock = screen.querySelector('.clock');
  const stats = Object.fromEntries([...screen.querySelectorAll('[data-stat]')].map(el => [el.dataset.stat, el]));
  const ink = screen.querySelector('.ink');
  const hint = screen.querySelector('.hint');
  const label = screen.querySelector('label');
  const target = screen.querySelector('#target');
  const assists = screen.querySelector('.assists');
  const complete = screen.querySelector('.complete');
  const slow = screen.querySelector('.slow');
  let previousHistory;
  let submitted = [];
  let historyIndex = 0;
  let draft = '';
  let editStart;
  let composing = false;

  function setText(el, text) { if (el.textContent !== text) el.textContent = text; }

  function syncCaret() {
    let column = input.selectionStart ?? input.value.length;
    if (!composing && column !== input.selectionEnd) {
      if (input.selectionDirection !== 'backward') column = input.selectionEnd;
      input.setSelectionRange(column, column);
    }
    const left = column + 'ch';
    if (caret.style.left !== left) caret.style.left = left;
    caret.hidden = column !== input.selectionEnd;
    setText(caret, (input.value + hint.textContent)[column] || ' ');
    overlay.style.transform = `translateX(${-input.scrollLeft}px)`;
  }

  function followPrompt() { scrollback.scrollTop = scrollback.scrollHeight; }
  function applyEdit(edit) {
    if (edit?.end > edit?.start || input.value.length > store.getState().input.length) audio.type();
    historyIndex = submitted.length;
    store.setInput(input.value, edit);
    editStart = undefined;
    followPrompt();
  }
  input.onbeforeinput = () => { if (!composing) editStart = input.selectionStart; };
  input.addEventListener('compositionstart', () => {
    composing = true;
    editStart = input.selectionStart;
  });
  input.addEventListener('compositionend', event => {
    composing = false;
    const start = editStart;
    const end = start + event.data.length;
    applyEdit(event.data && input.value.slice(start, end) === event.data ? { start, end } : undefined);
  });
  input.oninput = event => {
    if (composing || event.isComposing) return;
    if (event.inputType === 'insertFromComposition' && input.value === store.getState().input) return;
    if (event.inputType?.startsWith('insert')) {
      const end = input.selectionStart;
      const matchesData = event.data && input.value.slice(0, end).endsWith(event.data);
      const start = matchesData ? end - event.data.length : editStart;
      applyEdit(start >= 0 && start <= end ? { start, end } : undefined);
    } else {
      applyEdit(event.inputType ? false : undefined);
    }
  };
  input.onselect = input.onscroll = input.onkeyup = input.onpointerup = syncCaret;
  screen.querySelector('form').onsubmit = e => {
    e.preventDefault();
    store.submitCommand(input.value);
    if (input.isConnected) { input.focus({ preventScroll: true }); followPrompt(); }
  };
  scrollback.onclick = e => {
    if (e.target === scrollback) input.focus();
  };
  input.onkeydown = e => {
    if (e.isComposing || e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.key === 'Home' || e.key === 'End') {
      e.preventDefault();
      const destination = e.key === 'Home' ? 0 : input.value.length;
      input.setSelectionRange(destination, destination);
      syncCaret();
      return;
    }
    if ((e.key === 'ArrowUp' || e.key === 'ArrowDown') && submitted.length) {
      e.preventDefault();
      if (historyIndex === submitted.length) draft = input.value;
      historyIndex = Math.min(submitted.length, Math.max(0, historyIndex + (e.key === 'ArrowUp' ? -1 : 1)));
      const value = submitted[historyIndex] ?? draft;
      store.setInput(value, false);
      input.setSelectionRange(value.length, value.length);
      syncCaret();
      followPrompt();
      return;
    }
    if (!modes[store.getState().mode].assists) return;
    if (e.key === 'Escape' || (e.key === 'Tab' && !e.shiftKey && store.getState().autoCompletesLeft)) {
      e.preventDefault();
      if (e.key === 'Escape') store.useSlowTime();
      else store.useAutoComplete();
    }
  };
  screen.querySelector('.leave').onclick = store.reset;
  complete.onclick = () => { store.useAutoComplete(); if (input.isConnected) input.focus(); };
  slow.onclick = () => { store.useSlowTime(); input.focus(); };
  input.focus({ preventScroll: true });
  return (s, frame) => {
    const mode = modes[s.mode];
    const expected = s.commands[s.currentCommandIndex].expected;
    setText(title, mode.group === 'multi' ? mode.name + ' / ' + playerLabel(s.player) : mode.name);
    const seconds = mode.seconds ? Math.ceil(mode.seconds - s.elapsedTime) : Math.floor(s.elapsedTime);
    setText(clock, Math.floor(seconds / 60) + ':' + String(seconds % 60).padStart(2, '0'));
    setText(stats.score, s.score.toLocaleString());
    setText(stats.combo, `${s.combo} ×${comboMultiplier(s.combo).toFixed(1)}`);
    setText(stats.acc, accuracy(s) + '%');
    setText(stats.danger, mode.seconds ? 'LV ' + (s.difficultyTier + 1) : 'TRACE ' + s.traceMeter + '%');
    stats.danger.classList.toggle('danger', s.traceMeter >= 75);
    if (s.history !== previousHistory) {
      const following = !previousHistory || scrollback.scrollHeight - scrollback.clientHeight - scrollback.scrollTop < 4;
      previousHistory = s.history;
      submitted = [];
      const lines = s.history.map(entry => {
        const line = document.createElement('div');
        line.className = entry.type;
        if (entry.text.startsWith('> ')) {
          const command = entry.text.slice(2);
          submitted.push(command);
          const prompt = document.createElement('span');
          prompt.className = 'shell-prompt';
          prompt.innerHTML = hostMarkup;
          line.className = 'echo';
          line.append(prompt, ' ' + command);
        } else line.textContent = entry.text;
        return line;
      });
      historyIndex = submitted.length;
      draft = '';
      log.replaceChildren(...lines);
      if (following) followPrompt();
    }
    if (!composing && input.value !== s.input) input.value = s.input;
    const typed = input.value;
    if (ink.dataset.typed !== typed || ink.dataset.expected !== expected) {
      ink.dataset.typed = typed;
      ink.dataset.expected = expected;
      ink.replaceChildren(...Array.from(typed, (char, i) => {
        if (char === expected[i]) return char;
        const bad = document.createElement('em');
        bad.textContent = char;
        return bad;
      }));
    }
    // Only distort the remaining prompt.
    let rest = expected.slice(Array.from(typed).length);
    if (s.activeModifier === 'ghost' && frame && frame % 19 === 1 && rest.length > 2) {
      rest = rest[1] + rest[0] + rest.slice(2);
    }
    setText(hint, rest);
    setText(target, 'Type ' + expected);
    const commandLabel = s.mode === 'relay' ? `Relay ${s.commandsCompleted + 1}/12` : '';
    const timer = s.commandTimeLeft === null ? '' : ` · ${Math.ceil(s.commandTimeLeft)}s`;
    const modifier = s.activeModifier === 'ghost' ? ' · Ghost interference' : s.activeModifier === 'bomb' ? ' · Countermeasure armed' : '';
    setText(label, (commandLabel + modifier + timer).replace(/^ · /, ''));
    syncCaret();
    assists.hidden = !mode.assists;
    complete.disabled = s.autoCompletesLeft === 0;
    slow.disabled = s.slowTimeLeft === 0;
    setText(slow, s.slowTimeRemaining > 0 ? 'Slow active' : 'Esc · Slow');
  };
}
