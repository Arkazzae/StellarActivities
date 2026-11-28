import { store } from './store.js';
import { renderMenu, renderSettings } from './screens/menu.js';
import { audio } from './audio.js';
import { loadSettings, saveSetting } from './storage.js';
import { mountPlaying } from './screens/playing.js';
import { renderDefeat, renderHandoff, renderSummary } from './screens/summary.js';
import { paintSignal, playInterference, SKULL_FRAMES } from './signal.js';

const DEFEAT_DURATION_MS = 1600;
let dispose;

export function initGame(session) {
  cleanupGame();
  const screen = document.getElementById('screen');
  const video = document.getElementById('bg-video');
  const trackingBand = document.querySelector('.crt-interference');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const settings = loadSettings();
  const volume = session?.media.volume;
  if (volume) Howler.volume(volume.get());
  const stopVolume = volume?.subscribe(value => Howler.volume(value));
  audio.setEnabled(settings.sound);
  audio.init();
  const bootAudio = () => audio.boot();
  const audioContext = globalThis.Howler?.ctx;
  const onAudioReady = () => { if (audioContext?.state === 'running') bootAudio(); };
  audioContext?.addEventListener('statechange', onAudioReady);
  onAudioReady();
  window.addEventListener('click', bootAudio, true);
  window.addEventListener('keydown', bootAudio, true);
  let animate = settings.effects ?? !reduced.matches;
  let refreshSettings;
  let group = null;
  let mounted = '';
  let playView;
  let signal;
  let kind;
  let frame = 0;
  let raf;
  let previousFaults = 0;
  let interference = [];
  let defeatTimer;
  let defeatStartedAt = 0;
  let lastTime = performance.now();
  let lastDraw = -Infinity;

  function paintCurrentSignal(now = performance.now()) {
    let sample = animate ? frame : 0;
    if (kind === 'skull') {
      const progress = animate ? (now - defeatStartedAt) / DEFEAT_DURATION_MS : .5;
      sample = Math.max(0, Math.min(SKULL_FRAMES - 1, Math.floor(progress * SKULL_FRAMES)));
    }
    paintSignal(signal, kind, sample);
  }

  function navigate(nextGroup) {
    const previousGroup = group;
    group = nextGroup;
    mounted = '';
    render(store.getState(), !nextGroup && previousGroup);
  }

  function clearInterference() {
    for (const animation of interference) animation.cancel();
    interference = [];
  }

  function render(state, restorePage) {
    if (mounted !== state.status) {
      clearTimeout(defeatTimer);
      clearInterference();
      previousFaults = state.faultCount;
      const old = mounted;
      mounted = state.status;
      if (state.status === 'menu' && old) group = null;
      let view;
      if (state.status === 'menu' && group === 'settings') view = renderSettings(screen, navigate, changeSetting);
      else if (state.status === 'menu') view = renderMenu(screen, group, navigate, scene => {
        kind = scene;
        paintCurrentSignal();
      });
      else if (state.status === 'handoff') view = renderHandoff(screen, state);
      else if (state.status === 'defeat') {
        defeatStartedAt = performance.now();
        view = renderDefeat(screen);
        audio.defeat();
        defeatTimer = setTimeout(store.showResult, DEFEAT_DURATION_MS);
      }
      else if (state.status === 'summary') view = renderSummary(screen, state);
      else {
        lastTime = performance.now();
        playView = mountPlaying(screen);
        view = {};
      }
      signal = screen.querySelector('.signal');
      kind = view.kind;
      refreshSettings = view.refresh;
      refreshSettings?.({ effects: animate, sound: settings.sound });
      const first = (restorePage && screen.querySelector(`[data-page="${restorePage}"]`)) || view.first;
      first?.focus({ preventScroll: true });
      screen.dataset.view = mounted;
      screen.dataset.group = group || '';
      paintCurrentSignal();
    }
    if (mounted === 'playing') {
      if (state.faultCount > previousFaults) {
        previousFaults = state.faultCount;
        if (state.traceMeter < 100) {
          audio.error();
          if (animate) {
            clearInterference();
            interference = playInterference(screen, trackingBand, state);
          }
        }
      }
      playView(state, animate ? frame : 0);
      screen.classList.toggle('alert', state.traceMeter > 75 || state.activeModifier === 'bomb' || state.history.at(-1)?.type === 'error');
    } else screen.classList.remove('alert');
  }
  function frameLoop(now) {
    if (now - lastTime >= 50) {
      const delta = (now - lastTime) / 1000;
      lastTime = now;
      store.tick(delta);
    }
    if (animate && kind === 'skull') {
      paintCurrentSignal(now);
    } else if (animate && now - lastDraw >= 110) {
      lastDraw = now;
      frame++;
      paintCurrentSignal(now);
    }
    raf = requestAnimationFrame(frameLoop);
  }
  function effects(enabled) {
    animate = enabled;
    frame = 0;
    document.getElementById('game-container').classList.toggle('fx-off', !enabled);
    refreshSettings?.({ effects: animate, sound: settings.sound });
    if (enabled) video.play().catch(() => {});
    else {
      video.pause();
      clearInterference();
    }
    paintCurrentSignal();
    if (mounted === 'playing') render(store.getState());
  }
  function changeSetting(key) {
    if (key === 'effects') {
      settings.effects = !animate;
      effects(settings.effects);
    } else {
      settings.sound = !settings.sound;
      audio.setEnabled(settings.sound);
      audio.boot();
      if (settings.sound) audio.menuClick(true);
      refreshSettings?.({ effects: animate, sound: settings.sound });
    }
    saveSetting(key, settings[key]);
  }
  const onPreference = () => {
    if (settings.effects === undefined) effects(!reduced.matches);
  };
  function menuPointer(e) {
    if (e.pointerType !== 'mouse' || mounted === 'playing') return;
    const button = e.target.closest('button');
    if (button && button !== document.activeElement) button.focus({ preventScroll: true });
  }
  function menuFocus(e) {
    if (mounted !== 'playing' && e.target.matches('button') && screen.contains(e.relatedTarget)) audio.menuClick();
  }
  function buttonClick(e) {
    const button = e.target.closest('button');
    if (button && !button.disabled && button.dataset.setting !== 'sound') audio.menuClick(true);
  }
  function keys(e) {
    if (e.altKey || e.ctrlKey || e.metaKey || e.defaultPrevented || e.isComposing) return;
    if (mounted === 'playing' || mounted === 'defeat') return;
    if (e.key === 'Escape') {
      if (mounted === 'menu' && !group) return;
      audio.menuClick(true);
      if (mounted === 'menu') navigate(null);
      else store.reset();
      return;
    }
    const buttons = [...screen.querySelectorAll('button:not(:disabled)')];
    const dir = { ArrowDown: 1, ArrowRight: 1, s: 1, d: 1, ArrowUp: -1, ArrowLeft: -1, w: -1, a: -1 }[e.key];
    if (dir) {
      e.preventDefault();
      const index = buttons.indexOf(document.activeElement);
      buttons[(index + dir + buttons.length) % buttons.length]?.focus();
    }
  }
  screen.addEventListener('pointermove', menuPointer);
  screen.addEventListener('focusin', menuFocus);
  screen.addEventListener('click', buttonClick, true);
  reduced.addEventListener('change', onPreference);
  window.addEventListener('keydown', keys);
  const unsubscribe = store.subscribe(render);
  render(store.getState());
  effects(animate);
  raf = requestAnimationFrame(frameLoop);
  dispose = () => {
    cancelAnimationFrame(raf);
    clearInterference();
    window.removeEventListener('click', bootAudio, true);
    window.removeEventListener('keydown', bootAudio, true);
    audioContext?.removeEventListener('statechange', onAudioReady);
    stopVolume?.();
    video.pause();
    audio.dispose();
    clearTimeout(defeatTimer);
    unsubscribe();
    screen.removeEventListener('pointermove', menuPointer);
    screen.removeEventListener('focusin', menuFocus);
    screen.removeEventListener('click', buttonClick, true);
    window.removeEventListener('keydown', keys);
    reduced.removeEventListener('change', onPreference);
    screen.replaceChildren();
    store.reset();
  };
}

export function cleanupGame() {
  dispose?.();
  dispose = null;
}
