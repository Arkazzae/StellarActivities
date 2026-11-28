import {
  getTier, pickCommand, pickModifierKind, buildBombChain, comboMultiplier,
  GHOST_DURATION_SECONDS, MODIFIER_COOLDOWN, RECENT_HISTORY_SIZE,
} from '../scenarios.js';
import { generateOutput } from '../parser.js';
import { getBestScore, setBestScore } from './storage.js';
import { modes } from './modes.js';

const initialState = {
  status: 'menu', mode: null, elapsedTime: 0, difficultyTier: 0,
  activeModifier: null, modifierTimeLeft: null, commandsCompleted: 0,
  commandsSinceModifier: 0, recentCommandIds: [], score: 0, combo: 0, faultCount: 0,
  traceMeter: 0, currentCommandIndex: 0, commandTimeLeft: null,
  autoCompletesLeft: 1, slowTimeLeft: 1, slowTimeRemaining: 0,
  commands: [], history: [], input: '', totalCharsTyped: 0, correctCharsTyped: 0,
  activeSecondsTyping: 0, commandTimes: [], lastCommandStartTime: 0,
  bestScore: 0, isNewBest: false, player: 0, firstScore: null, outcome: '',
};

let state = { ...initialState };
let duelDeck = [];
const listeners = new Set();

function setState(update) {
  state = { ...state, ...update };
  for (const fn of listeners) fn(state);
}

function turnState(mode, player = 0) {
  const first = mode === 'duel' ? duelCommand(0) : pickCommand(0);
  return {
    ...initialState, mode, player, status: modes[mode].group === 'multi' ? 'handoff' : 'playing',
    commands: [first], recentCommandIds: [first.id], bestScore: getBestScore(mode),
    lastCommandStartTime: Date.now(), history: [],
  };
}

function duelCommand(index) {
  if (!duelDeck[index]) {
    const recent = duelDeck.slice(-RECENT_HISTORY_SIZE).map(command => command.id);
    duelDeck.push(pickCommand(getTier(0, index).tier, recent));
  }
  return duelDeck[index];
}

function startGame(mode = 'solo') {
  if (!Object.hasOwn(modes, mode)) return;
  duelDeck = [];
  setState(turnState(mode));
}

function resumeTurn() {
  if (state.status === 'handoff') setState({ status: 'playing', lastCommandStartTime: Date.now() });
}

function endGame(outcome) {
  if (state.status !== 'playing') return;
  if (state.mode === 'duel' && state.player === 0) {
    setState({ ...turnState('duel', 1), firstScore: state.score });
    return;
  }
  const isNewBest = state.mode !== 'duel' && state.score > state.bestScore;
  if (isNewBest) {
    setBestScore(state.score, {
      tierReached: state.difficultyTier, commandsCompleted: state.commandsCompleted,
      accuracy: accuracy(state),
    }, state.mode);
  }
  const lost = ['traced', 'timeout', 'bomb'].includes(outcome);
  setState({ status: lost ? 'defeat' : 'summary', outcome, isNewBest, bestScore: isNewBest ? state.score : state.bestScore });
}

export function accuracy(run) {
  return run.totalCharsTyped ? Math.round(run.correctCharsTyped * 100 / run.totalCharsTyped) : 100;
}

function tick(delta) {
  if (state.status !== 'playing') return;
  const remainingSlow = Math.max(0, state.slowTimeRemaining - delta);
  const effective = delta - Math.min(delta, state.slowTimeRemaining) / 2;
  const elapsed = state.elapsedTime + effective;
  const timeLimit = modes[state.mode].seconds;
  const commandTimeLeft = state.commandTimeLeft === null ? null : Math.max(0, state.commandTimeLeft - effective);
  const ghostLeft = state.modifierTimeLeft === null ? null : Math.max(0, state.modifierTimeLeft - effective);
  setState({
    elapsedTime: timeLimit ? Math.min(timeLimit, elapsed) : elapsed,
    difficultyTier: getTier(state.mode === 'duel' ? 0 : elapsed, state.commandsCompleted).tier,
    slowTimeRemaining: remainingSlow, commandTimeLeft, modifierTimeLeft: ghostLeft,
    activeModifier: ghostLeft === 0 ? null : state.activeModifier,
    activeSecondsTyping: state.activeSecondsTyping + (state.input.length ? delta : 0),
  });
  if (timeLimit && elapsed >= timeLimit) endGame('time');
  else if (commandTimeLeft === 0) endGame(state.activeModifier === 'bomb' ? 'bomb' : 'timeout');
}

function changedRange(previous, input) {
  let start = 0;
  while (start < previous.length && start < input.length && previous[start] === input[start]) start++;
  let suffix = 0;
  while (suffix < Math.min(previous.length, input.length) - start &&
    previous.at(-1 - suffix) === input.at(-1 - suffix)) suffix++;
  return { start, end: input.length - suffix };
}

function setInput(input, edit) {
  if (state.status !== 'playing') return;
  if (input === state.input && !edit) return;
  if (edit === false) { setState({ input }); return; }
  const { start, end } = edit && edit !== true ? edit : changedRange(state.input, input);
  const added = Array.from(input.slice(start, end));
  const offset = Array.from(input.slice(0, start)).length;
  const expected = state.commands[state.currentCommandIndex].expected;
  const correct = added.filter((char, i) => char === expected[offset + i]).length;
  const mistakes = added.length - correct;
  setState({
    input, score: state.score - mistakes, faultCount: state.faultCount + mistakes,
    totalCharsTyped: state.totalCharsTyped + added.length,
    correctCharsTyped: state.correctCharsTyped + correct,
  });
}

function nextChallenge(completed) {
  const mode = modes[state.mode];
  const tier = getTier(state.mode === 'duel' ? 0 : state.elapsedTime, completed);
  const recent = [...state.recentCommandIds, state.commands[state.currentCommandIndex].id].slice(-RECENT_HISTORY_SIZE);
  const since = state.commandsSinceModifier + 1;
  const modifier = mode.modifiers && since >= MODIFIER_COOLDOWN && Math.random() < tier.modifierChance ? pickModifierKind() : null;
  const commands = modifier === 'bomb' ? buildBombChain(tier.tier)
    : [state.mode === 'duel' ? duelCommand(completed) : pickCommand(tier.tier, recent)];
  return {
    commands, recentCommandIds: recent, difficultyTier: tier.tier, currentCommandIndex: 0,
    activeModifier: modifier, modifierTimeLeft: modifier === 'ghost' ? GHOST_DURATION_SECONDS : null,
    commandTimeLeft: modifier === 'bomb' ? commands[0].timeLimit : mode.modifiers ? tier.timeLimit : null,
    commandsSinceModifier: modifier ? 0 : since,
  };
}

function submitCommand(input, assisted = false) {
  if (state.status !== 'playing' || !input.trim()) return;
  const command = state.commands[state.currentCommandIndex];
  const correct = input.trim() === command.expected;
  const history = [...state.history, ...generateOutput(input.trim(), command.type, correct).map(text => ({
    text, type: correct ? 'output' : 'error',
  }))].slice(-30);
  const inBomb = state.activeModifier === 'bomb';
  if (!correct) {
    const penalty = getTier(state.elapsedTime, state.commandsCompleted).tracePenalty;
    const traceMeter = state.mode === 'sudden' ? 100
      : modes[state.mode].seconds || inBomb ? state.traceMeter : Math.min(100, state.traceMeter + penalty);
    setState({ history, input: '', combo: inBomb ? state.combo : 0, traceMeter, faultCount: state.faultCount + 1 });
    if (traceMeter >= 100) endGame('traced');
    return;
  }

  const completed = state.commandsCompleted + 1;
  const combo = state.combo + 1;
  const base = Math.floor(command.expected.length * (assisted ? 8 : 10)) + state.difficultyTier * 20;
  const now = Date.now();
  const update = {
    score: state.score + Math.round(base * comboMultiplier(state.combo)), combo,
    commandsCompleted: completed, input: '', history,
    commandTimes: [...state.commandTimes, now - state.lastCommandStartTime],
    lastCommandStartTime: now, autoCompletesLeft: state.autoCompletesLeft - Number(assisted),
  };
  if (state.mode === 'relay' && completed === 12) {
    setState(update);
    endGame('relay');
    return;
  }
  if (inBomb && state.currentCommandIndex + 1 < state.commands.length) {
    const index = state.currentCommandIndex + 1;
    setState({ ...update, currentCommandIndex: index, commandTimeLeft: state.commands[index].timeLimit });
    return;
  }
  if (inBomb) history.push({ text: 'Countermeasure defused.', type: 'output' });
  const handoff = state.mode === 'relay' && completed % 3 === 0;
  setState({ ...update, ...nextChallenge(completed), ...(handoff ? { status: 'handoff', player: 1 - state.player } : {}) });
}

function useAutoComplete() {
  if (state.status === 'playing' && modes[state.mode].assists && state.autoCompletesLeft > 0) {
    submitCommand(state.commands[state.currentCommandIndex].expected, true);
  }
}

function useSlowTime() {
  if (state.status === 'playing' && modes[state.mode].assists && state.slowTimeLeft > 0) {
    setState({ slowTimeLeft: 0, slowTimeRemaining: 5 });
  }
}

export const store = {
  showResult() { if (state.status === 'defeat') setState({ status: 'summary' }); },
  getState: () => state, subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
  startGame, resumeTurn, tick, setInput, submitCommand, useAutoComplete, useSlowTime,
  reset() { duelDeck = []; setState({ ...initialState }); },
};
