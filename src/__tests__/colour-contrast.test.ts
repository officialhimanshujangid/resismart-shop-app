/**
 * COLOUR sweep (2026-10-06) — the shop app's key colour pairs stay readable
 * (Owner: "text colour wrong, buttons/icons faded"). The legacy `Colors` map is
 * what ~180 screens read, so it is held to the same bar as the DS kit.
 * WCAG: text ≥ 4.5:1; icons, field edges and large text ≥ 3:1.
 */
import { Colors, palette } from '../constants/colors';
import { AppLightTheme } from '../constants/theme';
import { dsLight, heroSky, statusFor } from '../theme/tokens';

const lum = (hex: string) => {
  const ch = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((x) => (x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4));
  return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
};
const ratio = (a: string, b: string) => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};
const skyAt = (stops: readonly string[], t: number) => {
  const [a, b, f] = t <= 0.56 ? [stops[0], stops[1], t / 0.56] : [stops[1], stops[2], (t - 0.56) / 0.44];
  const ca = [1, 3, 5].map((i) => parseInt(a.slice(i, i + 2), 16));
  const cb = [1, 3, 5].map((i) => parseInt(b.slice(i, i + 2), 16));
  return '#' + ca.map((c, i) => Math.round(c + (cb[i] - c) * f).toString(16).padStart(2, '0')).join('');
};
const WHITE = '#FFFFFF';

describe('shop colour contrast — legacy map (light)', () => {
  it('legacy primary reads as text on white and on the green soft fill, and carries white text', () => {
    expect(ratio(Colors.primary, WHITE)).toBeGreaterThanOrEqual(4.5);
    expect(ratio(Colors.primary, Colors.surfaceVariant)).toBeGreaterThanOrEqual(4.5);
    expect(ratio(Colors.textInverse, Colors.primary)).toBeGreaterThanOrEqual(4.5);
    expect(ratio(Colors.textInverse, Colors.primaryFill)).toBeGreaterThanOrEqual(4.5);
  });
  it('text tones and status read on white', () => {
    for (const fg of [Colors.textPrimary, Colors.textSecondary, Colors.success, Colors.error, Colors.warning, Colors.info, Colors.primaryDark]) {
      expect([fg, ratio(fg, WHITE) >= 4.5]).toEqual([fg, true]);
    }
    // secondary text also sits on stat cells and the green soft fill
    expect(ratio(Colors.textSecondary, dsLight.surfaceAlt)).toBeGreaterThanOrEqual(4.5);
    expect(ratio(Colors.textSecondary, Colors.surfaceVariant)).toBeGreaterThanOrEqual(4.5);
    // disabled / placeholder grey: not body text, but never below 3:1
    expect(ratio(Colors.textDisabled, WHITE)).toBeGreaterThanOrEqual(3);
  });
  it('the coral accent fill carries white counts at AA', () => {
    expect(ratio(Colors.textInverse, Colors.secondary)).toBeGreaterThanOrEqual(4.5);
  });
  it('status pairs: text on its tint ≥ 4.5', () => {
    for (const [k, s] of Object.entries(statusFor(false))) {
      expect([k, ratio(s.fg, s.bg) >= 4.5]).toEqual([k, true]);
    }
  });
  it('Paper fields and outlined buttons draw a ≥ 3:1 edge on the white ground', () => {
    expect(AppLightTheme.colors.outline).toBe(palette.fieldLine.light);
    expect(ratio(AppLightTheme.colors.outline, WHITE)).toBeGreaterThanOrEqual(3);
    expect(ratio(AppLightTheme.colors.onPrimary, AppLightTheme.colors.primary)).toBeGreaterThanOrEqual(4.5);
  });
  it('the DS accent stays the approved green for rings and charts', () => {
    expect(dsLight.primary).toBe('#2E9C68');
  });
  it('white on the hero sky ≥ 4.5 where the greeting sits (top 20 %), ≥ 4 to 30 %', () => {
    for (const t of [0, 0.1, 0.2]) expect(ratio(WHITE, skyAt(heroSky.light, t))).toBeGreaterThanOrEqual(4.5);
    expect(ratio(WHITE, skyAt(heroSky.light, 0.3))).toBeGreaterThanOrEqual(4);
  });
});
