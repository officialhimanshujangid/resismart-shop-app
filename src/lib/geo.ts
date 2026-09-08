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

/** A saved `Partner.location`, as the API sends it. GeoJSON, so `[lng, lat]`. */
export type StoredLocation = { type?: string; coordinates?: number[] } | null | undefined;

/**
 * "Does this partner actually have a pin?" — the SAME rule as the server's.
 *
 * Named and written to match `hasDiscoveryLocation` in
 * `backend/src/models/partner.model.ts` line for line, because it is the same
 * question and the backend header records what a second, slightly-different
 * copy already cost: four call sites tested this, three of them checked only
 * `coordinates.length !== 2`, and a save that wrote `[0, 0]` therefore turned
 * the "your map pin is missing" banner OFF while sorting the shop ~7,000 km
 * into the Gulf of Guinea. Length 2 is not the test. The pair being the origin
 * is.
 *
 * Both screens that read a partner back were open-coding this inline; they now
 * call it, so there is one place left in this app that can get it wrong.
 */
export const hasDiscoveryLocation = (location: StoredLocation): boolean => {
  const coords = location?.coordinates;
  if (!Array.isArray(coords) || coords.length !== 2) return false;
  const [lng, lat] = coords;
  if (typeof lng !== 'number' || typeof lat !== 'number') return false;
  return !(lng === 0 && lat === 0);
};

/**
 * The saved pin as `{ lat, lng }`, or `null` when there is not one.
 *
 * Exists so no caller has to destructure `coordinates` itself: GeoJSON is
 * `[longitude, latitude]`, the reverse of the order every human says it in, and
 * reading it backwards puts an Indian shop in the Indian Ocean without failing
 * a single range check. One place does the swap.
 */
export function pointFromLocation(location: StoredLocation): { lat: number; lng: number } | null {
  const coords = location?.coordinates;
  if (!coords || !hasDiscoveryLocation(location)) return null;
  const [lng, lat] = coords;
  return { lat, lng };
}
