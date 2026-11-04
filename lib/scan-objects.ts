// From the Reskale app: first written 2026-10-20, last changed 2026-10-20 (before this repo). See HACKATHON.md.
/**
 * The items Cloud Vision found in a scan photo, with where each one sits.
 *
 * /api/vision already asks for OBJECT_LOCALIZATION on every full scan; these
 * boxes are what lets the seller tap "that one" on the photo instead of drawing
 * a box by hand (ENG-176). Shared by the route (which builds them) and the app
 * (which draws them), so both agree on the shape.
 */

/** A box on the photo in 0–1 fractions of its width and height, top-left origin. */
export interface FocusBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface DetectedObject {
  name: string;
  score: number;
  box: FocusBox;
}

/** Enough dots to cover a cluttered shelf without burying the photo in them. */
export const MAX_DETECTED_OBJECTS = 6;

/**
 * Anything thinner than this is a sliver Vision drew along an edge — too small
 * to tap, and too little of the item to identify from a crop.
 */
const MIN_SIDE = 0.04;

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

/**
 * Vision's `localizedObjectAnnotations` → boxes the app can draw.
 *
 * Vision OMITS a vertex coordinate when it is 0 (a box touching the left or top
 * edge arrives as `{ y: 0.4 }`), so a missing x or y means 0, not "unknown".
 * Coordinates can also land a hair outside 0–1; they are clamped. Untrusted
 * upstream JSON, so every field is checked rather than assumed.
 */
export function toDetectedObjects(annotations: unknown): DetectedObject[] {
  if (!Array.isArray(annotations)) return [];

  const objects: DetectedObject[] = [];
  for (const a of annotations) {
    const name = typeof a?.name === 'string' ? a.name.trim() : '';
    const score = typeof a?.score === 'number' && Number.isFinite(a.score) ? a.score : 0;
    const vertices: unknown = a?.boundingPoly?.normalizedVertices;
    if (!name || !Array.isArray(vertices) || vertices.length === 0) continue;

    const xs = vertices.map((v) => clamp01(Number.isFinite(v?.x) ? v.x : 0));
    const ys = vertices.map((v) => clamp01(Number.isFinite(v?.y) ? v.y : 0));
    const x = Math.min(...xs);
    const y = Math.min(...ys);
    const w = Math.max(...xs) - x;
    const h = Math.max(...ys) - y;
    if (w < MIN_SIDE || h < MIN_SIDE) continue;

    objects.push({ name, score, box: { x, y, w, h } });
  }

  return objects.sort((a, b) => b.score - a.score).slice(0, MAX_DETECTED_OBJECTS);
}
