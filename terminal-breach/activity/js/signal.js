import { closedLock, openLock, skull } from './ascii.js';

const locks = { open: openLock.split('\n'), closed: closedLock.split('\n') };
const width = 78;
const height = 42;
const scenes = new WeakMap();
const skullRows = skull.split('\n').map(row => '    ' + row);
const skullWidth = 68;
export const SKULL_FRAMES = 40;

function noise(x, y, frame) {
  const value = Math.sin(x * 127.1 + y * 311.7 + frame * 14.17) * 43758.55;
  return value - Math.floor(value);
}

// Keep the same piece of interference attached to each character across frames.
const skullParticles = skullRows.flatMap((row, y) => Array.from(row, (glyph, x) => {
  if (glyph === ' ') return null;
  const seed = noise(x, y, 1);
  return {
    glyph, x, y, seed,
    // Incoming characters arrive from horizontal bands. Debris leaves in columns.
    fromX: Math.floor(noise(x, y, 2) * skullWidth),
    fromY: Math.floor(noise(x, y, 3) * 8) * 4 + Math.floor(seed * 3),
    toX: Math.floor(noise(x, y, 4) * 13) * 5 + Math.floor(seed * 3),
    toY: Math.floor(noise(x, y, 5) * skullRows.length),
  };
}).filter(Boolean));

// Displace the emitted image, keeping the monitor housing and terminal layout fixed.
export function playInterference(screen, band, state) {
  const pressure = state.faultCount / 16 + state.commandsCompleted / 28 + state.traceMeter / 100 + state.elapsedTime / 150;
  const strength = pressure / (1 + pressure);
  const kick = (2 + 9 * strength) * (state.faultCount % 2 ? 1 : -1);
  const duration = 155 + 190 * strength;
  const shift = (x, y) => `translate(${x * kick}px, ${y * kick}px)`;
  band.style.top = (8 + state.faultCount * 29 % 67) + '%';
  band.style.height = (9 + 23 * strength) + '%';
  const shake = screen.animate([
    { transform: shift(1, -.18) },
    { transform: shift(-.72, .25), offset: .23 },
    { transform: shift(.42, -.14), offset: .49 },
    { transform: shift(-.17, 0), offset: .72 },
    { transform: 'none' },
  ], duration);
  const tracking = band.animate([
    { opacity: .30 + .50 * strength, transform: 'translate(-1%, -15%)' },
    { opacity: .23 + .32 * strength, transform: 'translate(1%, 10%)', offset: .36 },
    { opacity: 0, transform: 'translate(-.4%, 64%)' },
  ], duration);
  return [shake, tracking];
}

// Each raster is written as character rows so it stays a real text engraving.
function drawWall(frame, closed) {
  const lock = closed ? locks.closed : locks.open;
  const cy = (height - lock.length) >> 1;
  const scan = (frame + 7) % 56;
  const ripple = frame * .16;
  const rows = [];
  for (let y = 0; y < height; y++) {
    const slice = y === scan || y === scan + 1;
    const shift = slice ? (closed ? -3 : 2) : 0;
    const ly = y - cy;
    const line = lock[ly] || '';
    let row = '';
    for (let x = 0; x < width; x++) {
      const lx = x - 15 - shift;
      const ink = line[lx];
      if (ink && ink !== ' ') { row += ink; continue; }
      const edge = Math.abs(x - width / 2) / (width / 2);
      const seam = Math.sin(y * .31 + x * .17 + Math.floor(x / 7) + frame * .1);
      const n = noise(x, y, Math.floor(frame / 4));
      // Two curtains of falling data recede around the open shackle.
      const curtain = edge + .11 * Math.sin(y * .19 + ripple * .27);
      const rail = (x + Math.floor(3 * Math.sin(y * .11 + ripple * .34))) % 7;
      const flow = ((y + (x % 13) * 5 - frame * (1 + x % 2)) % 23 + 23) % 23;
      if (curtain > .61 && rail < 2 && flow < 17) {
        row += flow === 0 ? '#' : flow < 4 ? '1' : flow < 9 ? '|' : ':';
      } else if (slice && edge > .52) row += '-';
      else if ((curtain > .58 || ly < 0 || ly >= lock.length) && seam > .15 && n > .87)
        row += '.:/|1'[Math.floor(n * 431) % 5];
      else row += ' ';
    }
    rows.push(row);
  }
  return rows;
}

function drawWaves(frame) {
  const h = height;
  const amplitude = 11;
  const rows = Array.from({ length: h }, () => Array(width).fill(' '));
  for (let x = 0; x < width; x++) {
    const phase = x * .105 + frame * .155;
    const envelope = .22 + .78 * Math.pow(Math.sin(x * .055 + frame * .045), 2);
    if (x % 4 === 0) rows[h >> 1][x] = '.';
    for (let channel = 0; channel < 2; channel++) {
      const wave = Math.sin(phase + channel * 2) + .23 * Math.sin(phase * 4 + channel);
      const offset = channel ? 3 : -3;
      const crest = Math.max(0, Math.min(h - 1, Math.round(h / 2 + offset + wave * amplitude * envelope)));
      const base = Math.floor(h / 2 + offset);
      for (let y = Math.min(crest, base) + 1; y < Math.max(crest, base); y++) {
        if ((x + y) % 3 === 0) rows[y][x] = channel ? ':' : '|';
      }
      rows[crest][x] = channel ? '+' : '#';
    }
  }
  return rows.map(row => row.join(''));
}

// Project a moving sequence of rectangular gates onto the terminal's character grid.
// The near edge expands faster than the far edge, giving the breach its depth.
function drawCorridor(frame, fast, alarm) {
  const tiles = Array.from({ length: height }, () => Array(width).fill(' '));
  const phase = frame * (fast ? .055 : .024);
  const vanX = width * (.53 + .05 * Math.sin(phase * .65));
  const vanY = height * (.43 + .035 * Math.cos(phase));
  for (let layer = 11; layer >= 0; layer--) {
    const z = layer + 1 - (phase % 1);
    const halfW = 63 / z;
    const halfH = 36 / z;
    const left = Math.round(vanX - halfW);
    const right = Math.round(vanX + halfW);
    const top = Math.round(vanY - halfH);
    const bottom = Math.round(vanY + halfH);
    for (let y = Math.max(0, top); y <= Math.min(height - 1, bottom); y++) {
      const rail = (y + layer) % 5 === 0;
      if (left >= 0 && left < width) tiles[y][left] = rail ? '+' : '|';
      if (right >= 0 && right < width) tiles[y][right] = rail ? '#' : ':';
      if (y !== top && y !== bottom) continue;
      for (let x = Math.max(0, left); x <= Math.min(width - 1, right); x++) {
        tiles[y][x] = (x + layer) % 6 === 0 ? '+' : y === top ? '-' : '=';
      }
    }
  }
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const u = (x - vanX) / width;
      const v = (y - vanY) / height;
      const edge = Math.max(Math.abs(u), Math.abs(v));
      if (edge < .105 || tiles[y][x] !== ' ') continue;
      const strut = Math.abs((Math.atan2(v, u) + Math.PI) * 2.55 % 1 - .5);
      const depth = 1 / (edge + .01) - phase * 2;
      if (strut < .025 + .018 * edge) tiles[y][x] = u * v > 0 ? '\\' : '/';
      else if (Math.sin(x * .58 + Math.floor(depth * 2)) > .7 && noise(x, Math.floor(y / 3), Math.floor(phase * 5)) > .86)
        tiles[y][x] = ':|!/01'[Math.abs(Math.floor(depth * 7 + y)) % 6];
      if (alarm && Math.abs(x - vanX - 11 * Math.sin(y * .22 + phase * 3)) < 1.4) tiles[y][x] = '#';
    }
  }
  return tiles.map(row => row.join(''));
}

function drawRelay(frame) {
  const rows = Array.from({ length: height }, () => Array(width).fill(' '));
  const center = height >> 1;
  const write = (x, y, text) => { [...text].forEach((c, i) => { rows[y][x+i] = c; }); };
  for (const [x, tag] of [[2, 'P1'], [60, 'P2']]) {
    ['.------------.', '|  .------.  |', '|  | >_   |  |', "|  '------'  |",
      '| [::]    [] |', '+------------+', '    [ ' + tag + ' ]'].forEach((s, i) => write(x, center - 4 + i, s));
  }
  const phase = frame % 80;
  for (let x = 16; x < 60; x++) {
    const y = center + Math.round(4 * Math.sin((x - 16) / 44 * Math.PI * 2));
    rows[y][x] = x % 3 === 0 ? ':' : '.';
    const packet = phase < 40 ? 16 + phase : 55 - (phase - 40);
    if (Math.abs(x - packet) < 3) rows[y][x] = phase < 40 ? '>' : '<';
  }
  return rows.map(row => row.join(''));
}

function drawSkull(frame) {
  const progress = frame / (SKULL_FRAMES - 1);
  const gatherEnd = .36;
  const scatterStart = .62;
  if (progress >= gatherEnd && progress <= scatterStart) return skullRows;

  const leaving = progress > scatterStart;
  const phase = leaving ? (progress - scatterStart) / (1 - scatterStart) : progress / gatherEnd;
  const grid = skullRows.map(() => Array(skullWidth).fill(' '));
  for (const p of skullParticles) {
    const sweep = leaving ? p.x / skullWidth : p.y / skullRows.length;
    const delay = sweep * .28 + p.seed * .14;
    const t = Math.max(0, Math.min(1, (phase - delay) / .58));
    const eased = t * t * (3 - 2 * t);
    const spread = leaving ? eased : 1 - eased;
    if (leaving && p.seed < (spread - .5) * 1.2) continue;
    const x = Math.round(p.x + ((leaving ? p.toX : p.fromX) - p.x) * spread);
    const y = Math.round(p.y + ((leaving ? p.toY : p.fromY) - p.y) * spread);
    const glyphs = leaving ? '.:/|01+' : ':|/!%#01';
    grid[y][x] = spread < .07 ? p.glyph : glyphs[(Math.floor(p.seed * 61) + (frame >> 1)) % glyphs.length];
  }
  return grid.map(row => row.join(''));
}

export function paintSignal(element, kind, frame) {
  if (!element) return;
  const stamp = [kind, frame].join('/');
  if (scenes.get(element) === stamp) return;
  scenes.set(element, stamp);
  let rows;
  switch (kind) {
    case 'skull': rows = drawSkull(frame); break;
    case 'dual': rows = drawWaves(frame); break;
    case 'tunnel': case 'rush': case 'fracture': rows = drawCorridor(frame, kind === 'rush', kind === 'fracture'); break;
    case 'relay': rows = drawRelay(frame); break;
    default: rows = drawWall(frame, kind === 'closed');
  }
  if (element.childElementCount !== rows.length) {
    element.replaceChildren(...rows.map(() => document.createElement('span')));
  }
  rows.forEach((line, index) => {
    const span = element.children[index];
    if (span.textContent !== line) span.textContent = line;
    span.className = index === (frame + 7) % (rows.length + 14) ? 'scan' : '';
  });
}
