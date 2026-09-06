/**
 * The map pin, as two typed boxes — one rule, read by both screens that own it.
 *
 * The signup wizard's step 2 and Settings → Address & map pin ask for the same
 * pair of numbers and hand them to the same two endpoints, which enforce the
 * same three things: a latitude in [-90, 90], a longitude in [-180, 180], and
 * NOT (0, 0). Written out twice, this is exactly the drift this codebase has
 * already paid for elsewhere — one screen's Save button goes green against a
 * server that says no.
 *
 * The boxes hold TEXT and the point is derived from them, rather than the other
 * way round. Numeric state would have to decide what the half-typed "12." on the
 * way to "12.97" means on every keystroke, and every answer to that is wrong:
 * `Number('12.')` is 12, so the pin silently jumps a hundred kilometres while
 * somebody is still typing it.
 */

/** A latitude, or `null` for empty, non-numeric or out of range. */
export const parseLatitude = (raw: string): number | null => parseCoord(raw, 90);

/** A longitude, or `null` for empty, non-numeric or out of range. */
export const parseLongitude = (raw: string): number | null => parseCoord(raw, 180);

const parseCoord = (raw: string, limit: number): number | null => {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const n = Number(trimmed);
  return Number.isFinite(n) && Math.abs(n) <= limit ? n : null;
};

/**
 * Both boxes as one point, or `null` if the pair is not a place.
 *
 * (0, 0) is refused here rather than by each caller because it is the case that
 * looks fine and is not: a real point in the Gulf of Guinea, so it passes every
 * range check while meaning "the map never loaded". The server refuses it in
 * `onboardingStep2Schema` and reports it in `onboardingGaps`; refusing it in the
 * form means the Save button greys out beside the boxes instead of the save
 * coming back as a validation error.
 */
export function parseCoords(latText: string, lngText: string): { lat: number; lng: number } | null {
  const lat = parseLatitude(latText);
  const lng = parseLongitude(lngText);
  if (lat === null || lng === null) return null;
  if (lat === 0 && lng === 0) return null;
  return { lat, lng };
}
