/**
 * Command pool, difficulty tiers, and modifier builders for endless Solo mode.
 */

export const COMMAND_POOL = [
  { id: 'scan-logs', expected: 'scan logs', type: 'real' },
  { id: 'find-auth', expected: 'find auth', type: 'real' },
  { id: 'decode-key', expected: 'decode key', type: 'real' },
  { id: 'breach-nx7', expected: 'breach NX7', type: 'fantasy' },
  { id: 'unpack-backup', expected: 'unpack backup', type: 'real' },
  { id: 'reset-pulse', expected: 'reset pulse', type: 'fantasy' },
  { id: 'erase-trace', expected: 'erase trace', type: 'real' },
  { id: 'start-sequence', expected: 'start sequence', type: 'real' },
  { id: 'read-cipher', expected: 'read cipher', type: 'real' },
  { id: 'decrypt-ghost', expected: 'decrypt ghost', type: 'fantasy' },
  { id: 'find-keys', expected: 'find keys', type: 'real' },
  { id: 'connect-core', expected: 'connect core', type: 'fantasy' },
  { id: 'read-token', expected: 'read token', type: 'real' },
  { id: 'wipe-trace', expected: 'wipe trace', type: 'real' },
  { id: 'enter-mainframe', expected: 'enter mainframe', type: 'fantasy' },
  { id: 'purge-intrusion-log', expected: 'purge intrusion log', type: 'real' },
  { id: 'reroute-backup-power', expected: 'reroute backup power', type: 'fantasy' },
  { id: 'sync-dead-keys', expected: 'synchronize dead keys', type: 'fantasy' },
  { id: 'decrypt-sec-kernel', expected: 'decrypt security kernel', type: 'real' },
  { id: 'bypass-firewall', expected: 'bypass firewall array', type: 'real' },
  { id: 'compile-exploit', expected: 'compile exploit chain', type: 'fantasy' },
  { id: 'flush-buffer', expected: 'flush memory buffer', type: 'real' },
  { id: 'inject-token', expected: 'inject override token', type: 'fantasy' },
  { id: 'isolate-core', expected: 'isolate core process', type: 'real' },
  { id: 'sanitize-audit', expected: 'sanitize audit trail', type: 'real' },
];

export const BOMB_COMMAND_POOL = [
  'hold pulse',
  'receive 42',
  'stop sequence',
  'engage shroud',
  'override core',
  'connect core',
];

export const TIERS = [
  { tier: 0, atSeconds: 0, atCommands: 0, minLen: 8, maxLen: 13, timeLimit: null, tracePenalty: 15, modifierChance: 0.06 },
  { tier: 1, atSeconds: 20, atCommands: 8, minLen: 9, maxLen: 14, timeLimit: null, tracePenalty: 18, modifierChance: 0.10 },
  { tier: 2, atSeconds: 45, atCommands: 18, minLen: 10, maxLen: 16, timeLimit: 16, tracePenalty: 20, modifierChance: 0.14 },
  { tier: 3, atSeconds: 75, atCommands: 30, minLen: 12, maxLen: 19, timeLimit: 13, tracePenalty: 24, modifierChance: 0.18 },
  { tier: 4, atSeconds: 110, atCommands: 45, minLen: 14, maxLen: 21, timeLimit: 10, tracePenalty: 28, modifierChance: 0.22 },
  { tier: 5, atSeconds: 150, atCommands: 65, minLen: 16, maxLen: 23, timeLimit: 8, tracePenalty: 32, modifierChance: 0.26 },
];

export const GHOST_DURATION_SECONDS = 7;
export const MODIFIER_COOLDOWN = 3;
export const RECENT_HISTORY_SIZE = 4;
export const COMBO_CAP = 20;

// Difficulty advances on whichever the player is ahead on: time survived or
// raw throughput. Without the command track, a fast typist stays on trivial
// commands indefinitely while the combo multiplier runs away.
export function getTier(elapsedTime, commandsCompleted = 0) {
  let byTime = TIERS[0];
  let byCommands = TIERS[0];
  for (const t of TIERS) {
    if (elapsedTime >= t.atSeconds) byTime = t;
    if (commandsCompleted >= t.atCommands) byCommands = t;
  }
  return byTime.tier >= byCommands.tier ? byTime : byCommands;
}

export function comboMultiplier(combo) {
  return 1 + Math.min(combo, COMBO_CAP) * 0.1;
}

export function pickCommand(tier, excludeIds = []) {
  const cfg = TIERS[Math.min(tier, TIERS.length - 1)];
  let candidates = COMMAND_POOL.filter(
    (c) => c.expected.length >= cfg.minLen && c.expected.length <= cfg.maxLen && !excludeIds.includes(c.id),
  );
  if (candidates.length === 0) {
    candidates = COMMAND_POOL.filter((c) => !excludeIds.includes(c.id));
  }
  if (candidates.length === 0) {
    candidates = COMMAND_POOL;
  }
  return candidates[Math.floor(Math.random() * candidates.length)];
}

export function pickModifierKind() {
  return Math.random() < 0.5 ? 'bomb' : 'ghost';
}

export function buildBombChain(tier) {
  const steps = tier >= 3 ? 3 : 2;
  const pool = [...BOMB_COMMAND_POOL].sort(() => Math.random() - 0.5).slice(0, steps);
  const baseTimes = steps === 3 ? [12, 8, 5] : [10, 6];
  const shrink = Math.max(0, tier - 1);
  return pool.map((expected, i) => ({
    id: `bomb-${i}`,
    expected,
    type: 'fantasy',
    timeLimit: Math.max(3, baseTimes[i] - shrink),
  }));
}
