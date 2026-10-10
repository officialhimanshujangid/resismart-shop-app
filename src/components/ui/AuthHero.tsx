import React, { useState } from 'react';
import { StyleSheet, Text, useWindowDimensions, View, type StyleProp, type ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { radius } from '../../theme/tokens';
import { useAppTheme } from '../../theme/useAppTheme';
import { Rise } from '../../theme/motion';
import { BrandWordmark } from './BrandWordmark';
import { Storefront } from '../illustrations/Storefront';

/**
 * The sign-in hero for the shop app (1R, ShopHome template): the green sky
 * band under the status bar, the ResiSmart wordmark with the "· Partner"
 * lockup and one line, and the storefront standing on the band's lower edge.
 * The storefront's ambience (cloud drift, OPEN sign sway) is hero-only and
 * stops under reduce-motion (DS §5).
 *
 * The form card that follows overlaps the bottom by `HERO_OVERLAP` so it
 * sits ON the sky (`GlassCard` with `marginTop: -HERO_OVERLAP`).
 *
 * `top` is a slot for a glass back button above the lockup.
 */
export const HERO_OVERLAP = 52;

export function AuthHero({
  subtitle,
  compact = false,
  top,
  testID,
  style,
}: {
  subtitle?: string;
  /** Shorter art for screens whose form is long (code, reset). */
  compact?: boolean;
  top?: React.ReactNode;
  testID?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const { sky } = useAppTheme();
  const insets = useSafeAreaInsets();
  const window = useWindowDimensions();
  const [width, setWidth] = useState(Math.round(window.width));
  const artH = compact ? 150 : 196;

  return (
    <View
      testID={testID}
      onLayout={(e) => setWidth(Math.round(e.nativeEvent.layout.width))}
      style={[styles.hero, { paddingTop: insets.top + 10 }, style]}
    >
      <LinearGradient colors={sky} locations={[0, 0.56, 1]} style={StyleSheet.absoluteFill} />
      {top ? <View style={styles.top}>{top}</View> : null}
      <Rise index={0} style={styles.brand}>
        {/* Owner 2026-10-06: the ResiSmart wordmark, ~32 px, white on the sky. */}
        <BrandWordmark onDark height={compact ? 30 : 34} />
        <View style={styles.lockup}>
          <View style={styles.lockupDot} />
          <Text style={styles.lockupText}>Partner</Text>
        </View>
        {subtitle ? (
          <View style={styles.linePill}>
            <Text style={styles.line}>{subtitle}</Text>
          </View>
        ) : null}
      </Rise>
      <View style={{ height: artH }} pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <Storefront width={width} height={artH} />
      </View>
    </View>
  );
}

// Contrast (1R dark-mode safety): the light sky lightens towards the bottom
// (#2E9C68 → #62BF8F), where white small text would fall to ~3:1. So every
// line of words sits on a DARK translucent pill (`ON_HERO_PILL`, the
// `HeroHeader` chip shade, deeper) — white on it stays ≥ 5:1 anywhere on the
// light sky, and far above that on the dark night sky. Hero-only inks.
const ON_HERO = '#FFFFFF';
const ON_HERO_PILL = 'rgba(6, 40, 24, 0.38)';

const styles = StyleSheet.create({
  hero: {
    borderBottomLeftRadius: radius.hero,
    borderBottomRightRadius: radius.hero,
    overflow: 'hidden',
  },
  top: { paddingHorizontal: 16, flexDirection: 'row' },
  brand: { alignItems: 'center', gap: 10, paddingHorizontal: 24, paddingTop: 6 },
  lockup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: radius.pill,
    backgroundColor: ON_HERO_PILL,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.4)',
  },
  lockupDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: ON_HERO },
  lockupText: { color: ON_HERO, fontSize: 13, fontWeight: '700', letterSpacing: 0.4 },
  linePill: { borderRadius: 14, paddingHorizontal: 12, paddingVertical: 5, backgroundColor: ON_HERO_PILL },
  line: { color: ON_HERO, fontSize: 13.5, lineHeight: 19, fontWeight: '600', textAlign: 'center' },
});
