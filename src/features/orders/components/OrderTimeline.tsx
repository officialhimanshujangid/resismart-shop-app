import React, { useEffect } from 'react';
import { StyleSheet, View, useColorScheme } from 'react-native';
import { Text } from 'react-native-paper';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { themeColors } from '../../../constants/colors';
import { Rise, useMotionOK } from '../../../theme/motion';

/**
 * M23 (DS v1) — an order's status timeline: a rail that grows down (scaleY on the
 * UI thread) with one row per step rising in on the 100 ms stagger; the newest
 * step has the brand dot with a soft ring. Theme colours only (light + dark);
 * reduce-motion shows it all at once.
 */
export interface TimelineRow {
  key: string;
  title: string;
  when: string;
  note?: string;
}

export function OrderTimeline({ rows, ended = false }: { rows: TimelineRow[]; ended?: boolean }) {
  const c = themeColors(useColorScheme() === 'dark');
  const ok = useMotionOK();
  const grow = useSharedValue(ok ? 0 : 1);
  useEffect(() => {
    grow.value = ok ? withTiming(1, { duration: 700, easing: Easing.bezier(0.22, 0.8, 0.24, 1) }) : 1;
  }, [ok, grow]);
  const rail = useAnimatedStyle(() => ({ transform: [{ scaleY: grow.value }] }));
  if (!rows.length) return null;
  const last = rows.length - 1;
  return (
    <View style={styles.wrap}>
      <View style={styles.railBox} pointerEvents="none">
        <Animated.View style={[styles.rail, { backgroundColor: c.divider }, rail]} />
      </View>
      {rows.map((r, i) => {
        const current = i === last;
        return (
          <Rise key={r.key} index={Math.min(i, 6)} distance={8}>
            <View style={styles.row}>
              <View
                style={[
                  styles.dot,
                  { borderColor: c.surface },
                  current
                    ? { backgroundColor: ended ? c.textSecondary : c.primary }
                    : { backgroundColor: c.success },
                  current && !ended ? [styles.dotRing, { outlineColor: `${c.primary}33` } as object] : null,
                ]}
              />
              <View style={styles.textCol}>
                <Text style={[styles.title, { color: current ? c.textPrimary : c.textSecondary }]}>{r.title}</Text>
                <Text style={[styles.when, { color: c.textSecondary }]}>{r.when}</Text>
                {r.note ? <Text style={[styles.note, { color: c.textSecondary }]}>{r.note}</Text> : null}
              </View>
            </View>
          </Rise>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'relative', paddingLeft: 2 },
  railBox: { position: 'absolute', left: 6, top: 8, bottom: 8, width: 2, overflow: 'hidden' },
  rail: { flex: 1, width: 2, borderRadius: 1, transformOrigin: 'top' },
  row: { flexDirection: 'row', gap: 10, paddingVertical: 5 },
  dot: { width: 12, height: 12, borderRadius: 6, borderWidth: 2, marginTop: 3 },
  dotRing: { outlineWidth: 3, outlineStyle: 'solid' } as object,
  textCol: { flex: 1, minWidth: 0 },
  title: { fontSize: 12.5, fontWeight: '600' },
  when: { fontSize: 11 },
  note: { fontSize: 12, marginTop: 2, fontStyle: 'italic' },
});
