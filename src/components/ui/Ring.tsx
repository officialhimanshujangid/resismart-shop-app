import React from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Circle, Defs, LinearGradient, Stop } from 'react-native-svg';
import Animated, { useAnimatedProps } from 'react-native-reanimated';
import { useTranslation } from 'react-i18next';

import { useAppTheme } from '../../theme/useAppTheme';
import { useDrawProgress } from '../../theme/motion';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

/**
 * Progress ring (DesignSystem template "Data widgets"): soft track, gradient
 * arc that fills in 1.5 s from 12 o'clock, anything in the middle (`children`,
 * e.g. "2/3" in Sora). Reduce-motion: drawn full at once.
 */
export function Ring({
  progress,
  size = 84,
  stroke = 9,
  label,
  children,
  colors,
  testID,
  style,
}: {
  /** 0..1 */
  progress: number;
  size?: number;
  stroke?: number;
  /** Screen-reader name. */
  label: string;
  children?: React.ReactNode;
  /** [light end, deep end]; defaults to the brand green ramp. */
  colors?: [string, string];
  testID?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const { t } = useTranslation();
  const { ds, isDark } = useAppTheme();
  const p = Math.max(0, Math.min(1, progress || 0));
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const draw = useDrawProgress({ key: p });
  const [from, to] = colors ?? (isDark ? ['#8FDDB3', '#3FB27B'] : ['#8FD0A8', '#2E9C68']);
  const gid = `ring-${size}-${to.replace('#', '')}`;

  const arcProps = useAnimatedProps(() => ({ strokeDashoffset: circ * (1 - p * draw.value) }));

  return (
    <View
      testID={testID}
      style={[{ width: size, height: size }, style]}
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={t('kit.ringA11y', { label, percent: Math.round(p * 100) })}
      accessibilityValue={{ min: 0, max: 100, now: Math.round(p * 100) }}
    >
      <Svg width={size} height={size}>
        <Defs>
          <LinearGradient id={gid} x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor={from} />
            <Stop offset="1" stopColor={to} />
          </LinearGradient>
        </Defs>
        <Circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={ds.primarySoft} strokeWidth={stroke} />
        <AnimatedCircle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={`url(#${gid})`}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${circ} ${circ}`}
          animatedProps={arcProps}
          rotation={-90}
          origin={`${size / 2}, ${size / 2}`}
        />
      </Svg>
      {children ? <View style={[StyleSheet.absoluteFill, styles.center]}>{children}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: 'center', justifyContent: 'center' },
});
