import React from 'react';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';

import { useDrawProgress } from '../../theme/motion';

/**
 * Grows its child up from the baseline over 1.5 s (DS v1 §5 "Data"). Used by
 * `MiniBars`. A View transform, so it is cheap and works on web too.
 * Reduce-motion: shown at full height at once.
 */
export function GrowIn({ children, dataKey }: { children: React.ReactNode; dataKey?: unknown }) {
  const p = useDrawProgress({ key: dataKey });
  const grow = useAnimatedStyle(() => ({ transform: [{ scaleY: Math.max(0.02, p.value) }] }));
  return <Animated.View style={[{ transformOrigin: 'bottom' }, grow]}>{children}</Animated.View>;
}
