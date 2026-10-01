/**
 * What the signed-in person may do on the Staff and Roles screens — pure, so
 * the screens only hide or disable. The SERVER decides (`partner-role-ceiling.ts`):
 *
 *  - the proprietor (`isAdmin`) has no ceiling;
 *  - anyone else holding `STAFF: FULL` cannot create, edit or delete a role
 *    that grants more than they hold, cannot give or take away a role above
 *    their own access (`assignable` on `GET /partners/me/roles` says which),
 *    and cannot change their OWN role (403 `PARTNER_OWN_ACCESS_REFUSED`).
 *
 * These helpers only keep the app from offering what the server would refuse.
 */

export type Level = 'NONE' | 'READ' | 'FULL';

const RANK: Record<Level, number> = { NONE: 0, READ: 1, FULL: 2 };

/** The levels this person may put on a role for one module. */
export function grantableLevels(
  levels: readonly Level[],
  isAdmin: boolean,
  own: Level,
): Level[] {
  if (isAdmin) return [...levels];
  return levels.filter((l) => RANK[l] <= RANK[own]);
}

/** Does a role's grant list stay within what this person holds? */
export function roleWithinReach(
  grants: readonly { module: string; level: Level }[],
  isAdmin: boolean,
  ownLevel: (module: string) => Level,
): boolean {
  if (isAdmin) return true;
  return grants.every((g) => RANK[g.level] <= RANK[ownLevel(g.module)]);
}

/** Last 10 digits — `+91 98765 43210` and `9876543210` are the same phone. */
const phoneKey = (p?: string): string => (p ?? '').replace(/\D/g, '').slice(-10);

/**
 * Is this staff row the signed-in person? Matched on phone or email, because
 * the session carries no user id. A hint for hiding buttons; the server is
 * what refuses.
 */
export function isOwnStaffRow(
  row: { userId: { phone?: string; email?: string } | string },
  me: { phone?: string; email?: string } | null | undefined,
): boolean {
  if (!me || typeof row.userId !== 'object') return false;
  const rowPhone = phoneKey(row.userId.phone);
  if (rowPhone.length === 10 && rowPhone === phoneKey(me.phone)) return true;
  const rowEmail = (row.userId.email ?? '').trim().toLowerCase();
  return !!rowEmail && rowEmail === (me.email ?? '').trim().toLowerCase();
}
