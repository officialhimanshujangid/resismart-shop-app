import React from 'react';
import { Platform, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { BlurView } from 'expo-blur';

import { radius } from '../../theme/tokens';
import { useAppTheme } from '../../theme/useAppTheme';
import { PressableScale } from '../../theme/motion';

export type CardTone = 'surface' | 'soft' | 'warm' | 'alt';

/**
 * DS v1 card: 22 corners, white surface, soft green-tinted shadow. Tones:
 * `soft` (brand soft), `warm` (the "Running low" peach card), `alt` (a cell
 * inside a card). Pass `onPress` to make it a pressable card (scale 0.97).
 */
export function Card({
  children,
  tone = 'surface',
  onPress,
  padding = 16,
  accessibilityLabel,
  testID,
  style,
}: {
  children: React.ReactNode;
  tone?: CardTone;
  onPress?: () => void;
  padding?: number;
  accessibilityLabel?: string;
  testID?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const { ds, shadow, isDark, status } = useAppTheme();
  const bg =
    tone === 'soft' ? ds.primarySoft
      : tone === 'warm' ? (isDark ? status.warn.bg : '#FFF4EF')
        : tone === 'alt' ? ds.surfaceAlt
          : ds.surface;
  // Owner 2026-10-06: the light page is pure white, so a surface card keeps a
  // hairline `line` edge (plus its soft shadow) — never ground-vs-surface contrast.
  const edge = tone === 'surface' ? { borderWidth: 1, borderColor: ds.line } : null;
  const body = [styles.card, { backgroundColor: bg, padding }, edge, tone === 'alt' ? null : shadow('card'), style];

  if (onPress) {
    return (
      <PressableScale onPress={onPress} accessibilityRole="button" accessibilityLabel={accessibilityLabel} testID={testID} style={body}>
        {children}
      </PressableScale>
    );
  }
  return (
    <View testID={testID} style={body}>
      {children}
    </View>
  );
}

/**
 * Glass card that sits over the hero (DS v1 §3): white 93 % + blur 20 + white
 * hairline; dark: `rgba(20,28,52,.78)` + 10 % white hairline.
 *
 * Blur is used on iOS and web only. Android's blur in expo-blur 15 is still an
 * experimental, costly method, so Android gets the same colours with no blur —
 * exactly the fallback the DS specifies.
 */
export function GlassCard({
  children,
  padding = 16,
  testID,
  style,
}: {
  children: React.ReactNode;
  padding?: number;
  testID?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const { ds, shadow, isDark } = useAppTheme();
  const blur = Platform.OS === 'ios' || Platform.OS === 'web';
  return (
    <View testID={testID} style={[styles.glassOuter, shadow('glass'), style]}>
      <View style={[StyleSheet.absoluteFill, styles.glassClip, { borderColor: ds.glassBorder }]} pointerEvents="none">
        {blur ? <BlurView intensity={40} tint={isDark ? 'dark' : 'light'} style={StyleSheet.absoluteFill} /> : null}
        <View style={[StyleSheet.absoluteFill, { backgroundColor: ds.glass }]} />
      </View>
      <View style={{ padding, gap: 10 }}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: radius.card, gap: 10 },
  glassOuter: { borderRadius: radius.cardLg },
  glassClip: { borderRadius: radius.cardLg, overflow: 'hidden', borderWidth: 1 },
});
