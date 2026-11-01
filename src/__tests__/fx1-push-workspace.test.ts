// >>> FX1 (2026-10-25)
/** FX1.1 — the shop app: a tapped push of ANOTHER shop switches there first. */
import { workspaceForPush } from '../lib/push-workspace';

const S1 = '65f0000000000000000000aa';
const S2 = '65f0000000000000000000bb';
const shop = (contextId: string, tenantId: string, role = 'PARTNER_ADMIN') => ({ contextId, tenantId, tenantType: 'PARTNER', role });

describe('FX1.1 — shop workspaceForPush', () => {
  const list = [shop('partner:1', S1), shop('partner:2', S2, 'PARTNER_STAFF')];
  it('a push of shop 2 while in shop 1 → shop 2', () => {
    expect(workspaceForPush({ tenantId: S2, tenantType: 'PARTNER' }, { tenantId: S1, tenantType: 'PARTNER', role: 'PARTNER_ADMIN' }, list)).toBe('partner:2');
  });
  it('a society push (not a shop this app lists) or the same shop → stay', () => {
    expect(workspaceForPush({ tenantId: S2, tenantType: 'SOCIETY', societyId: S2 }, { tenantId: S1, tenantType: 'PARTNER' }, list)).toBeNull();
    expect(workspaceForPush({ tenantId: S1, tenantType: 'PARTNER' }, { tenantId: S1, tenantType: 'PARTNER' }, list)).toBeNull();
  });
});
// <<< FX1
