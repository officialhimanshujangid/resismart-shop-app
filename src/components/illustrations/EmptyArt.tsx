import React from 'react';
import { View } from 'react-native';
import Svg, { Circle, G, Path, Rect } from 'react-native-svg';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';

import { useAppTheme } from '../../theme/useAppTheme';
import { useAmbientLoop } from '../../theme/motion';

/**
 * UX-P kit — the one illustrated empty-state set (ideas S7 / P6): a soft
 * pastel disc, one object drawn in the brand green, and four small coloured
 * dots (the C2 "inbox zero" art). Drawn from theme tokens, so it is right in
 * light and dark; the object bobs gently (3 s), still under reduce-motion.
 * Decorative: the EmptyState's own title says what is (not) there.
 */
export type EmptyArtKind = 'orders' | 'khata' | 'catalog' | 'stock' | 'search' | 'done';

export function EmptyArt({ kind, size = 120, testID }: { kind: EmptyArtKind; size?: number; testID?: string }) {
  const { ds, tints, isDark } = useAppTheme();
  const bob = useAmbientLoop(3000);
  const float = useAnimatedStyle(() => ({ transform: [{ translateY: -3 * bob.value }] }));
  const h = Math.round(size * 0.75);
  const ink = ds.primaryFill;
  const soft = isDark ? tints.green.to : tints.green.from;
  const paper = isDark ? ds.surfaceAlt : ds.surface;
  return (
    <View
      testID={testID}
      style={{ width: size, height: h, alignSelf: 'center' }}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <Svg width={size} height={h} viewBox="0 0 120 90" style={{ position: 'absolute' }}>
        <Circle cx={60} cy={46} r={36} fill={soft} />
        <Circle cx={16} cy={20} r={4} fill={tints.blue.icon} />
        <Circle cx={104} cy={16} r={5} fill={tints.amber.icon} />
        <Circle cx={101} cy={74} r={4} fill={tints.rose.icon} />
        <Circle cx={20} cy={70} r={3} fill={tints.green.icon} />
      </Svg>
      <Animated.View style={[{ position: 'absolute', width: size, height: h }, float]}>
        <Svg width={size} height={h} viewBox="0 0 120 90">
          <G>{shape(kind, ink, paper, ds.line)}</G>
        </Svg>
      </Animated.View>
    </View>
  );
}

function shape(kind: EmptyArtKind, ink: string, paper: string, line: string) {
  switch (kind) {
    case 'orders': // a shopping bag
      return (
        <>
          <Path d="M42 36h36l-3 32H45z" fill={paper} stroke={ink} strokeWidth={3} strokeLinejoin="round" />
          <Path d="M52 40v-6a8 8 0 0 1 16 0v6" fill="none" stroke={ink} strokeWidth={3} strokeLinecap="round" />
          <Path d="M53 54l5 5 10-11" fill="none" stroke={ink} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />
        </>
      );
    case 'khata': // a ledger with a tick
      return (
        <>
          <Rect x={42} y={26} width={36} height={44} rx={5} fill={paper} stroke={ink} strokeWidth={3} />
          <Path d="M50 26v44" stroke={line} strokeWidth={2} />
          <Path d="M56 38h14M56 46h14" stroke={line} strokeWidth={2.5} strokeLinecap="round" />
          <Path d="M56 57l4 4 9-9" fill="none" stroke={ink} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />
        </>
      );
    case 'catalog': // an open box
      return (
        <>
          <Path d="M40 40l20-9 20 9-20 9z" fill={paper} stroke={ink} strokeWidth={3} strokeLinejoin="round" />
          <Path d="M40 40v22l20 9 20-9V40" fill={paper} stroke={ink} strokeWidth={3} strokeLinejoin="round" />
          <Path d="M60 49v22" stroke={ink} strokeWidth={3} />
        </>
      );
    case 'stock': // a shelf with two boxes
      return (
        <>
          <Rect x={44} y={40} width={14} height={18} rx={3} fill={paper} stroke={ink} strokeWidth={3} />
          <Rect x={62} y={34} width={14} height={24} rx={3} fill={paper} stroke={ink} strokeWidth={3} />
          <Path d="M36 60h48" stroke={ink} strokeWidth={3.5} strokeLinecap="round" />
          <Path d="M40 60v8M80 60v8" stroke={ink} strokeWidth={3} strokeLinecap="round" />
        </>
      );
    case 'search': // a magnifier
      return (
        <>
          <Circle cx={55} cy={44} r={14} fill={paper} stroke={ink} strokeWidth={3.5} />
          <Path d="M65 54l11 11" stroke={ink} strokeWidth={4} strokeLinecap="round" />
        </>
      );
    case 'done':
    default: // a big tick
      return <Path d="M45 46l10 10 20-22" fill="none" stroke={ink} strokeWidth={6} strokeLinecap="round" strokeLinejoin="round" />;
  }
}
