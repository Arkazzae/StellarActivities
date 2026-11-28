export const modes = {
  solo: { art: 'tunnel', name: 'Endless', group: 'single', description: 'Outlast the trace. Chase your high score.', modifiers: true, assists: true },
  sprint: { art: 'rush', name: 'Sprint', group: 'single', description: 'Score as much as you can in 60 seconds.', seconds: 60 },
  sudden: { art: 'fracture', name: 'Sudden death', group: 'single', description: 'One wrong command cuts the connection.', modifiers: true, assists: true },
  duel: { art: 'dual', name: 'Duel', group: 'multi', description: 'Same commands. Two 30-second turns. High score wins.', seconds: 30 },
  relay: { art: 'relay', name: 'Relay', group: 'multi', description: 'Clear 12 commands together. Switch every three.' },
};

export function playerLabel(player) {
  return `Player ${player + 1}`;
}
