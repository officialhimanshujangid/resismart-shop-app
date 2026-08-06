import React from 'react';
import { View } from 'react-native';
import Svg, { Rect } from 'react-native-svg';

import { ColorScheme } from '../../constants/colors';

/**
 * A trailing bar chart over the same dense `{t, v}[]` a `Series` carries —
 * the bar-chart twin of `Sparkline`, for the trend a shop owner reads as
 * "how did each day compare" rather than "what is the slope" (Reports
 * Insights' sales trend).
 *
 * EMPTY: every bar `0` draws flat muted stubs at the baseline, same reasoning
 * as `Sparkline` — a chart never implies data it was not given.
 */
export interface BarPoint {
  t: string;
  v: number | null;
}

const PAD = 2;
const GAP = 3;
const MIN_BAR_H = 2;

export function MiniBars({
  c,
  points,
  color,
  height = 64,
  width = 260,
  radius = 3,
  label = 'Bar chart',
  valueFormatter,
  accessibilityLabel,
}: {
  c: ColorScheme;
  points: BarPoint[];
  /** Defaults to `c.primary`. */
  color?: string;
  height?: number;
  width?: number;
  radius?: number;
  /** What this chart IS ("Sales this week") — feeds the default screen-reader summary. */
  label?: string;
  /** Formats raw values for the screen-reader summary, e.g. `formatPaise`. */
  valueFormatter?: (v: number) => string;
  /** Full override for the screen-reader summary. */
  accessibilityLabel?: string;
}) {
  const describeValue = (v: number) => (valueFormatter ? valueFormatter(v) : String(v));

  if (points.length === 0) {
    return (
      <View
        style={{ height, width }}
        accessible
        accessibilityRole="image"
        accessibilityLabel={accessibilityLabel ?? `${label}, no data yet`}
      />
    );
  }

  const fillColor = color ?? c.primary;
  const values = points.map((p) => (typeof p.v === 'number' ? p.v : 0));
  const max = Math.max(0, ...values);
  const allZero = max <= 0;
  const n = values.length;
  const innerW = width - PAD * 2;
  const slot = innerW / n;
  const barW = Math.max(2, slot - GAP);
  const innerH = height - PAD * 2;

  const lastValue = values[values.length - 1];
  const defaultA11yLabel = allZero
    ? `${label}, no activity in this period`
    : `${label}, ${n} bars, latest ${describeValue(lastValue)}, highest ${describeValue(max)}`;

  return (
    <View accessible accessibilityRole="image" accessibilityLabel={accessibilityLabel ?? defaultA11yLabel}>
      <Svg width={width} height={height}>
        {values.map((v, i) => {
          const h = allZero ? MIN_BAR_H : Math.max(MIN_BAR_H, (v / max) * innerH);
          const x = PAD + i * slot + (slot - barW) / 2;
          const y = height - PAD - h;
          return (
            <Rect
              key={i}
              x={x}
              y={y}
              width={barW}
              height={h}
              rx={radius}
              fill={allZero ? c.divider : fillColor}
              opacity={allZero ? 1 : 0.85}
            />
          );
        })}
      </Svg>
    </View>
  );
}
