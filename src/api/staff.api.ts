import { apiClient, ApiEnvelope, unwrap } from './axios';
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
  createdAt: string;
  updatedAt: string;
}

/** What the role editor is allowed to grant for THIS partner — gate 1 ∩ gate 2, already narrowed server-side. */
export interface PartnerRoleCatalogEntry {
  key: PartnerAccessModule;
  label: string;
  description: string;
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
}

export type UpdateRolePayload = Partial<CreateRolePayload> & { isActive?: boolean };

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
