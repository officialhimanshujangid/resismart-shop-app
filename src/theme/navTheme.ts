import { DarkTheme, DefaultTheme, type Theme } from '@react-navigation/native';

import { themeColors } from '../constants/colors';

/**
 * DARK-D4 (2026-11-14) — react-navigation's theme for the root navigator.
 *
 * Expo Router gives every Stack / Tabs card DefaultTheme (#F2F2F2 ground) unless
 * a theme is provided. Nested stacks without their own `contentStyle`
 * (appointments, jobs, parties, the root and auth stacks…) and the fade between
 * screens showed that light grey on a dark phone. Light keeps DefaultTheme
 * exactly (no pixel change); dark uses the app's ground / surface / ink.
 */
export function navThemeFor(isDark: boolean): Theme {
  if (!isDark) return DefaultTheme;
  const c = themeColors(true);
  return {
    ...DarkTheme,
    colors: { ...DarkTheme.colors, primary: c.primary, background: c.background, card: c.surface, text: c.textPrimary, border: c.border },
  };
}
