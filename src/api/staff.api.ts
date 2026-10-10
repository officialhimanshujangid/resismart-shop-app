import { apiClient, ApiEnvelope, unwrap } from './axios';
import type { PartnerRoleLimits } from '../features/p1/access';
import { PartnerAccessModule } from '../types/api-contract.generated';

/**
 * `/partners/me/staff` and `/partners/me/roles` — who works here, and what
 * they may do. Two collections, one screen pair (`staff/index.tsx` lists
 * people, `staff/roles.tsx` edits the grants they are given), matching the
 * backend's own split between `PartnerStaff` (the payroll) and
 * `PartnerAccessRole` (gate 3's editor).
 */

export type PartnerPermissionLevel = 'NONE' | 'READ' | 'FULL';

export interface PartnerStaffRow {
  _id: string;
  partnerId: string;
  userId: { _id: string; name: string; email?: string; phone?: string } | string;
  designation: string;
  roleId?: { _id: string; name: string; isActive: boolean } | string;
  canTakeBookings: boolean;
  skills: string[];
  isActive: boolean;
  /** P10S — the business erased their contact details after they left (never undone). */
  personalDataErasedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface InviteStaffPayload {
  name: string;
  email?: string;
  phone?: string;
  designation: string;
  roleId?: string;
  canTakeBookings?: boolean;
  skills?: string[];
}

export interface UpdateStaffPayload {
  designation?: string;
  /** `null` clears the role — a different instruction from omitting the field. */
  roleId?: string | null;
  canTakeBookings?: boolean;
  skills?: string[];
}

export interface InviteStaffResponse {
  data: PartnerStaffRow;
  /** Only set for a brand-new EMAIL identity — a phone identity signs in by OTP. */
  generatedPassword?: string;
}

/** One grant, module + the level it is held at. `NONE` is stored explicitly — see the model. */
export interface PartnerModuleGrant {
  module: PartnerAccessModule;
  level: PermissionLevel;
}

export type PermissionLevel = 'NONE' | 'READ' | 'FULL';

export interface PartnerAccessRole {
  _id: string;
  partnerId: string;
  name: string;
  description?: string;
  permissions: PartnerModuleGrant[];
  isSystem: boolean;
  isActive: boolean;
  /**
   * May THE VIEWER hand this role out (the ceiling)? `false` means it grants
   * more than they hold — grey it out rather than meet a 403 on save. Always
   * `true` for the owner.
   */
  assignable?: boolean;
  /** P1 role limits (§1.7) — absent key = unlimited. Set only by the owner. */
  limits?: PartnerRoleLimits;
  /** P9A (Owner Q6): which bookings / jobs the role sees. Absent = ALL. Set only by the owner. */
  jobScope?: 'ALL' | 'ASSIGNED';
  createdAt: string;
  updatedAt: string;
}

/** What the role editor is allowed to grant for THIS partner — gate 1 ∩ gate 2, already narrowed server-side. */
export interface PartnerRoleCatalogEntry {
  key: PartnerAccessModule;
  label: string;
  description: string;
  /** M02 audit: the same row in Hindi (absent from an older server). */
  labelHi?: string;
  descriptionHi?: string;
  levels: readonly PermissionLevel[];
}

export interface RolesAndCatalog {
  roles: PartnerAccessRole[];
  catalog: PartnerRoleCatalogEntry[];
}

export interface CreateRolePayload {
  name: string;
  description?: string;
  permissions?: PartnerModuleGrant[];
  /** Owner only (403 PARTNER_ROLE_LIMITS_OWNER_ONLY otherwise). */
  limits?: PartnerRoleLimits;
  /** P9A Q6 — owner only (403 PARTNER_ROLE_JOB_SCOPE_OWNER_ONLY otherwise). */
  jobScope?: 'ALL' | 'ASSIGNED';
}

/** On update `limits` REPLACES; `null` clears them. */
export type UpdateRolePayload = Partial<Omit<CreateRolePayload, 'limits'>> & { isActive?: boolean; limits?: PartnerRoleLimits | null };

export const staffApi = {
  list: () => apiClient.get<ApiEnvelope<PartnerStaffRow[]>>('/partners/me/staff').then((r) => unwrap(r.data)),

  invite: (payload: InviteStaffPayload) =>
    apiClient.post<InviteStaffResponse>('/partners/me/staff', payload).then((r) => r.data),

  update: (id: string, payload: UpdateStaffPayload) =>
    apiClient
      .put<ApiEnvelope<PartnerStaffRow>>(`/partners/me/staff/${id}`, payload)
      .then((r) => unwrap(r.data)),

  /** Deactivates. Their name stays on old bookings and invoices — never a hard delete. */
  remove: (id: string) =>
    apiClient.delete<ApiEnvelope<unknown>>(`/partners/me/staff/${id}`).then((r) => r.data),

  /** Counts against `max_partner_staff` exactly as a new invite does. */
  reactivate: (id: string) =>
    apiClient
      .post<ApiEnvelope<PartnerStaffRow>>(`/partners/me/staff/${id}/reactivate`, {})
      .then((r) => unwrap(r.data)),

  /**
   * P10S — after they have left: erase their phone and email (and their login,
   * when they use ResiSmart for nothing else). Staff cannot delete their own
   * account; this is the business's side of that rule. Never undone.
   */
  erasePersonalData: (id: string) =>
    apiClient.post<ApiEnvelope<unknown>>(`/partners/me/staff/${id}/erase-personal-data`, {}).then((r) => r.data),
};

export const rolesApi = {
  list: () => apiClient.get<ApiEnvelope<RolesAndCatalog>>('/partners/me/roles').then((r) => unwrap(r.data)),

  create: (payload: CreateRolePayload) =>
    apiClient
      .post<ApiEnvelope<PartnerAccessRole>>('/partners/me/roles', payload)
      .then((r) => unwrap(r.data)),

  update: (id: string, payload: UpdateRolePayload) =>
    apiClient
      .put<ApiEnvelope<PartnerAccessRole>>(`/partners/me/roles/${id}`, payload)
      .then((r) => unwrap(r.data)),

  remove: (id: string) => apiClient.delete<ApiEnvelope<unknown>>(`/partners/me/roles/${id}`).then((r) => r.data),
};
