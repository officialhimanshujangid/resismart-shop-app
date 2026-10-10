import React from 'react';
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { MIN_TOUCH, radius } from '../../theme/tokens';
import { useAppTheme } from '../../theme/useAppTheme';
import { easeOut, useMotionOK } from '../../theme/motion';

export interface SegmentOption<T extends string> {
  key: T;
  label: string;
  /** Shown after the label as "· 3". */
  count?: number;
}

const PAD = 4;

/**
 * DS v1 segmented control: soft track, the selected segment is a white pill
 * with a soft shadow. 44 high; each label may wrap to two lines (Hindi), never
 * clipped. Use for 2–4 options; more than that wants `ChipStrip`.
 *
 * 1R review (rule 14 "segments slide their pill", as guard and web do): the
 * white pill is ONE layer that slides to the chosen segment (0.22 s, UI
 * thread). Until the track is measured — and under reduce-motion — the pill
 * simply sits under the chosen segment, so nothing jumps on the first frame.
 */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  testID,
  style,
}: {
  options: SegmentOption<T>[];
  value: T;
  onChange: (v: T) => void;
  testID?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const { ds, shadow, isDark, status } = useAppTheme();
  const ok = useMotionOK();
  const [width, setWidth] = React.useState(0);
  const n = Math.max(1, options.length);
  const index = Math.max(0, options.findIndex((o) => o.key === value));
  const segW = width > 0 ? (width - PAD * 2) / n : 0;

  const x = useSharedValue(0);
  const placed = React.useRef(false);
  React.useEffect(() => {
    if (!segW) return;
    const to = index * segW;
    if (!placed.current || !ok) {
      x.value = to;
      placed.current = true;
    } else {
      x.value = withTiming(to, { duration: 220, easing: easeOut });
    }
  }, [index, segW, ok, x]);
  const pillStyle = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }] }));

  return (
    <View
      accessibilityRole="tablist"
      testID={testID}
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
      style={[styles.track, { backgroundColor: ds.track }, style]}
    >
      {segW ? (
        <Animated.View
          pointerEvents="none"
          style={[styles.pill, { width: segW, backgroundColor: ds.surface }, shadow('card'), pillStyle]}
        />
      ) : null}
      {options.map((o) => {
        const on = o.key === value;
        const label = o.count !== undefined ? `${o.label} · ${o.count}` : o.label;
        return (
          <Pressable
            key={o.key}
            onPress={() => onChange(o.key)}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            accessibilityLabel={label}
            testID={testID ? `${testID}-${o.key}` : undefined}
            style={[styles.seg, on && !segW ? [{ backgroundColor: ds.surface }, shadow('card')] : null]}
          >
            <Text
              numberOfLines={2}
              style={[
                styles.label,
                {
                  color: on ? (isDark ? status.brand.fg : ds.primaryDeep) : ds.muted,
                  fontWeight: on ? '700' : '600',
                },
              ]}
            >
              {label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  track: { minHeight: MIN_TOUCH, borderRadius: radius.pill, padding: PAD, flexDirection: 'row' },
  pill: { position: 'absolute', top: PAD, bottom: PAD, left: PAD, borderRadius: radius.pill },
  seg: {
    flex: 1,
    minHeight: 36,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  label: { fontSize: 13, lineHeight: 16, textAlign: 'center' },
});
