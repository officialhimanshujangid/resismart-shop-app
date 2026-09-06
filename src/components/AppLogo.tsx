import React from 'react';
import { View, Image, StyleSheet } from 'react-native';
import { Text } from 'react-native-paper';

/**
 * ONE brand mark: the ResiSmart wordmark, and nothing above it.
 *
 * ── Why the RS badge is gone ──────────────────────────────────────────────
 *
 * This used to stack `assets/appicon.jpg` (the RS badge) on top of
 * `assets/resismartlogo.png` (the wordmark), which read on the auth screens as
 * two competing marks rather than one lockup. Only one of them could stay, and
 * the badge is the one that cannot:
 *
 *   `appicon.jpg` is a 1024×1024 JPEG, so it has no alpha — and it is not a
 *   bare badge, it is a badge PHOTOGRAPHED ON A WHITE PAGE. Its four corners are
 *   `#FFFFFF` and about a quarter of its pixels are near-white ground, which
 *   `resizeMode="contain"` cannot remove. Dropped on the hero gradient it
 *   rendered as a white square block. Worse, the badge inside that block is
 *   ResiSmart BLUE (~`#0A50C0`) — mobile-society's brand colour, not this app's
 *   green — so it also fought the ramp it was sitting on.
 *   `scripts/generate-brand-assets.mjs` says the same thing in its header and
 *   has to flood-fill the white ground away before it can reuse the mark.
 *
 * A horizontal badge + wordmark lockup was the other candidate and is usually
 * the right answer, but it needs a badge with transparency, and it does not fit:
 * at `large` the row would be 72 + 12 + 200 = 284dp inside a hero with 20dp of
 * padding, which is 320dp of usable width on a 360dp phone. It would be
 * shrinking on the most common screen in India on day one.
 *
 * The wordmark alone is also the honest answer for what this screen has to do:
 * say the product's name. WHICH app it is is already carried by `Hero`'s
 * "· Partner" pill sitting right beneath this — that is the lockup, and `Hero`'s
 * own header is explicit that the app is distinguished by the lockup and never
 * by a new mark or hue.
 *
 * ── Why the wordmark is tinted ────────────────────────────────────────────
 *
 * `resismartlogo.png` has real alpha, but its ink is dark navy (`#11274C`) with
 * blue accents — artwork drawn for a white page. On the hero's deep green
 * gradient it was close to invisible. `tintColor` recolours every non-transparent
 * pixel while keeping the alpha, so `variant="light"` paints the same file pure
 * white for dark grounds and `variant="dark"` leaves the original artwork for
 * light ones. No second asset, no second source of truth.
 */

interface AppLogoProps {
  size?: 'small' | 'medium' | 'large';
  /**
   * The strap line under the mark. No caller passes it today — `Hero` renders
   * its own line — but it is part of this component's shape and stays supported.
   */
  showTagline?: boolean;
  /** `light` = light INK, for a dark ground. `dark` = the original navy artwork. */
  variant?: 'light' | 'dark';
}

/**
 * Widths only. The height follows from `LOGO_ASPECT`, so the mark can never be
 * letterboxed inside a box of the wrong shape, and `maxWidth: '100%'` lets it
 * shrink on a narrow screen instead of overflowing its hero.
 */
const sizeMap = {
  small: { logo: 130, tagline: 11 },
  medium: { logo: 168, tagline: 13 },
  large: { logo: 208, tagline: 15 },
};

/** `assets/resismartlogo.png` is 892 × 165. */
const LOGO_ASPECT = 892 / 165;

export function AppLogo({ size = 'medium', showTagline = true, variant = 'light' }: AppLogoProps) {
  const s = sizeMap[size];
  const onDark = variant === 'light';
  const subColor = onDark ? 'rgba(255,255,255,0.85)' : '#475569';

  return (
    <View style={styles.container}>
      <Image
        source={require('../../assets/resismartlogo.png')}
        style={[styles.logo, { width: s.logo }, onDark ? styles.onDark : null]}
        resizeMode="contain"
        accessible
        accessibilityRole="image"
        accessibilityLabel="ResiSmart"
      />

      {showTagline && (
        <Text
          style={[styles.tagline, { fontSize: s.tagline, color: subColor }]}
          maxFontSizeMultiplier={1.4}
        >
          RS Partner
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    gap: 10,
    width: '100%',
  },
  logo: {
    maxWidth: '100%',
    aspectRatio: LOGO_ASPECT,
  },
  /** See the header: the artwork is navy, so a dark ground needs it repainted. */
  onDark: { tintColor: '#FFFFFF' },
  tagline: {
    fontWeight: '400',
    letterSpacing: 0.3,
    opacity: 0.9,
    textAlign: 'center',
  },
});
