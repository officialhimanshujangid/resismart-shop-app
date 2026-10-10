import React from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  interpolate,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
  type SharedValue,
} from 'react-native-reanimated';
import { router } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';

import { MIN_TOUCH, fontFamily, radius, typeScale } from '../../theme/tokens';
import { useAppTheme } from '../../theme/useAppTheme';
import { PressableScale, useMotionOK } from '../../theme/motion';
import { useHindiTitleFace } from '../../theme/hindiFace';

/**
 * UX-P kit — the iOS-style large title (ShopOrders / ShopKhata / C10 Stock).
 *
 * Two halves, so the big title can live INSIDE the list (it scrolls away with
 * the content, nothing is pinned twice) while a slim bar stays on top:
 *
 *   const { scrollY, onScroll } = useLargeTitleScroll();
 *   <LargeTitleBar title="Khata" scrollY={scrollY} right={<HelpButton …/>} />
 *   <Animated.FlatList onScroll={onScroll} scrollEventThrottle={16}
 *     ListHeaderComponent={<LargeTitle title="Khata" eyebrow="…" trailing={…} scrollY={scrollY} />} … />
 *
 * As the big title scrolls under the bar it fades and shrinks a little, and
 * the bar's small title fades in (UI thread, transform/opacity only). Pulling
 * down past the top grows the big title slightly. Reduce-motion: the bar
 * title simply appears once scrolled, no scaling. The big title wraps (Hindi)
 * and the trailing figure never pushes it off a 360 px screen.
 */
export function useLargeTitleScroll() {
  const scrollY = useSharedValue(0);
  const onScroll = useAnimatedScrollHandler((e) => {
    scrollY.value = e.contentOffset.y;
  });
  return { scrollY, onScroll };
}

/** Where the bar title is fully in (the big title's height, roughly). */
const SWAP_AT = 56;

export function LargeTitleBar({
  title,
  scrollY,
  back = true,
  right,
  testID,
}: {
  title: string;
  scrollY?: SharedValue<number>;
  back?: boolean;
  right?: React.ReactNode;
  testID?: string;
}) {
  const { t } = useTranslation();
  const { ds } = useAppTheme();
  const ok = useMotionOK();
  const hi = useHindiTitleFace(16);
  const small = useAnimatedStyle(() => {
    const y = scrollY ? scrollY.value : 0;
    const p = interpolate(y, [SWAP_AT - 24, SWAP_AT], [0, 1], 'clamp');
    return ok ? { opacity: p, transform: [{ translateY: (1 - p) * 6 }] } : { opacity: y > SWAP_AT - 12 ? 1 : 0 };
  });
  const hairline = useAnimatedStyle(() => ({
    opacity: interpolate(scrollY ? scrollY.value : 0, [0, SWAP_AT], [0, 1], 'clamp'),
  }));
  return (
    <View style={[styles.bar, { backgroundColor: ds.ground }]} testID={testID}>
      {back ? (
        <PressableScale
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel={t('common.back')}
          hitSlop={4}
          style={[styles.iconBtn, { backgroundColor: ds.surfaceAlt }]}
        >
          <MaterialCommunityIcons name="chevron-left" size={24} color={ds.ink} />
        </PressableScale>
      ) : (
        <View style={styles.iconSpacer} />
      )}
      <Animated.Text
        style={[styles.barTitle, hi, { color: ds.ink }, small]}
        numberOfLines={1}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        {title}
      </Animated.Text>
      <View style={styles.right}>{right ?? <View style={styles.iconSpacer} />}</View>
      <Animated.View pointerEvents="none" style={[styles.hairline, { backgroundColor: ds.line }, hairline]} />
    </View>
  );
}

export function LargeTitle({
  title,
  eyebrow,
  trailing,
  scrollY,
  style,
  testID,
}: {
  title: string;
  /** A short line above the title ("Total due · 18 customers"). */
  eyebrow?: string;
  /** Right side: a figure or one icon button. */
  trailing?: React.ReactNode;
  scrollY?: SharedValue<number>;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}) {
  const { ds } = useAppTheme();
  const ok = useMotionOK();
  const hi = useHindiTitleFace(30);
  const anim = useAnimatedStyle(() => {
    if (!ok || !scrollY) return {};
    const y = scrollY.value;
    const scale = y < 0 ? interpolate(y, [-120, 0], [1.08, 1], 'clamp') : interpolate(y, [0, SWAP_AT], [1, 0.94], 'clamp');
    return {
      opacity: interpolate(y, [0, SWAP_AT], [1, 0], 'clamp'),
      transform: [{ scale }],
    };
  });
  return (
    <Animated.View style={[styles.large, anim, style]} testID={testID}>
      <View style={styles.largeText}>
        {eyebrow ? <Text style={[styles.eyebrow, { color: ds.muted }]}>{eyebrow}</Text> : null}
        <Text style={[styles.largeTitle, hi, { color: ds.ink }]} accessibilityRole="header">{title}</Text>
      </View>
      {trailing ? <View style={styles.trailing}>{trailing}</View> : null}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, minHeight: 52 },
  iconBtn: { width: MIN_TOUCH, height: MIN_TOUCH, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  iconSpacer: { width: MIN_TOUCH, height: MIN_TOUCH },
  barTitle: { ...typeScale.section, flex: 1, textAlign: 'center' },
  right: { minWidth: MIN_TOUCH, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end' },
  hairline: { position: 'absolute', left: 0, right: 0, bottom: 0, height: StyleSheet.hairlineWidth },
  large: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 12,
    paddingTop: 2,
    paddingBottom: 4,
    transformOrigin: 'left bottom',
  },
  largeText: { flex: 1, minWidth: 0, gap: 2 },
  eyebrow: { fontSize: 13, fontWeight: '600', lineHeight: 18 },
  largeTitle: { fontFamily: fontFamily.sora700, fontSize: 30, lineHeight: 38, letterSpacing: -0.6 },
  trailing: { flexShrink: 0, maxWidth: '50%', alignItems: 'flex-end' },
});
