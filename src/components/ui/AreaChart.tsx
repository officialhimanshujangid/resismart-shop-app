import React, { useMemo, useState } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Circle, Defs, LinearGradient, Path, Stop } from 'react-native-svg';
import Animated, { useAnimatedProps, useAnimatedStyle } from 'react-native-reanimated';
import { useTranslation } from 'react-i18next';

import { useAppTheme } from '../../theme/useAppTheme';
import { useDrawProgress } from '../../theme/motion';

const AnimatedPath = Animated.createAnimatedComponent(Path);

/**
 * Smooth area chart (ShopHome "Sales today"): a 3 px line that DRAWS in over
 * 1.5 s, a soft gradient area that fades in after it, and a ringed dot on the
 * last point. Fills its parent's width unless `width` is given.
 *
 * Reduce-motion: the line and area are shown complete at once.
 */
export function AreaChart({
  values,
  height = 56,
  width,
  color,
  label,
  latestText,
  testID,
  style,
}: {
  values: number[];
  height?: number;
  width?: number;
  color?: string;
  /** Screen-reader name, e.g. "Sales through the day". */
  label?: string;
  /** Screen-reader latest value, formatted. */
  latestText?: string;
  testID?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const { t } = useTranslation();
  const { ds } = useAppTheme();
  const stroke = color ?? ds.primary;
  const [measured, setMeasured] = useState(width ?? 0);
  const w = width ?? measured;

  const shape = useMemo(() => buildShape(values, w, height), [values, w, height]);
  const progress = useDrawProgress({ key: `${values.join(',')}|${w}` });

  const lineProps = useAnimatedProps(() => ({
    strokeDashoffset: (shape?.length ?? 0) * (1 - progress.value),
  }));
  const areaStyle = useAnimatedStyle(() => ({ opacity: Math.max(0, (progress.value - 0.45) / 0.55) }));
  const dotStyle = useAnimatedStyle(() => ({ opacity: progress.value >= 0.98 ? 1 : 0 }));

  const shownLabel = label ?? t('components.chart.trendLabel');
  const a11y = latestText ? t('kit.areaA11y', { label: shownLabel, latest: latestText }) : shownLabel;
  const gid = `area-${Math.round(height)}-${stroke.replace('#', '')}`;

  return (
    <View
      testID={testID}
      style={[{ height }, style]}
      onLayout={width ? undefined : (e) => setMeasured(Math.round(e.nativeEvent.layout.width))}
      accessible
      accessibilityRole="image"
      accessibilityLabel={a11y}
    >
      {shape && w > 0 ? (
        <>
          <Animated.View style={[{ position: 'absolute', left: 0, top: 0 }, areaStyle]}>
            <Svg width={w} height={height}>
              <Defs>
                <LinearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
                  <Stop offset="0" stopColor={stroke} stopOpacity={0.28} />
                  <Stop offset="1" stopColor={stroke} stopOpacity={0} />
                </LinearGradient>
              </Defs>
              <Path d={shape.area} fill={`url(#${gid})`} />
            </Svg>
          </Animated.View>
          <Svg width={w} height={height} style={{ position: 'absolute', left: 0, top: 0 }}>
            <AnimatedPath
              d={shape.line}
              fill="none"
              stroke={stroke}
              strokeWidth={3}
              strokeLinecap="round"
              strokeDasharray={`${shape.length} ${shape.length}`}
              animatedProps={lineProps}
            />
          </Svg>
          <Animated.View style={[{ position: 'absolute', left: 0, top: 0 }, dotStyle]} pointerEvents="none">
            <Svg width={w} height={height}>
              <Circle cx={shape.last.x} cy={shape.last.y} r={5} fill={ds.surface} stroke={stroke} strokeWidth={3} />
            </Svg>
          </Animated.View>
        </>
      ) : null}
    </View>
  );
}

/** Catmull-Rom → cubic Bézier; returns the path, area, last point and an over-estimated length. */
function buildShape(values: number[], width: number, height: number) {
  if (!values.length || width <= 0) return null;
  const pad = 6;
  const max = Math.max(...values);
  const min = Math.min(...values, 0);
  const span = max - min || 1;
  const n = values.length;
  const pts = values.map((v, i) => ({
    x: n === 1 ? width / 2 : pad + ((width - pad * 2) * i) / (n - 1),
    y: pad + (height - pad * 2) * (1 - (v - min) / span),
  }));
  let line = `M${pts[0].x.toFixed(1)} ${pts[0].y.toFixed(1)}`;
  let length = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] ?? p2;
    const c1 = { x: p1.x + (p2.x - p0.x) / 6, y: p1.y + (p2.y - p0.y) / 6 };
    const c2 = { x: p2.x - (p3.x - p1.x) / 6, y: p2.y - (p3.y - p1.y) / 6 };
    line += ` C${c1.x.toFixed(1)} ${c1.y.toFixed(1)} ${c2.x.toFixed(1)} ${c2.y.toFixed(1)} ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`;
    // Control-polygon length ≥ curve length, so the dash always covers the line.
    length +=
      Math.hypot(c1.x - p1.x, c1.y - p1.y) + Math.hypot(c2.x - c1.x, c2.y - c1.y) + Math.hypot(p2.x - c2.x, p2.y - c2.y);
  }
  const last = pts[pts.length - 1];
  const area = `${line} L${last.x.toFixed(1)} ${height} L${pts[0].x.toFixed(1)} ${height} Z`;
  return { line, area, last, length: Math.ceil(length) + 2 };
}
