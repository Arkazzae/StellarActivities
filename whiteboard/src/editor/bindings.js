import { bindingPoint, centerOf, hitElement, normalizePoints, toWorld } from "../model/geometry.js";
import { isBindable } from "../model/types.js";
export const bindingGap = (arrow) => 4 + arrow.strokeWidth;
/**
 * Re-routes the bound ends of an arrow so they touch the outline of their
 * targets. Returns null when nothing is bound.
 */
export const routeArrow = (arrow, lookup) => {
  if (arrow.type !== "arrow" || arrow.points.length < 2) return null;
  const start = arrow.startBind === null ? undefined : lookup(arrow.startBind.id);
  const end = arrow.endBind === null ? undefined : lookup(arrow.endBind.id);
  const patch = {};
  if (arrow.startBind !== null && start === undefined) patch.startBind = null;
  if (arrow.endBind !== null && end === undefined) patch.endBind = null;
  if (start === undefined && end === undefined) return Object.keys(patch).length > 0 ? patch : null;
  if (start !== undefined && end !== undefined && start.id === end.id)
    return Object.keys(patch).length > 0 ? patch : null;
  const world = arrow.points.map(([px, py]) => toWorld(arrow, px, py));
  const count = world.length;
  const gap = bindingGap(arrow);
  if (start !== undefined) {
    const neighbor = count > 2 ? world[1] : end !== undefined ? centerOf(end) : world[count - 1];
    world[0] = bindingPoint(start, neighbor, gap);
  }
  if (end !== undefined) {
    const neighbor = count > 2 ? world[count - 2] : start !== undefined ? centerOf(start) : world[0];
    world[count - 1] = bindingPoint(end, neighbor, gap);
  }
  const normalized = normalizePoints(
    0,
    0,
    world.map((point) => [point.x, point.y]),
  );
  return { ...patch, ...normalized, angle: 0 };
};
/** Topmost element an arrow end at `point` would attach to. */
export const bindTargetAt = (ordered, point, tolerance, exclude) => {
  for (let index = ordered.length - 1; index >= 0; index -= 1) {
    const el = ordered[index];
    if (!isBindable(el) || exclude.has(el.id) || el.locked) continue;
    if (hitElement(el, point.x, point.y, tolerance, true)) return el;
  }
  return null;
};
