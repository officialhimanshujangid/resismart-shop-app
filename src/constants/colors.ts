/**
 * The partner app's palette, aligned to `mobile-society/src/theme/tokens.ts`.
 *
 * Same product, two apps: brand `#0A5BD7`, coral `#FF6B6B`, the same ink/muted
 * greys and the same dark-mode surfaces. This file is a TOKEN change only — the
 * exported key names are exactly the ones the existing screens already import,
 * so nothing that renders had to be touched to adopt it. Adding a key is safe;
 * renaming one is not, because `login.tsx`, `AppInput` and `AppButton` read
 * these by name and none of them are this agent's to edit.
 *
 * `Colors` stays a flat LIGHT-mode map because that is what the existing
 * StyleSheet.create calls captured at module load, and a StyleSheet built once
 * at import time cannot react to a theme change anyway. Anything that must
 * follow the system theme reads `themeColors(isDark)` at render instead — see
 * `constants/theme.ts`, which feeds react-native-paper both schemes.
 */

/** The raw ramps, copied from mobile-society so a designer edits one list. */
export const palette = {
  brand: {
    50: '#EFF6FF',
    100: '#DBEAFE',
    200: '#BFDBFE',
    300: '#7FB0F5',
    400: '#3D8BEF',
    500: '#0A5BD7',
    600: '#0949AC',
    700: '#073A85',
    800: '#06316E',
    900: '#0A2450',
    azure: '#208AEF',
  },
  coral: { soft: '#FFE9E9', 100: '#FFE0E0', 400: '#FF8A8A', 500: '#FF6B6B', 600: '#F04E4E' },
  ink: '#0F172A',
  soft: '#475569',
  muted: '#94A3B8',
  faint: '#CBD5E1',
  line: '#EEF1F6',
  bg: '#F5F7FB',
  surface: '#FFFFFF',
  dark: {
    bg: '#0B1220',
    surface: '#131C2E',
    elevated: '#1B2740',
    line: '#24314A',
    muted: '#64748B',
    ink: '#E7EDF7',
  },
  success: '#10B981',
  warn: '#F59E0B',
  danger: '#F43F5E',
  info: '#0A5BD7',
  white: '#FFFFFF',
} as const;

export const Colors = {
  // Brand
  primary: palette.brand[500],
  primaryLight: palette.brand[400],
  primaryDark: palette.brand[700],

  // Secondary — coral, the product's accent. It is the only warm colour in the
  // system, so it is reserved for one thing per screen (the primary action, or
  // the count that needs attention). Used twice on a screen it stops meaning
  // anything.
  secondary: palette.coral[500],
  secondaryLight: palette.coral[400],
  secondaryDark: palette.coral[600],

  // Backgrounds
  background: palette.bg,
  surface: palette.surface,
  surfaceVariant: palette.brand[50],

  // Text
  textPrimary: palette.ink,
  textSecondary: palette.soft,
  textDisabled: palette.muted,
  textInverse: palette.white,

  // Status
  success: palette.success,
  error: palette.danger,
  warning: palette.warn,
  info: palette.info,

  // Lines
  border: palette.brand[200],
  divider: palette.line,

  // Gradients — the login hero. Dark → brand → azure so the logo keeps contrast
  // at the top of the ramp.
  gradientStart: palette.brand[900],
  gradientEnd: palette.brand[600],
  gradientAccent: palette.brand.azure,

  // Misc
  overlay: 'rgba(10, 36, 80, 0.65)',
  shadow: 'rgba(10, 40, 90, 0.12)',
} as const;

/** The dark-scheme twin of the semantic subset. Same keys, different values. */
export const DarkColors = {
  primary: palette.brand[400],
  primaryLight: palette.brand[300],
  primaryDark: palette.brand[600],
  secondary: palette.coral[400],
  secondaryLight: palette.coral[100],
  secondaryDark: palette.coral[500],
  background: palette.dark.bg,
  surface: palette.dark.surface,
  surfaceVariant: palette.dark.elevated,
  textPrimary: palette.dark.ink,
  textSecondary: '#AEBAD0',
  textDisabled: palette.dark.muted,
  textInverse: palette.ink,
  success: palette.success,
  error: palette.danger,
  warning: palette.warn,
  info: palette.brand[400],
  border: palette.dark.line,
  divider: palette.dark.line,
  gradientStart: '#050A14',
  gradientEnd: palette.brand[800],
  gradientAccent: palette.brand[600],
  overlay: 'rgba(2, 6, 16, 0.72)',
  shadow: 'rgba(0, 0, 0, 0.5)',
} as const;

/**
 * Widened to `string` per key rather than `typeof Colors`.
 *
 * `Colors` and `DarkColors` are both `as const`, so their property types are the
 * literal hex strings they hold — which makes them structurally DIFFERENT types
 * and `DarkColors` unassignable to `typeof Colors`. Naming the shape once, with
 * string values, is what lets `themeColors` return either.
 */
export type ColorScheme = { readonly [K in keyof typeof Colors]: string };

/**
 * The palette for the scheme currently in force.
 *
 * Call this INSIDE a component (`useColorScheme()` feeds the argument) for
 * anything that has to follow the system theme. `Colors` is the light map and
 * is what module-level `StyleSheet.create` calls already froze — passing
 * `Colors` where a dark surface is wanted is the one mistake this pair invites,
 * so any screen that supports dark mode should take its colours from here and
 * from nowhere else.
 */
export const themeColors = (isDark: boolean): ColorScheme => (isDark ? DarkColors : Colors);

/** Radii and shadows, matching mobile-society so cards read the same in both apps. */
export const radii = {
  xs: 8,
  sm: 10,
  field: 14,
  md: 16,
  card: 18,
  lg: 20,
  sheet: 24,
  pill: 999,
} as const;
