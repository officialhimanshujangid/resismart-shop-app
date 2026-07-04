import axios from 'axios';
import { API_BASE_URL, STORAGE_KEYS } from '../constants/app';
import { storage } from '../utils/storage';

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  },
});

apiClient.interceptors.request.use(
  async (config) => {
    const token = await storage.get(STORAGE_KEYS.ACCESS_TOKEN);
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;
    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;
      try {
        const refreshToken = await storage.get(STORAGE_KEYS.REFRESH_TOKEN);
        const profile = await storage.getObject<{ tenantId: string; role: string }>(STORAGE_KEYS.USER_PROFILE);
        if (!refreshToken) throw new Error('No refresh token');

        const response = await axios.post(`${API_BASE_URL}/auth/refresh-token`, {
          refreshToken,
          tenantId: profile?.tenantId,
          role: profile?.role,
        });

        const { token, refreshToken: newRefresh } = response.data;
        await storage.set(STORAGE_KEYS.ACCESS_TOKEN, token);
        await storage.set(STORAGE_KEYS.REFRESH_TOKEN, newRefresh);

        originalRequest.headers.Authorization = `Bearer ${token}`;
        return apiClient(originalRequest);
      } catch {
        await storage.delete(STORAGE_KEYS.ACCESS_TOKEN);
        await storage.delete(STORAGE_KEYS.REFRESH_TOKEN);
        await storage.delete(STORAGE_KEYS.USER_PROFILE);
        await storage.delete(STORAGE_KEYS.USER_INFO);
      }
    }
    return Promise.reject(error);
  }
);
