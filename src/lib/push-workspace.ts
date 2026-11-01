// >>> FX1 (Owner 2026-10-25) — a tapped push opens ITS workspace.
/**
 * The server now pushes a person's notifications for EVERY workspace this app
 * lists (not only the one opened last), and puts that workspace in the push
 * `data` (`tenantId` + `tenantType`, and `societyId` for a society). Before the
 * screen opens, the app must be IN that workspace — otherwise "your bill" of
 * flat B opens on flat A's data.
 *
 * Pure: which context to switch to, or null when the active one already is it
 * (or the push names no workspace, or this app does not list it). Same role as
 * the active context first (a resident stays a resident), else the first match.
 */
export interface WorkspaceCtx { contextId: string; tenantId: string; tenantType: string; role?: string }

export function workspaceForPush(
  raw: object | null | undefined, // the push `data` (any shape; read below)
  active: { tenantId: string; tenantType: string; role?: string } | null | undefined,
  contexts: readonly WorkspaceCtx[],
): string | null {
  if (!raw) return null;
  const data = raw as { tenantId?: unknown; tenantType?: unknown; societyId?: unknown };
  const tenantId = typeof data.tenantId === 'string' && data.tenantId
    ? data.tenantId : (typeof data.societyId === 'string' ? data.societyId : '');
  if (!tenantId) return null;
  const tenantType = typeof data.tenantType === 'string' && data.tenantType ? data.tenantType : null;
  const fits = (c: { tenantId: string; tenantType: string }) => c.tenantId === tenantId && (!tenantType || c.tenantType === tenantType);
  if (active && fits(active)) return null;
  const matches = contexts.filter(fits);
  if (!matches.length) return null;
  return (matches.find((c) => active?.role && c.role === active.role) ?? matches[0]).contextId;
}
// <<< FX1
