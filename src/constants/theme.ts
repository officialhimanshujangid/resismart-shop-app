import { MD3LightTheme, MD3DarkTheme, configureFonts, MD3Theme } from 'react-native-paper';
import { Colors, DarkColors, ColorScheme, palette } from './colors';
import { fontFamily } from '../theme/tokens';

const fontConfig = {
  displayLarge: { fontFamily: 'System', fontSize: 57, fontWeight: '400' as const },
  displayMedium: { fontFamily: 'System', fontSize: 45, fontWeight: '400' as const },
  displaySmall: { fontFamily: 'System', fontSize: 36, fontWeight: '400' as const },
  headlineLarge: { fontFamily: 'System', fontSize: 32, fontWeight: '700' as const },
  headlineMedium: { fontFamily: 'System', fontSize: 28, fontWeight: '700' as const },
  // DS v1 §2: screen titles in Sora 600 (18–24). Weight stays '400' so Android
  // does not synthesise bold on top of the already-semibold face.
  headlineSmall: { fontFamily: fontFamily.sora600, fontSize: 24, fontWeight: '400' as const },
  titleLarge: { fontFamily: fontFamily.sora600, fontSize: 20, fontWeight: '400' as const },
  titleMedium: { fontFamily: 'System', fontSize: 16, fontWeight: '600' as const },
  titleSmall: { fontFamily: 'System', fontSize: 14, fontWeight: '500' as const },
  bodyLarge: { fontFamily: 'System', fontSize: 16, fontWeight: '400' as const },
  bodyMedium: { fontFamily: 'System', fontSize: 14, fontWeight: '400' as const },
  bodySmall: { fontFamily: 'System', fontSize: 12, fontWeight: '400' as const },
  labelLarge: { fontFamily: 'System', fontSize: 14, fontWeight: '500' as const },
  labelMedium: { fontFamily: 'System', fontSize: 12, fontWeight: '500' as const },
  labelSmall: { fontFamily: 'System', fontSize: 11, fontWeight: '500' as const },
};

const fonts = configureFonts({ config: fontConfig });

/**
 * One builder for both schemes, fed the matching colour map.
 *
 * Two hand-written theme objects is how the light one gains a token the dark one
 * never gets — the bug shows up as one unreadable label on one screen, months
 * later, only on a device set to dark. Deriving both from the same function
 * makes that impossible: a key added to `ColorScheme` has to exist in both maps
 * before this file compiles.
 */
const buildTheme = (base: MD3Theme, c: ColorScheme, fieldLine: string): MD3Theme => ({
  ...base,
  fonts,
  colors: {
    ...base.colors,
    // Paper paints contained buttons, FABs and selected chips with `primary`
    // and puts `onPrimary` on it, so it gets the AA-safe fill (D0 final).
    primary: c.primaryFill,
    onPrimary: c.textInverse,
    primaryContainer: c.primarySoft,
    onPrimaryContainer: c.primaryDark,
    secondary: c.secondary,
    onSecondary: c.textInverse,
    secondaryContainer: c.secondaryLight,
    onSecondaryContainer: c.secondaryDark,
    background: c.background,
    onBackground: c.textPrimary,
    surface: c.surface,
    onSurface: c.textPrimary,
    surfaceVariant: c.surfaceVariant,
    onSurfaceVariant: c.textSecondary,
    error: c.error,
    // COLOUR sweep (2026-10-06): Paper draws outlined TextInputs, outlined
    // buttons and chips with `outline`. `border` (#DCEBE2) is 1.23:1 on the
    // white ground, so fields and outlined buttons vanished; the field line
    // (#7A9488, 3.27:1 — what the kit's AppInput already uses) is the
    // WCAG 3:1 edge.
    outline: fieldLine,
    outlineVariant: c.divider,
    // Paper draws Snackbars and menus on `elevation.level2`; leaving it at the
    // MD3 default put a near-white sheet on the dark background.
    // DS v1: level2 is a NEUTRAL raised surface — the green `surfaceVariant`
    // would tint every menu and snackbar.
    elevation: { ...base.colors.elevation, level1: c.surface, level2: c.surfaceElevated },
  },
});

export const AppLightTheme = buildTheme(MD3LightTheme, Colors, palette.fieldLine.light);
export const AppDarkTheme = buildTheme(MD3DarkTheme, DarkColors, palette.fieldLine.dark);
