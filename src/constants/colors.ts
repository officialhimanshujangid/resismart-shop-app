/**
 * The partner (shop) app's palette — Design System v1, GREEN (2026-10-06).
 *
 * The values now come from `src/theme/tokens.ts` (DS §1, shop columns: primary
 * `#2E9C68` / dark `#3FB27B`, ground `#F2F8F4` / `#060A16`, ink `#16302A`).
 *
 * The CONTRACT of this file is unchanged: the exported key names are the ones
 * ~180 screens already import, so values change and keys do not. That is how
 * every existing screen adopts the new look without being edited. Adding a key
 * is safe (it must be added to BOTH maps — `ColorScheme` enforces it);
 * renaming one is not. `brand.azure` keeps its old blue name for that reason.
 *
 * Two rules every value here obeys:
 *
 *   1. Every key in `Colors` / `DarkColors` except `overlay` and `shadow` is a
 *      6-digit hex. Screens build tints as `${c.warning}1A`; an rgba() value
 *      would silently produce an invalid colour. `colors-contract` in
 *      `__tests__/design-kit.test.tsx` checks this.
 *   2. `Colors` is the LIGHT map, kept flat because module-level
 *      `StyleSheet.create` calls captured it at import time. Anything that has
 *      to follow the phone's light/dark setting reads `themeColors(isDark)` (or
 *      `useAppTheme()`) at render.
 *
 * Contrast notes (measured):
 *   white on `#2E9C68` is 3.46:1 — below AA for button labels, so every FILL
 *     that carries white text uses `primaryFill` `#1F7F55` (4.97:1; Owner
 *     2026-10-06). `#2E9C68` stays for accents, icons and charts. Small TEXT in
 *     brand green uses `primaryDark` `#237A50` (5.3:1 on white).
 *   dark scheme: white on `#3FB27B` is 2.7:1, so `textInverse` there is deep
 *     green ink `#062B17` (5.76:1), and the dark `primaryFill` stays `#3FB27B`.
 *   `success` `#217A48` (5.33:1 on white, 4.73:1 on `#E3F6EA`; was `#2A8A50`
 *     at 4.33:1) and `primary` are both green (DS decision); they are
 *     told apart by context and by the soft status ground, not by hue alone.
 */
import { dsDark, dsLight } from '../theme/tokens';

/** The raw ramps. One list, so a designer edits colour in exactly one place. */
export const palette = {
  brand: {
    50: '#EEF8F2',
    100: '#E1F4E8',
    200: '#C6EBD3',
    300: '#8FD0A8',
    400: '#3FB27B',
    500: '#2E9C68',
    600: '#237A50',
    700: '#1E6B47',
    /** `app.json`'s splash / adaptive-icon ground, verbatim. Do not change. */
    800: '#0A4020',
    900: '#062B17',
    /** The hero sky's middle stop. Named `azure` from the old blue ramp; keys never change. */
    azure: '#62BF8F',
  },
  coral: { soft: '#FFF0EC', 100: '#F9CFC5', 400: '#F0907C', 500: '#E46F57', 600: '#C2553D' },
  ink: dsLight.ink,
  soft: dsLight.muted,
  muted: '#8AA396',
  faint: '#C9D9CF',
  line: '#E3EEE7',
  bg: dsLight.ground,
  surface: dsLight.surface,
  dark: {
    bg: dsDark.ground,
    surface: dsDark.surface,
    elevated: dsDark.surfaceAlt,
    line: dsDark.line,
    muted: '#7482A6',
    ink: dsDark.ink,
  },
  /**
   * The RESTING outline of a text field / outlined button, per scheme. Heavier
   * than `border` on purpose: both clear 3:1 against their own surface, the AA
   * target for a non-text UI boundary. Read by `AppInput` and `AppButton`.
   */
  fieldLine: { light: '#7A9488', dark: '#64748B' },
  /** DS success, light: text on `#E3F6EA` (4.73:1) and on white (5.33:1). */
  success: '#217A48',
  /** Dark-scheme success. */
  successLight: '#6FD3A0',
  /** DS warn, deepened (1R review): 5.25:1 on white, 4.73:1 on its soft fill (was #B9651A, 4.25). */
  warn: '#A3591A',
  danger: '#C0344A',
  info: '#3B5BDB',
  infoLight: '#8EA6F5',
  white: '#FFFFFF',
} as const;

export const Colors = {
  // Brand
  /**
   * COLOUR sweep (2026-10-06). The legacy `primary` is read by ~180 screens:
   * 154 times as a TEXT/ICON colour, 15 as a border, 5 as a FILL under white
   * text (counted from source). At the DS accent #2E9C68 that is 3.46:1 on
   * white and 3.0:1 on the green soft fill — the "faded" green links, labels
   * and buttons. It now carries the DS shop-deep `#237A50` (5.29:1 on white,
   * 4.61:1 on `#E1F4E8`, white text on it 5.29:1). The approved accent
   * #2E9C68 stays in `ds.primary` (theme/tokens.ts) for the kit's rings,
   * charts, focus lines and icons.
   */
  primary: dsLight.primaryDeep,
  primaryLight: palette.brand.azure,
  primaryDark: dsLight.primaryDeep,
  /** NEW (D0 final): fill behind white text — buttons, active tab pill, solid badges. */
  primaryFill: dsLight.primaryFill,
  /** NEW (DS `shop-soft`): secondary-soft buttons, selected chips. */
  primarySoft: dsLight.primarySoft,

  // Secondary — coral, the warm accent (template badge / awning colour).
  // Reserved for one thing per screen.
  // COLOUR sweep: a FILL under white counts (badges, Paper `onSecondary`):
  // white on coral-500 #E46F57 was 3.13:1, on coral-600 #C2553D 4.51:1.
  secondary: palette.coral[600],
  secondaryLight: palette.coral[400],
  secondaryDark: palette.coral[600],

  // Backgrounds
  background: dsLight.ground,
  surface: dsLight.surface,
  surfaceVariant: dsLight.primarySoft,
  /** NEW: menus, snackbars, raised cells — a neutral raised surface. */
  surfaceElevated: dsLight.surface,

  // Text
  textPrimary: dsLight.ink,
  textSecondary: dsLight.muted,
  textDisabled: dsLight.faint,
  textInverse: dsLight.onPrimary,

  // Status (DS §1)
  success: palette.success,
  error: palette.danger,
  warning: palette.warn,
  info: palette.info,

  // Lines
  border: dsLight.line,
  divider: palette.line,

  // Gradients — the legacy `Hero` (auth + old dashboard). Kept DEEP so the white
  // text it draws at every corner stays readable; the new pastel sky lives in
  // `theme/tokens.ts → heroSky` and is drawn by `HeroHeader`.
  gradientStart: '#124D33',
  gradientEnd: dsLight.primaryDeep,
  gradientAccent: dsLight.primary,

  // Misc
  overlay: dsLight.scrim,
  shadow: 'rgba(20, 90, 55, 0.14)',
} as const;

/** The dark-scheme twin. Same keys, different values. */
export const DarkColors = {
  primary: dsDark.primary,
  primaryLight: '#6FCB98',
  primaryDark: '#8FDDB3',
  primaryFill: dsDark.primaryFill,
  primarySoft: dsDark.primarySoft,
  secondary: palette.coral[400],
  secondaryLight: '#F7B9AA',
  secondaryDark: palette.coral[500],
  background: dsDark.ground,
  surface: dsDark.surface,
  surfaceVariant: dsDark.primarySoft,
  surfaceElevated: dsDark.surfaceAlt,
  textPrimary: dsDark.ink,
  textSecondary: dsDark.muted,
  textDisabled: dsDark.faint,
  textInverse: dsDark.onPrimary,
  success: palette.successLight,
  error: '#F27A8C',
  warning: '#F2B567',
  info: palette.infoLight,
  border: dsDark.line,
  divider: '#1C2539',
  // D0 final: green night (was navy), same stops as `heroSky.dark`.
  gradientStart: '#04140D',
  gradientEnd: '#0D3A26',
  gradientAccent: '#1B6A45',
  overlay: dsDark.scrim,
  shadow: 'rgba(0, 0, 0, 0.5)',
} as const;

/**
 * Widened to `string` per key rather than `typeof Colors`: both maps are
 * `as const`, so their literal types differ. Naming the shape once is what lets
 * `themeColors` return either — and makes a key missing from one map a compile
 * error.
 */
export type ColorScheme = { readonly [K in keyof typeof Colors]: string };

// Compile-time proof that DarkColors has every key Colors has.
const _darkHasEveryKey: ColorScheme = DarkColors;
void _darkHasEveryKey;

/**
 * The palette for the scheme currently in force. Call it INSIDE a component
 * (`useColorScheme()` feeds the argument), or use `useAppTheme()`.
 */
export const themeColors = (isDark: boolean): ColorScheme => (isDark ? DarkColors : Colors);

/**
 * Radii. Existing keys keep their names; values follow DS §3 (cards 20–28,
 * rows 18–20, fields 16, buttons/chips fully round). New code: `radius` in
 * `theme/tokens.ts`.
 */
export const radii = {
  xs: 8,
  sm: 12,
  field: 16,
  md: 16,
  card: 22,
  lg: 24,
  sheet: 28,
  pill: 999,
} as const;
