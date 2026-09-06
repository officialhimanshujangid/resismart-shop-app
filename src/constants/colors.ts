/**
 * The partner app's palette.
 *
 * The brand ramp is GREEN — this app is RS Partner and it is deliberately its
 * own colour, not mobile-society's `#0A5BD7` blue. The neutrals, the coral
 * accent and the dark-mode surfaces stay shared with mobile-society so the two
 * apps still read as siblings; only the brand hue diverges.
 *
 * This file is a TOKEN change only — the exported key names are exactly the ones
 * the existing screens already import, so nothing that renders had to be touched
 * to adopt it. Adding a key is safe; renaming one is not, because `login.tsx`,
 * `AppInput` and `AppButton` read these by name. That is why `brand.azure` keeps
 * a blue's name while holding a green: it is the ramp's bright accent step, and
 * the contract here is that values change and keys do not.
 *
 * ── How the green ramp was chosen ─────────────────────────────────────────
 *
 * `brand[800]` is `#0A4020` VERBATIM. That is already `app.json`'s
 * `android.adaptiveIcon.backgroundColor` and `splash.backgroundColor`, and it is
 * baked into the generated `assets/icon.png`, `splash-icon.png` and
 * `favicon.png` (see `scripts/generate-brand-assets.mjs`). Anchoring the ramp to
 * it rather than the other way round is what keeps the cold-start splash and the
 * login hero the same colour — and it fixes the ramp's hue at ~148°, which every
 * other decision below has to live with.
 *
 * Contrast, measured, not eyeballed:
 *   white on `500` (#0E7C43)          5.27:1   AA  — every contained button
 *   ink   on `400` (#2FA96C)          5.96:1   AA  — dark-mode button fill
 *   `400` on dark surface (#131C2E)   5.69:1   AA  — dark-mode link text
 *   `600` on `50`  (chip ink on bg)   6.57:1   AA  — StatusBadge, staff chips
 *   `700` on `50`  (onPrimaryContainer) 8.66:1 AA
 *   `500` on `50`  (active card ink)  4.84:1   AA  — the wizard's choice cards
 *
 * `400` on WHITE is only 2.99:1, so it is a dark-mode colour and a light-mode
 * FILL — never light-mode text. The auth screens used to colour their links with
 * it; they now use `primary`, which is AA on white.
 *
 * ── success vs primary, with a green brand ────────────────────────────────
 *
 * Once the brand is green, hue can no longer carry "this succeeded" on its own,
 * and pretending a few degrees of hue shift fixed that would be a lie. So:
 *
 *   1. `success` STAYS GREEN. It is the positive half of a red/green money pair
 *      on roughly fifteen screens (balance owed vs balance in credit, payment in
 *      vs payment out, in stock vs out of stock). Moving it to teal or blue
 *      would make "money received" read as "information".
 *   2. It is separated from the brand by CHROMA and VALUE instead. The brand's
 *      mid steps are deliberately muted pine (`400` sits at S 56%); `success` is
 *      full chroma at a cooler 163°. And it is now split per scheme the way
 *      `primary` always was — the old single `#10B981` was tuned for dark
 *      surfaces and failed AA on white at 2.54:1, which was a real legibility
 *      bug on every light-mode screen that prints a credit balance.
 *   3. Where the two would genuinely sit side by side as PEERS — the reports
 *      ageing chart's series list was `[success, primary, warning, error]` — the
 *      brand swatch is replaced by `info`, which is now a real blue rather than
 *      the old brand blue. That removes the collision structurally.
 *   4. In the signup wizard's step rail, "done" (success) sits next to "active"
 *      (primary), but the two are already told apart by glyph — a tick versus
 *      the step number — so hue is not the only signal there.
 *
 * `info` is worth its own note: it used to BE the brand blue, which made it
 * indistinguishable from `primary`. With a green brand it is free to be an
 * actual blue, which finally gives four status colours nobody can confuse —
 * green, blue, amber, rose.
 *
 * `Colors` stays a flat LIGHT-mode map because that is what the existing
 * StyleSheet.create calls captured at module load, and a StyleSheet built once
 * at import time cannot react to a theme change anyway. Anything that must
 * follow the system theme reads `themeColors(isDark)` at render instead — see
 * `constants/theme.ts`, which feeds react-native-paper both schemes.
 */

/** The raw ramps. One list, so a designer edits colour in exactly one place. */
export const palette = {
  brand: {
    50: '#ECF8F1',
    100: '#D2EFDF',
    200: '#A7DFC2',
    300: '#69C797',
    400: '#2FA96C',
    500: '#0E7C43',
    600: '#0B6537',
    700: '#08512C',
    /** `app.json`'s splash / adaptive-icon ground, verbatim. See the header. */
    800: '#0A4020',
    900: '#062B17',
    /**
     * The ramp's bright accent — the third stop of the hero gradient, and the
     * only step that is meant to lift rather than sit. Named `azure` from the
     * blue ramp this replaced; the name is kept because renaming a palette key
     * is the one change this file forbids.
     */
    azure: '#0E9A63',
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
  /**
   * The RESTING outline of a text field, per scheme.
   *
   * Deliberately heavier than `border`, which is `brand[200]` — a 1.5:1 tint
   * that is right for a card hairline and far too faint for the boundary of
   * something you are meant to tap and type in. Both of these clear 3:1 against
   * their own surface, the AA target for a non-text UI boundary. Read by
   * `AppInput`; see its header for why Paper's default was not enough.
   */
  fieldLine: { light: '#8593AA', dark: '#64748B' },
  /** Light-scheme success: 4.95:1 on white, so it works as text AND as a fill. */
  success: '#00805C',
  /** Dark-scheme success: 8.90:1 on `dark.surface`. */
  successLight: '#2FD3A5',
  warn: '#F59E0B',
  danger: '#F43F5E',
  /** A real blue now, not the brand. 5.17:1 on white. */
  info: '#2563EB',
  infoLight: '#60A5FA',
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

  // Gradients — the auth hero. Deep → brand → accent, so the white wordmark at
  // the TOP of the ramp sits on the darkest stop and keeps its contrast; the
  // bright accent lands in the far corner where no text goes.
  gradientStart: palette.brand[900],
  gradientEnd: palette.brand[600],
  gradientAccent: palette.brand.azure,

  // Misc
  overlay: 'rgba(4, 30, 17, 0.65)',
  shadow: 'rgba(6, 43, 23, 0.12)',
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
  // The light-scheme `success`/`info` are tuned to be legible on WHITE, which
  // makes both of them too dark to read on `dark.surface`. The dark scheme takes
  // the lighter twin of each — same hue, same meaning, legible on its own ground.
  success: palette.successLight,
  error: palette.danger,
  warning: palette.warn,
  info: palette.infoLight,
  border: palette.dark.line,
  divider: palette.dark.line,
  // Near-black green rather than near-black navy, and the accent is `500` rather
  // than `600` so the ramp keeps the same lightness spread (4% → 15% → 27%) the
  // blue one had. A gradient whose three stops sit within seven points of each
  // other just looks like a flat fill that failed.
  gradientStart: '#04120A',
  gradientEnd: palette.brand[800],
  gradientAccent: palette.brand[500],
  overlay: 'rgba(2, 10, 6, 0.72)',
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
