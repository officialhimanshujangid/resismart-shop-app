import React, { useMemo } from 'react';
import { View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';

import { ColorScheme } from '../../constants/colors';

/**
 * A trailing-value line, drawn from an `AnalyticsBoard` `Series`' points
 * verbatim (`{t, v}[]`, dense — every bucket present, `v: 0` for a quiet one).
 * Built for the shop idiom: a `ColorScheme` passed in as `c`, no external
 * chart library, small enough to inline in a KPI tile.
 *
 * EMPTY: every point `0` (or the array is empty) draws a flat muted line
 * instead of a shape a partner could mistake for "no sales, but trending
 * somewhere" — `Sparkline` never invents a slope from nothing. LOADING/ERROR
 * are the caller's job (a skeleton, or `ErrorBlock` from `features/more/ui`);
 * this component only ever renders a value it was actually given.
 */
export interface SparklinePoint {
  t: string;
  v: number | null;
}

const PAD = 4;

export function Sparkline({
  c,
  points,
  color,
  height = 36,
  width = 96,
  strokeWidth = 2,
  fill = true,
  label = 'Trend',
  valueFormatter,
  accessibilityLabel,
}: {
  c: ColorScheme;
  points: SparklinePoint[];
  /** Defaults to `c.primary`. */
  color?: string;
  height?: number;
  width?: number;
  strokeWidth?: number;
  /** A faint area under the line. Off for a tiny inline sparkline that would otherwise look muddy. */
  fill?: boolean;
  /** What this trend IS ("Today's sale trend") — feeds the default screen-reader summary. */
  label?: string;
  /** Formats the latest raw value for the screen-reader summary, e.g. `formatPaise`. */
  valueFormatter?: (v: number) => string;
  /** Full override for the screen-reader summary, when the caller wants exact wording. */
  accessibilityLabel?: string;
}) {
  const stroke = color ?? c.primary;

  const shape = useMemo(() => {
    if (points.length === 0) return null;

    const values = points.map((p) => (typeof p.v === 'number' ? p.v : 0));
    const allZero = values.every((v) => v === 0);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const span = max - min;
    const innerW = width - PAD * 2;
    const innerH = height - PAD * 2;
    const n = values.length;

    const coords = values.map((v, i) => {
      const x = n === 1 ? PAD + innerW / 2 : PAD + (innerW * i) / (n - 1);
      const y = span === 0 ? PAD + innerH / 2 : PAD + innerH * (1 - (v - min) / span);
      return { x, y };
    });

    const line = coords.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
    const baseline = (height - PAD).toFixed(1);
    const area = `${line} L${coords[coords.length - 1].x.toFixed(1)},${baseline} L${coords[0].x.toFixed(1)},${baseline} Z`;

    return { line, area, last: coords[coords.length - 1], allZero };
  }, [points, width, height]);

  // A screen-reader summary derived from the same points the SVG draws, so
  // the trend is always reachable as text — never colour/slope-only.
  const lastPoint = [...points].reverse().find((p) => typeof p.v === 'number');
  const describeValue = (v: number) => (valueFormatter ? valueFormatter(v) : String(v));
  const defaultA11yLabel =
    points.length === 0
      ? `${label}, no data yet`
      : shape?.allZero
        ? `${label}, no activity in this period`
        : lastPoint
          ? `${label}, ${points.length} points, latest ${describeValue(lastPoint.v as number)}`
          : `${label}, ${points.length} points`;
  const resolvedA11yLabel = accessibilityLabel ?? defaultA11yLabel;

  if (!shape) {
    return (
      <View
        style={{ height, width }}
        accessible
        accessibilityRole="image"
        accessibilityLabel={resolvedA11yLabel}
      />
    );
  }

  const lineColor = shape.allZero ? c.textDisabled : stroke;

  return (
    <View accessible accessibilityRole="image" accessibilityLabel={resolvedA11yLabel}>
      <Svg width={width} height={height}>
        {fill && !shape.allZero && <Path d={shape.area} fill={stroke} opacity={0.14} />}
        <Path
          d={shape.line}
          stroke={lineColor}
          strokeWidth={strokeWidth}
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <Circle cx={shape.last.x} cy={shape.last.y} r={strokeWidth + 1} fill={lineColor} />
      </Svg>
    </View>
  );
}
