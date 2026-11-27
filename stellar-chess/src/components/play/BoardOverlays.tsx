import { useGameStore } from "@/state/game";
import { useUiStore } from "@/state/ui";

function center(square: string, flipped: boolean): [number, number] {
  const file = square.charCodeAt(0) - 97;
  const rank = Number(square[1]) - 1;
  return [(flipped ? 7 - file : file) + 0.5, (flipped ? rank : 7 - rank) + 0.5];
}

function Arrow({ from, to, flipped, color, opacity, width = 0.2 }: { from: string; to: string; flipped: boolean; color: string; opacity: number; width?: number }) {
  const [x1, y1] = center(from, flipped);
  const [x2, y2] = center(to, flipped);
  const dx = x2 - x1;
  const dy = y2 - y1;
  const length = Math.hypot(dx, dy);
  if (length < 0.1) return null;
  const ux = dx / length;
  const uy = dy / length;
  const head = 0.42;
  const start = 0.28;
  const bx = x2 - ux * head;
  const by = y2 - uy * head;
  const px = -uy;
  const py = ux;
  const half = width / 2;
  const hw = width * 1.55;
  const points = [
    [x1 + ux * start + px * half, y1 + uy * start + py * half],
    [bx + px * half, by + py * half],
    [bx + px * hw, by + py * hw],
    [x2, y2],
    [bx - px * hw, by - py * hw],
    [bx - px * half, by - py * half],
    [x1 + ux * start - px * half, y1 + uy * start - py * half],
  ].map(([x, y]) => `${x.toFixed(3)},${y.toFixed(3)}`).join(" ");
  return <polygon points={points} fill={color} opacity={opacity} />;
}

/** The hint arrow, drawn over the board. */
export function BoardOverlays() {
  const flipped = useGameStore((s) => s.flipped);
  const phase = useGameStore((s) => s.phase);
  const viewPly = useGameStore((s) => s.viewPly);
  const hint = useUiStore((s) => s.hint);
  if (viewPly !== null || phase === "lobby" || !hint) return null;
  const [x, y] = center(hint.from, flipped);
  return (
    <svg className="board-overlay" viewBox="0 0 8 8" aria-hidden="true">
      <rect x={x - 0.5} y={y - 0.5} width="1" height="1" fill="#81b64c" opacity=".45" />
      <Arrow from={hint.from} to={hint.to} flipped={flipped} color="#81b64c" opacity={0.9} />
    </svg>
  );
}
