import assert from 'node:assert/strict';
import test from 'node:test';
import { store } from '../activity/js/store.js';

const run = store.getState;
const prompt = () => run().commands[run().currentCommandIndex].expected;

test('Endless charges for typos and limits each assist to one use', () => {
  store.startGame('solo');
  store.setInput('!');
  assert.equal(run().score, -1);
  store.useAutoComplete();
  store.useAutoComplete();
  assert.equal(run().commandsCompleted, 1);
  store.useSlowTime();
  store.tick(2);
  store.useSlowTime();
  assert.equal(run().elapsedTime, 1);
  assert.equal(run().slowTimeRemaining, 3);
});

test('Sprint finishes at 60 seconds and Sudden death ends on an incorrect submission', () => {
  store.startGame('sprint');
  store.submitCommand(prompt());
  store.tick(60);
  assert.equal(run().status, 'summary');
  assert.equal(run().outcome, 'time');
  store.startGame('sudden');
  store.submitCommand('wrong');
  assert.equal(run().status, 'defeat');
  store.showResult();
  assert.equal(run().outcome, 'traced');
});

test('Duel waits at handoff and gives both players the same commands', () => {
  store.startGame('duel');
  store.resumeTurn();
  const sequence = [prompt()];
  store.submitCommand(prompt());
  sequence.push(prompt());
  const firstScore = run().score;
  store.tick(30);
  store.tick(10);
  assert.equal(run().status, 'handoff');
  assert.equal(run().elapsedTime, 0);
  assert.equal(run().firstScore, firstScore);
  store.resumeTurn();
  for (const expected of sequence) {
    assert.equal(prompt(), expected);
    store.submitCommand(expected);
  }
  store.tick(30);
  assert.equal(run().status, 'summary');
  assert.ok(run().score > firstScore);
});

test('Relay switches players after each set of three and finishes at twelve', () => {
  store.startGame('relay');
  for (let turn = 0; turn < 4; turn++) {
    assert.equal(run().status, 'handoff');
    assert.equal(run().player, turn % 2);
    store.resumeTurn();
    for (let i = 0; i < 3; i++) store.submitCommand(prompt());
  }
  assert.equal(run().status, 'summary');
  assert.equal(run().outcome, 'relay');
  assert.equal(run().commandsCompleted, 12);
});
