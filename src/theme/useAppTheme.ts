import { useMemo } from 'react';
import { useColorScheme } from 'react-native';

import { themeColors, type ColorScheme } from '../constants/colors';
import {
  dsDark,
  dsLight,
  heroSky,
  shadowFor,
  statusFor,
  tintsFor,
  type DsColors,
} from './tokens';

/**
 * The one theme hook for new code.
 *
 * Light/dark FOLLOWS THE PHONE (`useColorScheme`, which on web reads
 * `prefers-color-scheme`). The shop app has never had an in-app theme
 * preference — `app.json` is `userInterfaceStyle: "automatic"` — so there is
 * nothing else to honour. If a preference is added later, this is the single
 * place to read it.
 *
 *   c       — the legacy semantic map (`primary`, `surface`, `textSecondary`…),
 *             the same object `themeColors(isDark)` returns, so old helpers that
 *             take `c` keep working.
 *   ds      — DS v1 names (`ground`, `ink`, `muted`, `primarySoft`, `glass`…).
 *   tints   — service-tile gradients.
 *   status  — fg/bg pairs for badges.
 *   shadow  — `shadow('card')` → `{ boxShadow }`.
 *   sky     — the hero gradient stops.
 */
export interface AppTheme {
  isDark: boolean;
  c: ColorScheme;
  ds: DsColors;
  tints: ReturnType<typeof tintsFor>;
  status: ReturnType<typeof statusFor>;
  shadow: ReturnType<typeof shadowFor>;
  sky: readonly [string, string, string];
}

export function buildAppTheme(isDark: boolean): AppTheme {
  return {
    isDark,
    c: themeColors(isDark),
    ds: isDark ? dsDark : dsLight,
    tints: tintsFor(isDark),
    status: statusFor(isDark),
    shadow: shadowFor(isDark),
    sky: isDark ? heroSky.dark : heroSky.light,
  };
}

const LIGHT = buildAppTheme(false);
const DARK = buildAppTheme(true);

export function useAppTheme(): AppTheme {
  const isDark = useColorScheme() === 'dark';
  return useMemo(() => (isDark ? DARK : LIGHT), [isDark]);
}
