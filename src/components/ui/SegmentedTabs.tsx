import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View, type LayoutChangeEvent, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import { useTranslation } from 'react-i18next';

import { MIN_TOUCH, radius } from '../../theme/tokens';
import { useAppTheme } from '../../theme/useAppTheme';
import { tapHaptic, useMotionOK } from '../../theme/motion';

/**
 * UX-P kit — stage tabs with count badges (ShopOrders board: "New 4 · Packing 2 ·
 * Ready 1 · Done 16"). Unlike `Segmented` (2–4 equal segments) this one scrolls
 * sideways and every tab hugs its own words, so 5–7 stages fit at 360 px and a
 * long Hindi label is never clipped.
 *
 * The selected tab sits on ONE green pill that slides (translateX, UI thread)
 * and springs to the new tab's width; its label turns `onPrimary` (white in
 * light, deep-green ink on the bright dark-mode fill — both ≥ 4.5:1). A count
 * is drawn ONLY when the caller knows it — never a guessed 0. Reduce-motion:
 * the pill jumps. The selected tab is scrolled into view.
 */
export interface TabOption<T extends string> {
  key: T;
  label: string;
  /** Shown in a small badge after the label; omit when unknown. */
  count?: number;
  testID?: string;
}

export function SegmentedTabs<T extends string>({
  options,
  value,
  onChange,
  testID,
  style,
  contentPadding = 16,
}: {
  options: TabOption<T>[];
  value: T;
  onChange: (v: T) => void;
  testID?: string;
  style?: StyleProp<ViewStyle>;
  /** Side padding inside the scroller (the screen gutter). */
  contentPadding?: number;
}) {
  const { t } = useTranslation();
  const { ds, isDark } = useAppTheme();
  const ok = useMotionOK();
  const [frames, setFrames] = React.useState<Record<string, { x: number; w: number }>>({});
  const scroller = React.useRef<ScrollView>(null);
  const x = useSharedValue(0);
  const w = useSharedValue(0);
  const placed = React.useRef(false);
  const f = frames[value];

  React.useEffect(() => {
    if (!f) return;
    if (!placed.current || !ok) {
      x.value = f.x;
      w.value = f.w;
      placed.current = true;
    } else {
      x.value = withSpring(f.x, { damping: 20, stiffness: 220 });
      w.value = withTiming(f.w, { duration: 220 });
    }
    scroller.current?.scrollTo?.({ x: Math.max(0, f.x - 48), animated: ok });
  }, [f, ok, x, w]);

  // One absolutely-placed pill; only its own box changes size, nothing reflows.
  const pill = useAnimatedStyle(() => ({ width: w.value, transform: [{ translateX: x.value }] }));
  const onLayoutOf = (key: string) => (e: LayoutChangeEvent) => {
    const { x: lx, width } = e.nativeEvent.layout;
    setFrames((prev) => (prev[key]?.x === lx && prev[key]?.w === width ? prev : { ...prev, [key]: { x: lx, w: width } }));
  };

  return (
    <ScrollView
      ref={scroller}
      horizontal
      showsHorizontalScrollIndicator={false}
      style={[styles.scroller, style]}
      contentContainerStyle={{ paddingHorizontal: contentPadding }}
      testID={testID}
    >
      <View accessibilityRole="tablist" style={[styles.track, { backgroundColor: ds.track }]}>
        {f ? (
          <Animated.View pointerEvents="none" style={[styles.pill, { backgroundColor: ds.primaryFill }, pill]} />
        ) : null}
        {options.map((o) => {
          const on = o.key === value;
          const ink = on ? ds.onPrimary : ds.muted;
          const a11y = o.count !== undefined ? t('kit.tabWithCount', { label: o.label, badge: o.count }) : o.label;
          return (
            <Pressable
              key={o.key}
              onLayout={onLayoutOf(o.key)}
              onPress={() => {
                if (!on) tapHaptic();
                onChange(o.key);
              }}
              accessibilityRole="tab"
              accessibilityState={{ selected: on }}
              accessibilityLabel={a11y}
              testID={o.testID ?? (testID ? `${testID}-${o.key}` : undefined)}
              style={[styles.tab, on && !f ? { backgroundColor: ds.primaryFill } : null]}
            >
              <Text style={[styles.label, { color: ink, fontWeight: on ? '700' : '600' }]} numberOfLines={2}>
                {o.label}
              </Text>
              {o.count !== undefined ? (
                <View
                  style={[
                    styles.badge,
                    {
                      backgroundColor: on
                        ? isDark ? 'rgba(6,43,23,0.18)' : 'rgba(255,255,255,0.25)'
                        : ds.primarySoft,
                    },
                  ]}
                >
                  <Text style={[styles.badgeText, { color: on ? ds.onPrimary : isDark ? ds.primary : ds.primaryDeep }]}>
                    {o.count > 999 ? '999+' : String(o.count)}
                  </Text>
                </View>
              ) : null}
            </Pressable>
          );
        })}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroller: { flexGrow: 0, flexShrink: 0 },
  track: { flexDirection: 'row', borderRadius: radius.pill, padding: 4, gap: 2, minHeight: MIN_TOUCH },
  pill: { position: 'absolute', top: 4, bottom: 4, left: 0, borderRadius: radius.pill },
  tab: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 36,
    maxWidth: 200,
    borderRadius: radius.pill,
    paddingHorizontal: 14,
    paddingVertical: 4,
  },
  label: { fontSize: 13, lineHeight: 16, flexShrink: 1 },
  badge: { minWidth: 20, height: 20, borderRadius: 10, paddingHorizontal: 6, alignItems: 'center', justifyContent: 'center' },
  badgeText: { fontSize: 11, fontWeight: '700' },
});
