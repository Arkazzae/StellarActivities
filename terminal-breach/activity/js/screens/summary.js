import { accuracy, store } from '../store.js';
import { modes, playerLabel } from '../modes.js';
import { showToast } from '../toast.js';

export function renderHandoff(screen, state) {
  const duel = state.mode === 'duel';
  const player = playerLabel(state.player);
  const detail = duel ? (state.player ? `Player 1 scored ${state.firstScore.toLocaleString()}. Your turn on the same sequence.` : 'You have 30 seconds. Player 2 gets the same commands.')
    : `Type commands ${state.commandsCompleted + 1}–${state.commandsCompleted + 3} of 12, then pass the keyboard.`;
  screen.innerHTML = `
    <div class="menu-layout"><div class="menu-heading"><h1><small>${modes[state.mode].name} / handoff</small>${player}</h1>
    <p class="intro">${detail}</p></div>
    <figure class="engraving"><pre class="signal" aria-hidden="true"></pre></figure>
    <button class="choice ready"><b>Start turn</b></button></div>
    <footer class="foot"><button class="quiet leave">← Menu</button></footer>`;
  screen.querySelector('.ready').onclick = store.resumeTurn;
  screen.querySelector('.leave').onclick = store.reset;
  return { kind: modes[state.mode].art, first: screen.querySelector('.ready') };
}

export function renderDefeat(screen) {
  screen.innerHTML = '<div class="skull-splash" role="img" aria-label="Connection lost. Blackwall skull."><pre class="signal" aria-hidden="true"></pre></div>';
  return { kind: 'skull' };
}

export function renderSummary(screen, state) {
  const duel = state.mode === 'duel';
  const completed = state.outcome === 'relay' || state.outcome === 'time';
  const title = duel ? (state.score === state.firstScore ? 'Draw' : (state.score > state.firstScore ? 'Player 2' : 'Player 1') + ' wins')
    : ({ time: 'Time up', traced: 'Traced', timeout: 'Link lost', bomb: 'Detonated', relay: 'Link secured' })[state.outcome];
  const stats = duel ? [['Player 1', state.firstScore.toLocaleString()], ['Player 2', state.score.toLocaleString()]]
    : [['Score', state.score.toLocaleString()], [state.isNewBest ? 'New best' : 'Best', state.bestScore.toLocaleString()],
      ['Commands', state.commandsCompleted], ['Accuracy', accuracy(state) + '%'],
      ['Avg speed', (state.commandTimes.length ? state.commandTimes.reduce((a,b) => a+b, 0) / state.commandTimes.length / 1000 : 0).toFixed(1) + 's'],
      ['Avg CPS', (state.activeSecondsTyping ? state.totalCharsTyped / state.activeSecondsTyping : 0).toFixed(1)]];
  const modeLabel = modes[state.mode].name + (duel ? '' : ' / LV ' + (state.difficultyTier + 1));
  screen.innerHTML = `
    <div class="menu-layout${completed ? '' : ' loss-report'}"><div class="menu-heading"><h1><small>${modeLabel} / result</small>${title}</h1>
    </div>${completed ? '<figure class="engraving"><pre class="signal" aria-hidden="true"></pre></figure>' : ''}
    <fieldset class="terminal-box report"><legend>Session log</legend><dl class="result-stats">${stats.map(([name,value]) => `<div><dt>${name}</dt><dd>${value}</dd></div>`).join('')}</dl>
    <button class="choice again"><b>Play again</b></button></fieldset></div>
    <footer class="foot"><button class="quiet leave">← Menu</button><button class="quiet share">Copy results</button></footer>`;
  screen.querySelector('.again').onclick = () => store.startGame(state.mode);
  screen.querySelector('.leave').onclick = store.reset;
  screen.querySelector('.share').onclick = async () => {
    try {
      await navigator.clipboard.writeText(['Terminal Breach', modes[state.mode].name, title, ...stats.map(pair => pair.join(' '))].join('\n'));
      showToast('Results copied.');
    } catch { showToast('Clipboard unavailable.', 'error'); }
  };
  return { kind: 'open', first: screen.querySelector('.again') };
}
