import React from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';

import { motion, radius, tileDepth, type TintName } from '../../theme/tokens';
import { useAppTheme } from '../../theme/useAppTheme';
import { PressableScale } from '../../theme/motion';

/**
 * Service tile (ShopHome template): a 60 px tinted gradient square with the
 * icon in the tint's deeper colour, a label under it that wraps to two lines,
 * and an optional count or NEW badge. Presses scale to 0.93.
 *
 * Lay tiles out in a 4-column grid (`TileGrid`); each tile is at least 44 wide.
 */
export function ServiceTile({
  label,
  icon,
  tint = 'green',
  badge,
  onPress,
  accessibilityLabel,
  testID,
  style,
}: {
  label: string;
  icon: string;
  tint?: TintName;
  /** A count (0 hides it) or `'new'`. */
  badge?: number | 'new';
  onPress?: () => void;
  accessibilityLabel?: string;
  testID?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const { t } = useTranslation();
  const { tints, ds, isDark } = useAppTheme();
  const tn = tints[tint];
  const showBadge = badge === 'new' || (typeof badge === 'number' && badge > 0);
  const badgeText = badge === 'new' ? t('kit.newBadge') : typeof badge === 'number' && badge > 99 ? '99+' : String(badge);
  // UX-ICON: ink-tinted lift in light, tinted hairline in dark (one recipe: tileDepth).
  const depth = tileDepth(tn, isDark, 'tile');

  return (
    <PressableScale
      onPress={onPress}
      scaleTo={motion.press.tileScale}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? (showBadge ? t('kit.tabWithCount', { label, badge: badgeText }) : label)}
      testID={testID}
      style={[styles.tile, style]}
    >
      <View style={[styles.square, depth]}>
        <LinearGradient
          colors={[tn.from, tn.to]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[StyleSheet.absoluteFill, styles.squareFill]}
        />
        <MaterialCommunityIcons name={icon as never} size={25} color={tn.icon} />
        {showBadge ? (
          <View style={[styles.badge, { backgroundColor: tint === 'coral' || tint === 'sos' ? tn.icon : ds.primaryFill, borderColor: ds.ground }]}>
            <Text style={[styles.badgeText, { color: isDark ? ds.onPrimary : '#FFFFFF' }]}>{badgeText}</Text>
          </View>
        ) : null}
      </View>
      <Text style={[styles.label, { color: ds.ink }]} numberOfLines={2}>
        {label}
      </Text>
    </PressableScale>
  );
}

/** A 4-column tile grid that keeps every column equal at 320–430 px. */
export function TileGrid({ children, columns = 4, style }: { children: React.ReactNode; columns?: number; style?: StyleProp<ViewStyle> }) {
  const items = React.Children.toArray(children);
  return (
    <View style={[styles.grid, style]}>
      {items.map((child, i) => (
        <View key={i} style={{ width: `${100 / columns}%`, alignItems: 'center' }}>
          {child}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  tile: { alignItems: 'center', gap: 8, minWidth: 44, maxWidth: 92, paddingHorizontal: 2 },
  square: { width: 60, height: 60, borderRadius: radius.tile, alignItems: 'center', justifyContent: 'center' },
  squareFill: { borderRadius: radius.tile },
  badge: {
    position: 'absolute',
    top: -4,
    right: -4,
    minWidth: 18,
    height: 18,
    paddingHorizontal: 4,
    borderRadius: 9,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { fontSize: 10, fontWeight: '700' },
  label: { fontSize: 12, fontWeight: '600', lineHeight: 16, textAlign: 'center' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', rowGap: 14 },
});
