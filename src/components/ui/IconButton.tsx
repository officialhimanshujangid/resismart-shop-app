import React from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import { MIN_TOUCH, radius } from '../../theme/tokens';
import { palette } from '../../constants/colors';
import { useAppTheme } from '../../theme/useAppTheme';
import { PressableScale } from '../../theme/motion';

export type IconButtonVariant = 'surface' | 'glass' | 'soft' | 'ink' | 'plain';

/**
 * A round 44+ icon button (DS v1 §4). `glass` is for use ON the hero sky
 * (white 18 % fill + white hairline); `ink` is the dark square-ish scan button
 * from the billing template. An accessibility label is required — there is no
 * visible text.
 */
export function IconButton({
  icon,
  accessibilityLabel,
  onPress,
  variant = 'surface',
  size = MIN_TOUCH,
  badge,
  rounded = true,
  disabled,
  testID,
  style,
}: {
  icon: string;
  accessibilityLabel: string;
  onPress?: () => void;
  variant?: IconButtonVariant;
  size?: number;
  /** A count (0 hides it) or a short text. */
  badge?: number | string;
  /** false → 18 px corners instead of a circle (the template's scan button). */
  rounded?: boolean;
  disabled?: boolean;
  testID?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const { ds, shadow } = useAppTheme();
  const box = Math.max(size, MIN_TOUCH);

  const look: Record<IconButtonVariant, { bg: string; fg: string; border?: string }> = {
    surface: { bg: ds.surface, fg: ds.ink },
    glass: { bg: 'rgba(255,255,255,0.18)', fg: '#FFFFFF', border: 'rgba(255,255,255,0.4)' },
    soft: { bg: ds.primarySoft, fg: ds.primary },
    ink: { bg: ds.inkButton, fg: ds.onInkButton },
    plain: { bg: 'transparent', fg: ds.iconMuted },
  };
  const l = look[variant];
  const showBadge = badge !== undefined && badge !== 0 && badge !== '';

  return (
    <PressableScale
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled: !!disabled }}
      testID={testID}
      style={[
        styles.base,
        {
          width: box,
          height: box,
          borderRadius: rounded ? box / 2 : 18,
          backgroundColor: l.bg,
          borderWidth: l.border ? 1 : 0,
          borderColor: l.border,
        },
        variant === 'surface' ? shadow('card') : null,
        disabled ? styles.off : null,
        style,
      ]}
    >
      <MaterialCommunityIcons name={icon as never} size={Math.round(box * 0.48)} color={l.fg} />
      {/* E-VISUAL-APPS: coral-600 like the tab-bar badge — white on coral-400 was 2.3:1 */}
      {showBadge ? (
        <View style={[styles.badge, { backgroundColor: palette.coral[600] }]} pointerEvents="none">
          <Text style={styles.badgeText} numberOfLines={1}>
            {typeof badge === 'number' && badge > 99 ? '99+' : String(badge)}
          </Text>
        </View>
      ) : null}
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  base: { alignItems: 'center', justifyContent: 'center' },
  off: { opacity: 0.5 },
  badge: {
    position: 'absolute',
    top: 4,
    right: 3,
    minWidth: 16,
    height: 16,
    paddingHorizontal: 4,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { color: '#FFFFFF', fontSize: 10, fontWeight: '700' },
});
