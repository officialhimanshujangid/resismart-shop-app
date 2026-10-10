import React from 'react';
import { Image, View, type StyleProp, type ViewStyle } from 'react-native';

import { useAppTheme } from '../../theme/useAppTheme';

/** `assets/resismartlogo.png` is 892 × 165. */
const RATIO = 892 / 165;

/**
 * The ResiSmart wordmark for the sign-in screens (Owner, 2026-10-06: the logo
 * on every auth screen). ~32 px tall, aspect kept, announced as "ResiSmart".
 *
 * The artwork is navy ink for a white page, so on anything dark — the green
 * hero (`onDark`) or dark mode — it is painted white with `tintColor` (alpha
 * kept): never navy on dark. Wrap it in `Rise index={0}` for the entrance.
 */
export function BrandWordmark({
  height = 32,
  onDark = false,
  testID = 'brand-wordmark',
  style,
}: {
  height?: number;
  onDark?: boolean;
  testID?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const { isDark } = useAppTheme();
  const white = onDark || isDark;
  return (
    <View accessible accessibilityRole="image" accessibilityLabel="ResiSmart" testID={testID} style={style}>
      <Image
        source={require('../../../assets/resismartlogo.png')}
        style={[{ height, width: Math.round(height * RATIO) }, white ? { tintColor: '#FFFFFF' } : null]}
        resizeMode="contain"
        accessibilityIgnoresInvertColors
      />
    </View>
  );
}
