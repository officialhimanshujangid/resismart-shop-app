/**
 * Design System v1 tokens for the SHOP app (green), light + dark.
 *
 * Source of truth: `resismart-backups/DESIGN-SYSTEM-v1.md` §1–§5 (shop columns)
 * and the `ShopHome` / `ShopBilling` / `DesignSystem` templates. Values are
 * copied from those files, not invented.
 *
 * `constants/colors.ts` maps the OLD semantic names (`primary`, `surface`,
 * `textSecondary`, …) onto these values, so the ~180 existing screens adopt the
 * new look without being edited. New code should read `useAppTheme()` (see
 * `./useAppTheme.ts`), which hands back both the old map (`c`) and these
 * tokens (`ds`, `tints`, `status`, `shadow`).
 *
 * Every colour that a screen might concatenate with an alpha suffix
 * (`${c.warning}1A` is a pattern in this codebase) is a 6-digit hex. Only the
 * tokens that are documented as "never concatenate" (overlays, glass, shadows)
 * are rgba strings.
 */
import { Platform } from 'react-native';

/* ───────────────────────── Colour ───────────────────────── */

export interface DsColors {
  /** Brand accent: icons, charts, rings, focus lines, large text. */
  primary: string;
  /**
   * FILLS that carry `onPrimary` text: primary buttons, the active tab pill,
   * solid badges. Darker than `primary` in light so white text clears AA
   * (white on `#1F7F55` = 4.97:1; on `#2E9C68` it is only 3.46:1).
   */
  primaryFill: string;
  /** Pressed / deeper text-on-soft. */
  primaryDeep: string;
  /** Secondary-soft buttons, selected chips, icon-tile ground. */
  primarySoft: string;
  /** Text / icon colour on `primary`. */
  onPrimary: string;
  /** Page background. */
  ground: string;
  /** Cards. */
  surface: string;
  /** A raised surface inside a card (stat cell, segmented track). */
  surfaceAlt: string;
  /** Body text. */
  ink: string;
  /** Secondary text. */
  muted: string;
  /** Tertiary text, placeholders. */
  faint: string;
  /**
   * UX-ICON (2026-10-10): inactive tab icons, chevrons, clear/close glyphs —
   * the stronger muted ink (light 4.69:1 on white, was `faint` 3.74:1).
   */
  iconMuted: string;
  /** Borders, dividers. */
  line: string;
  /** Segmented-control track. */
  track: string;
  /** Dark "ink" buttons (scan, add, cart bar) from ShopBilling. */
  inkButton: string;
  onInkButton: string;
  /** Scrim behind sheets/dialogs. */
  scrim: string;
  /** Floating tab bar + glass card fill. */
  glass: string;
  glassBorder: string;
  /** Skeleton block. */
  skeleton: string;
}

export const dsLight: DsColors = {
  primary: '#2E9C68',
  primaryFill: '#1F7F55',
  primaryDeep: '#237A50',
  primarySoft: '#E1F4E8',
  onPrimary: '#FFFFFF',
  ground: '#FFFFFF',
  surface: '#FFFFFF',
  surfaceAlt: '#F1F8F4',
  ink: '#16302A',
  // COLOUR sweep (2026-10-06): was #557A68 — 4.81 on white but 4.28–4.46:1 on
  // the stat cells / neutral badge / soft fills it also sits on. Same hue:
  // 5.36 white, 4.97 surfaceAlt, 4.78 neutral badge, 4.68 primarySoft.
  muted: '#4F7262',
  faint: '#74897E',
  iconMuted: '#5E7A6C',
  line: '#DCEBE2',
  track: '#E2EFE7',
  inkButton: '#1E4636',
  onInkButton: '#FFFFFF',
  scrim: 'rgba(6, 30, 18, 0.55)',
  glass: 'rgba(255,255,255,0.93)',
  glassBorder: '#FFFFFF',
  skeleton: '#E3EEE7',
};

export const dsDark: DsColors = {
  primary: '#3FB27B',
  // Dark keeps the bright fill: its `onPrimary` is deep-green ink (5.76:1).
  primaryFill: '#3FB27B',
  primaryDeep: '#2E9C68',
  primarySoft: '#173A31',
  // White on #3FB27B is 2.7:1, so the dark scheme puts deep-green ink on the
  // green fill instead (≈ 6:1). Same rule the previous palette followed.
  onPrimary: '#062B17',
  ground: '#060A16',
  surface: '#121A2E',
  surfaceAlt: '#1A2338',
  ink: '#EEF2FF',
  muted: '#A9B6DA',
  faint: '#7482A6',
  iconMuted: '#8592B8',
  line: '#232C42',
  track: '#1C2539',
  inkButton: '#3FB27B',
  onInkButton: '#062B17',
  scrim: 'rgba(0, 0, 0, 0.6)',
  glass: 'rgba(20,28,52,0.78)',
  glassBorder: 'rgba(255,255,255,0.10)',
  skeleton: '#1C2539',
};

/**
 * Hero sky (top band only). DS §1 `hero-sky`, shop column.
 * Dark = a GREEN night (Owner 2026-10-06), the same stops as the web partner
 * area (`globals.css` `.dark [data-brand="shop"]`). White on every stop >= 6.5:1.
 */
export const heroSky = {
  /**
   * COLOUR sweep (2026-10-06): the template top #2E9C68 → #62BF8F put the
   * white greeting at 2.9–3.2:1 and the chips at ~2.6:1. Top two stops
   * deepened (pale bottom unchanged): white 6.2 → 4.1:1 over the text band,
   * chips (with their dark wash) ≥ 4.5:1. Same stops as the web partner hero.
   */
  light: ['#1B6E49', '#3FAA77', '#CDEDD9'] as const,
  dark: ['#04140D', '#0D3A26', '#1B6A45'] as const,
};

/* ── Service tile tints (DS §1) — soft 145° gradient + deeper icon colour. ── */

export type TintName =
  | 'green' | 'blue' | 'teal' | 'amber' | 'violet' | 'sky' | 'rose' | 'coral' | 'sos';

export interface Tint {
  from: string;
  to: string;
  /** The glyph colour: the DEEP ink in light, the light tint in dark. */
  icon: string;
}

/**
 * UX-ICON (2026-10-10, Owner: "icons thode fade se hain"): the light glyph is
 * now each tint's deep 700 ink. The old mid tones sat at 2.7–4.2:1 on the
 * tile's darker stop (green 2.67, amber 2.93, coral 3.17); every ink below is
 * ≥ 4.3:1 there and ≥ 5.4:1 on the lighter stop.
 */
const TINTS_LIGHT: Record<TintName, Tint> = {
  green: { from: '#E9F7EF', to: '#C8EAD6', icon: '#1B6E47' },
  blue: { from: '#EDF2FF', to: '#D2DEFD', icon: '#2C46B0' },
  teal: { from: '#E7F8F4', to: '#C4EBE2', icon: '#11695C' },
  amber: { from: '#FFF5E6', to: '#FCDDB3', icon: '#97540B' },
  violet: { from: '#F2EFFF', to: '#DAD2FB', icon: '#5038B8' },
  sky: { from: '#E8F4FE', to: '#C8E3F9', icon: '#1A5E98' },
  rose: { from: '#FFF0F6', to: '#F8D0E1', icon: '#922F60' },
  coral: { from: '#FFF0EC', to: '#F9CFC5', icon: '#9C3F2B' },
  sos: { from: '#FFECEF', to: '#FAC6CF', icon: '#B02A40' },
};

/**
 * Dark: "same hues as 12–26% alpha gradients, icon in a lighter tint".
 * Pre-blended over the dark surface so they stay 6-digit hex. UX-ICON: both
 * stops nudged 5–7 % toward the glyph so tiles don't sink into the dark card;
 * they get a hairline (`tileDepth`) instead of a coloured shadow.
 */
const TINTS_DARK: Record<TintName, Tint> = {
  green: { from: '#1A3035', to: '#20483C', icon: '#6FD3A0' },
  blue: { from: '#1D2848', to: '#263567', icon: '#8EA6F5' },
  teal: { from: '#173038', to: '#1B4546', icon: '#5FD0BE' },
  amber: { from: '#2F2727', to: '#473623', icon: '#F2B567' },
  violet: { from: '#252446', to: '#342F63', icon: '#B3A4F7' },
  sky: { from: '#192C43', to: '#1E3E5D', icon: '#7FC0F0' },
  rose: { from: '#2E2137', to: '#472941', icon: '#F08DBB' },
  coral: { from: '#30222B', to: '#4A2D2D', icon: '#F29A86' },
  sos: { from: '#311F2C', to: '#4C2631', icon: '#F27A8C' },
};

const rgba = (hex: string, a: number) => {
  const h = hex.replace('#', '');
  return `rgba(${parseInt(h.slice(0, 2), 16)}, ${parseInt(h.slice(2, 4), 16)}, ${parseInt(h.slice(4, 6), 16)}, ${a})`;
};

/**
 * UX-ICON — the one depth recipe for every tinted icon tile.
 * LIGHT: a white top highlight + a soft shadow tinted with the tile's own ink
 * (`tile` y 4 / blur 22 / 0.16 for service tiles; `soft` y 3 / blur 16 / 0.12
 * for row tiles). DARK: no coloured shadow — a 1 px hairline in the tint.
 */
export function tileDepth(tint: Tint, isDark: boolean, size: 'tile' | 'soft' = 'tile') {
  if (isDark) {
    return { borderWidth: 1, borderColor: rgba(tint.icon, 0.22), boxShadow: 'inset 0px 1px 0px rgba(255, 255, 255, 0.06)' };
  }
  const [y, blur, a] = size === 'tile' ? [4, 22, 0.16] : [3, 16, 0.12];
  return { boxShadow: `inset 0px 1px 0px rgba(255, 255, 255, 0.9), 0px ${y}px ${blur}px ${rgba(tint.icon, a)}` };
}

/* ── Status pairs (DS §1): text on soft ground. ── */

export type StatusTone = 'success' | 'warn' | 'danger' | 'info' | 'neutral' | 'brand';

export interface StatusPair {
  fg: string;
  bg: string;
}

const STATUS_LIGHT: Record<StatusTone, StatusPair> = {
  // #217A48: 5.33:1 on white, 4.73:1 on its soft ground (was #2A8A50: 4.33 / 3.84).
  success: { fg: '#217A48', bg: '#E3F6EA' },
  // #A3591A: 5.25:1 on white, 4.73:1 on its soft ground (was #B9651A: 4.25 / 3.83).
  warn: { fg: '#A3591A', bg: '#FFF1E0' },
  danger: { fg: '#C0344A', bg: '#FFECEF' },
  info: { fg: '#3B5BDB', bg: '#E6ECFD' },
  neutral: { fg: '#4F7262', bg: '#EEF3F0' }, // COLOUR sweep: was #557A68, 4.28:1 on its tint
  brand: { fg: '#237A50', bg: '#E1F4E8' },
};

/** Dark: tints at ~16–20 % alpha, pre-blended over `surface`. */
const STATUS_DARK: Record<StatusTone, StatusPair> = {
  success: { fg: '#6FD3A0', bg: '#163A33' },
  warn: { fg: '#F2B567', bg: '#33301F' },
  danger: { fg: '#F27A8C', bg: '#3A2234' },
  info: { fg: '#8EA6F5', bg: '#1E2D5C' },
  neutral: { fg: '#A9B6DA', bg: '#1C2539' },
  brand: { fg: '#6FD3A0', bg: '#173A31' },
};

export const tintsFor = (isDark: boolean) => (isDark ? TINTS_DARK : TINTS_LIGHT);
export const statusFor = (isDark: boolean) => (isDark ? STATUS_DARK : STATUS_LIGHT);

/* ───────────────────────── Shape ───────────────────────── */

/** DS §3: cards 20–28, tiles 20, rows 18–20, buttons/chips fully round. */
export const radius = {
  xs: 8,
  sm: 12,
  md: 16,
  row: 18,
  tile: 20,
  card: 22,
  cardLg: 28,
  hero: 38,
  pill: 999,
} as const;

/** DS §3: screen padding 18–20; section gap 18–22; grid gaps 6–14. */
export const space = {
  xxs: 4,
  xs: 6,
  sm: 8,
  md: 12,
  lg: 14,
  screen: 18,
  section: 20,
  xl: 24,
} as const;

/** Touch target floor (DS §3, UI rule 9). */
export const MIN_TOUCH = 44;

/* ───────────────────────── Depth ───────────────────────── */

export type ShadowName = 'card' | 'raised' | 'glass' | 'tabBar' | 'button' | 'tile' | 'cart';

/**
 * Soft, green-tinted shadows (DS §3, shop column). Built on `boxShadow`, which
 * React Native 0.76+ draws natively on the New Architecture (SDK 54 default)
 * and react-native-web passes straight to CSS — one value, every platform.
 */
const SHADOWS_LIGHT: Record<ShadowName, string> = {
  card: '0px 6px 18px rgba(20, 90, 55, 0.08)',
  raised: '0px 8px 20px rgba(6, 80, 40, 0.07)',
  glass: '0px 16px 38px rgba(20, 90, 55, 0.14)',
  tabBar: '0px 10px 30px rgba(20, 90, 55, 0.16)',
  button: '0px 6px 14px rgba(46, 156, 104, 0.24)',
  tile: '0px 6px 14px rgba(46, 156, 104, 0.12)',
  cart: '0px 12px 28px rgba(20, 70, 50, 0.22)',
};

const SHADOWS_DARK: Record<ShadowName, string> = {
  card: '0px 6px 18px rgba(0, 0, 0, 0.35)',
  raised: '0px 8px 20px rgba(0, 0, 0, 0.35)',
  glass: '0px 16px 38px rgba(0, 0, 0, 0.45)',
  tabBar: '0px 10px 30px rgba(0, 0, 0, 0.5)',
  button: '0px 6px 14px rgba(63, 178, 123, 0.22)',
  tile: '0px 6px 14px rgba(0, 0, 0, 0.3)',
  cart: '0px 12px 28px rgba(0, 0, 0, 0.5)',
};

export const shadowFor = (isDark: boolean) => {
  const map = isDark ? SHADOWS_DARK : SHADOWS_LIGHT;
  return (name: ShadowName) => ({ boxShadow: map[name] });
};

/* ───────────────────────── Motion ───────────────────────── */

/** DS §5. Durations in ms; easing is the cubic-bezier from the templates. */
export const motion = {
  rise: { duration: 850, distance: 16, stagger: 100 },
  press: { duration: 200, scale: 0.97, tileScale: 0.93 },
  data: { duration: 1500 },
  countUp: { duration: 1200 },
  toast: { duration: 280, visibleMs: 3200 },
  ambient: { cloud: 9000, sign: 4000, sun: 5000, bob: 3000, ride: 9000 },
  /** cubic-bezier(.22,.8,.24,1) */
  bezier: [0.22, 0.8, 0.24, 1] as const,
} as const;

/* ───────────────────────── Type ───────────────────────── */

/**
 * Sora families as registered by `useFonts` in `app/_layout.tsx`.
 *
 * Sora styles set `fontFamily` ONLY — no `fontWeight`. A custom family plus a
 * weight makes Android synthesise bold on top of an already-bold face. If the
 * font fails to load the text falls back to the system face.
 */
export const fontFamily = {
  sora500: 'Sora_500Medium',
  sora600: 'Sora_600SemiBold',
  sora700: 'Sora_700Bold',
  /** Noto Sans Devanagari (OFL, bundled in `assets/fonts`): Sora has no Devanagari. */
  hindi: 'NotoSansDevanagari_400Regular',
  hindiBold: 'NotoSansDevanagari_700Bold',
} as const;

const webFallback = Platform.OS === 'web' ? ', system-ui, sans-serif' : '';

/** DS §2 type scale. Body text stays the system face (Plus Jakarta is not installed). */
export const typeScale = {
  /** Hero money, 30/700 Sora. */
  money: { fontFamily: fontFamily.sora700 + webFallback, fontSize: 30, letterSpacing: -0.8 },
  /** Card money / big number, 20/700 Sora. */
  amount: { fontFamily: fontFamily.sora700 + webFallback, fontSize: 20 },
  /** Small number in a stat cell, 13–16 Sora 600. */
  number: { fontFamily: fontFamily.sora600 + webFallback, fontSize: 15 },
  /** Screen title 20 Sora 700. */
  title: { fontFamily: fontFamily.sora700 + webFallback, fontSize: 20 },
  /** Hero greeting 19 Sora 600. */
  greeting: { fontFamily: fontFamily.sora600 + webFallback, fontSize: 19, letterSpacing: -0.2 },
  /** Section heading 16 Sora 600. */
  section: { fontFamily: fontFamily.sora600 + webFallback, fontSize: 16 },
  /** Row title 15/600. */
  row: { fontSize: 15, fontWeight: '600' as const },
  /** Button label 15/600; Hindi wraps (line-height 1.3). */
  button: { fontSize: 15, fontWeight: '600' as const, lineHeight: 20 },
  /** Details 12–13/500. */
  detail: { fontSize: 13, fontWeight: '500' as const, lineHeight: 18 },
  caption: { fontSize: 12, fontWeight: '600' as const, lineHeight: 16 },
  micro: { fontSize: 11, fontWeight: '700' as const, lineHeight: 14 },
} as const;
