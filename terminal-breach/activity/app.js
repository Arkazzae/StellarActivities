import { initGame, cleanupGame } from './js/game.js';
import { openStorage, flushStorage } from './js/storage.js';

const banner = document.getElementById('connection-banner');
const shell = document.querySelector('.shell');

function hostMessage(message, blocking = true) {
  shell.hidden = Boolean(message) && blocking;
  banner.classList.toggle('notice', !blocking);
  banner.textContent = message;
  banner.hidden = !message;
}

async function start() {
  const root = document.getElementById('game-root');
  root.addEventListener('contextmenu', event => event.preventDefault());
  root.addEventListener('selectstart', event => event.preventDefault());
  root.addEventListener('keydown', event => {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'a') event.preventDefault();
  });

  let session;
  if (window.parent !== window) {
    hostMessage('Connecting to Stellarr…');
    try {
      const { connect } = await import('/_stellarr/sdk/v1.js');
      session = await connect();
    } catch {
      hostMessage('Could not connect to Stellarr. Reopen the activity to try again.');
      return;
    }
  }

  await openStorage(session);
  hostMessage('');
  if (session?.connection.get() !== 'closed') initGame(session);
  session?.connection.subscribe(status => {
    if (status === 'closed') {
      cleanupGame();
      hostMessage('Session closed.');
    } else if (status === 'reconnecting') {
      hostMessage('Reconnecting to Stellarr…', false);
    } else {
      hostMessage('');
      void flushStorage();
    }
  });
}

await start();
