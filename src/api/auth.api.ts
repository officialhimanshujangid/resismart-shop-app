import { apiClient } from './axios';

export interface LoginRequest {
  email: string;
  password: string;
}

export interface ProfileInfo {
  tenantType: 'SOCIETY' | 'SHOP' | 'SYSTEM' | string;
  tenantId: string;
  role: string;
}

export interface UserInfo {
  name: string;
  email: string;
}

export interface LoginResponse {
  message: string;
  autoSelected: boolean;
  token?: string;
  refreshToken?: string;
  profile?: ProfileInfo;
  user?: UserInfo;
  requiresContextSelection?: boolean;
  profiles?: ProfileInfo[];
  userId?: string;
}

export interface SelectContextRequest {
  userId: string;
  tenantId: string;
  role: string;
}

export interface SelectContextResponse {
  message: string;
  token: string;
  refreshToken: string;
  profile: ProfileInfo;
}

export interface ForgotPasswordRequest {
  email: string;
}

export interface ForgotPasswordResponse {
  message: string;
}

export const authApi = {
  login: (data: LoginRequest) =>
    apiClient.post<LoginResponse>('/auth/login', data),

  selectContext: (data: SelectContextRequest) =>
    apiClient.post<SelectContextResponse>('/auth/select-context', data),

  forgotPassword: (data: ForgotPasswordRequest) =>
    apiClient.post<ForgotPasswordResponse>('/auth/forgot-password', data),

  refreshToken: (refreshToken: string, tenantId?: string, role?: string) =>
    apiClient.post('/auth/refresh-token', { refreshToken, tenantId, role }),
};
