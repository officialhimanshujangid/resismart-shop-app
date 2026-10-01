/**
 * Who may open Team → Owners and Archive: a session whose token role is
 * PARTNER_ADMIN (CONTRACT-partner-P0 §2.2). Staff never see these screens.
 */
export function isOwnerSession(profile: { role?: string; tenantType?: string } | null | undefined): boolean {
  return !!profile && profile.role === 'PARTNER_ADMIN';
}
