import React, { useMemo } from 'react';
import { View } from 'react-native';
import Svg, { Circle, G } from 'react-native-svg';
import { Text } from 'react-native-paper';

import { ColorScheme } from '../../constants/colors';

/**
 * A ring breakdown for an `AnalyticsBoard` `Breakdown`'s rows (e.g.
 * receivables ageing) — one stroked circle per slice, drawn as arcs via
 * `strokeDasharray`/`strokeDashoffset` rather than pie wedges, since a ring
 * reads its center label without a wedge point cutting through it.
 *
 * EMPTY: every slice `0` (or none supplied) draws a plain muted ring with no
 * arcs — never a fabricated 100% slice — and `centerValue` is the caller's
 * to set to `—` for that case.
 */
export interface DonutSlice {
  label: string;
  value: number;
  color: string;
}

export function DonutRing({
  c,
  slices,
  size = 120,
  strokeWidth = 16,
  centerLabel,
  centerValue,
  label = 'Breakdown',
  legend = true,
  accessibilityLabel,
}: {
  c: ColorScheme;
  slices: DonutSlice[];
  size?: number;
  strokeWidth?: number;
  centerLabel?: string;
  centerValue?: string;
  /** What this donut IS ("Receivables ageing") — feeds the default screen-reader summary. */
  label?: string;
  /** A per-slice `label — pct%` text list beside the ring, so the split is
   *  readable as text and not colour-only. On by default; turn off for a
   *  compact ring-only placement (e.g. inside a KPI tile). */
  legend?: boolean;
  /** Full override for the screen-reader summary. */
  accessibilityLabel?: string;
}) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const total = slices.reduce((sum, s) => sum + Math.max(0, s.value), 0);

  const segments = useMemo(() => {
    if (total <= 0) return [];
    let offset = 0;
    return slices
      .filter((s) => s.value > 0)
      .map((s) => {
        const length = (s.value / total) * circumference;
        const seg = { color: s.color, length, offset };
        offset += length;
        return seg;
      });
  }, [slices, total, circumference]);

  // Screen-reader summary — every slice's share as text, so the split is
  // reachable without reading colour. The visible legend below repeats this.
  const nonZero = slices.filter((s) => s.value > 0);
  const defaultA11yLabel =
    total <= 0
      ? `${label}, no data yet`
      : `${label}${centerValue ? `, ${centerValue}` : ''}: ${nonZero
          .map((s) => `${s.label} ${Math.round((s.value / total) * 100)}%`)
          .join(', ')}`;

  return (
    <View
      style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}
      accessible
      accessibilityRole="image"
      accessibilityLabel={accessibilityLabel ?? defaultA11yLabel}
    >
      <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
        <Svg width={size} height={size}>
          <G rotation={-90} originX={size / 2} originY={size / 2}>
            <Circle cx={size / 2} cy={size / 2} r={radius} stroke={c.divider} strokeWidth={strokeWidth} fill="none" />
            {segments.map((seg, i) => (
              <Circle
                key={i}
                cx={size / 2}
                cy={size / 2}
                r={radius}
                stroke={seg.color}
                strokeWidth={strokeWidth}
                fill="none"
                strokeDasharray={`${seg.length} ${circumference - seg.length}`}
                strokeDashoffset={-seg.offset}
                strokeLinecap="butt"
              />
            ))}
          </G>
        </Svg>
        {(centerLabel || centerValue) && (
          <View style={{ position: 'absolute', alignItems: 'center', maxWidth: size - strokeWidth * 2 }}>
            {centerValue ? (
              <Text style={{ fontSize: 16, fontWeight: '800', color: c.textPrimary }} numberOfLines={1}>
                {centerValue}
              </Text>
            ) : null}
            {centerLabel ? (
              <Text style={{ fontSize: 10, color: c.textSecondary, textAlign: 'center' }} numberOfLines={2}>
                {centerLabel}
              </Text>
            ) : null}
          </View>
        )}
      </View>
      {legend && nonZero.length > 0 ? (
        <View style={{ flex: 1, gap: 6 }}>
          {nonZero.slice(0, 6).map((s, i) => (
            <View key={s.label + i} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: s.color }} />
              <Text style={{ fontSize: 12, color: c.textPrimary, flex: 1 }} numberOfLines={1}>
                {s.label}
              </Text>
              <Text style={{ fontSize: 11, color: c.textSecondary, fontWeight: '700' }}>
                {Math.round((s.value / total) * 100)}%
              </Text>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}
