import { BezierPoint } from '../types';

/** Build an SVG path "d" string from bezier anchor points. */
export function buildSvgPathD(points: BezierPoint[] = [], closed = false): string {
  if (!points || points.length === 0) return '';
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;

  let d = `M ${points[0].x} ${points[0].y}`;
  for (let i = 0; i < points.length - 1; i++) {
    const curr = points[i];
    const next = points[i + 1];
    const cp1 = curr.handleOut || { x: curr.x, y: curr.y };
    const cp2 = next.handleIn || { x: next.x, y: next.y };
    d += ` C ${cp1.x} ${cp1.y}, ${cp2.x} ${cp2.y}, ${next.x} ${next.y}`;
  }
  if (closed && points.length > 2) {
    const last = points[points.length - 1];
    const first = points[0];
    const cp1 = last.handleOut || { x: last.x, y: last.y };
    const cp2 = first.handleIn || { x: first.x, y: first.y };
    d += ` C ${cp1.x} ${cp1.y}, ${cp2.x} ${cp2.y}, ${first.x} ${first.y} Z`;
  }
  return d;
}

/** Build a Path2D for canvas rendering from the same anchor list. */
export function buildPath2D(points: BezierPoint[] = [], closed = false): Path2D {
  const path = new Path2D();
  if (!points || points.length === 0) return path;
  path.moveTo(points[0].x, points[0].y);
  for (let i = 0; i < points.length - 1; i++) {
    const curr = points[i];
    const next = points[i + 1];
    const cp1 = curr.handleOut || { x: curr.x, y: curr.y };
    const cp2 = next.handleIn || { x: next.x, y: next.y };
    path.bezierCurveTo(cp1.x, cp1.y, cp2.x, cp2.y, next.x, next.y);
  }
  if (closed && points.length > 2) {
    const last = points[points.length - 1];
    const first = points[0];
    const cp1 = last.handleOut || { x: last.x, y: last.y };
    const cp2 = first.handleIn || { x: first.x, y: first.y };
    path.bezierCurveTo(cp1.x, cp1.y, cp2.x, cp2.y, first.x, first.y);
    path.closePath();
  }
  return path;
}
