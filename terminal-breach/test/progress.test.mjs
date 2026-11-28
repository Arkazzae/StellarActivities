import assert from 'node:assert/strict';
import test from 'node:test';
import { openStorage, getBestScore, loadSettings, saveSetting, setBestScore, flushStorage } from '../activity/js/storage.js';

test('SDK saves preserve concurrent preferences and the higher record on each mode', async () => {
  let revision = 1;
  let data = { sound: false, solo: { score: 100 } };
  const progress = {
    async load() { return { data: structuredClone(data), revision }; },
    async save(next, expected) {
      if (revision !== expected) throw Object.assign(new Error('Conflict'), { status: 409 });
      data = structuredClone(next);
      return ++revision;
    },
  };
  await openStorage({ progress, capabilities: ['progress'] });
  assert.equal(getBestScore(), 100);
  assert.equal(loadSettings().sound, false);

  // Another device improves the record and unmutes the game before our save.
  data = { sound: true, solo: { score: 300 } };
  revision++;
  setBestScore(200, {}, 'solo');
  setBestScore(60, {}, 'sprint');
  saveSetting('effects', false);
  await flushStorage();
  assert.equal(getBestScore(), 300);
  assert.equal(data.solo.score, 300);
  assert.equal(data.sprint.score, 60);
  assert.equal(data.sound, true);
  assert.equal(data.effects, false);
});
