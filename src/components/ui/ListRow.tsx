import React from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import { MIN_TOUCH, radius, tileDepth, typeScale, type TintName } from '../../theme/tokens';
import { useAppTheme } from '../../theme/useAppTheme';
import { PressableScale } from '../../theme/motion';

/**
 * List row (DS v1 §4): icon tile + title + detail + trailing amount / badge /
 * chevron. 18 px corners, surface fill. The title wraps to two lines and the
 * detail to two; the trailing amount is Sora and never truncated.
 *
 * Inside a FlatList keep `rise` off — lists stay light (DS §5).
 */
export function ListRow({
  title,
  detail,
  icon,
  tint = 'green',
  amount,
  amountTone,
  trailing,
  onPress,
  chevron,
  danger = false,
  accessibilityLabel,
  testID,
  style,
}: {
  title: string;
  detail?: string;
  icon?: string;
  tint?: TintName;
  /** Formatted money on the right, e.g. "₹642". */
  amount?: string;
  amountTone?: 'default' | 'success' | 'danger';
  /** Anything else on the right (a StatusBadge, a Switch). */
  trailing?: React.ReactNode;
  onPress?: () => void;
  /** Defaults to on when the row is pressable and there is no trailing content. */
  chevron?: boolean;
  danger?: boolean;
  accessibilityLabel?: string;
  testID?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const { ds, tints, status, shadow, isDark } = useAppTheme();
  const tn = tints[danger ? 'sos' : tint];
  const showChevron = chevron ?? (!!onPress && !trailing && !amount);
  const amountColor =
    amountTone === 'success' ? status.success.fg : amountTone === 'danger' ? status.danger.fg : ds.ink;

  const content = (
    <>
      {icon ? (
        <View style={[styles.iconTile, tileDepth(tn, isDark, 'soft')]}>
          <LinearGradient colors={[tn.from, tn.to]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[StyleSheet.absoluteFill, styles.iconFill]} />
          <MaterialCommunityIcons name={icon as never} size={21} color={tn.icon} />
        </View>
      ) : null}
      <View style={styles.text}>
        <Text style={[typeScale.row, { color: danger ? status.danger.fg : ds.ink }]} numberOfLines={2}>
          {title}
        </Text>
        {detail ? (
          <Text style={[typeScale.detail, { color: ds.muted }]} numberOfLines={2}>
            {detail}
          </Text>
        ) : null}
      </View>
      {amount ? <Text style={[typeScale.number, styles.amount, { color: amountColor }]}>{amount}</Text> : null}
      {trailing}
      {showChevron ? <MaterialCommunityIcons name="chevron-right" size={22} color={ds.iconMuted} /> : null}
    </>
  );

  // Hairline edge in both modes: the light page is white (Owner 2026-10-06).
  const rowStyle = [styles.row, { backgroundColor: ds.surface, borderWidth: 1, borderColor: ds.line }, shadow('card'), style];
  if (!onPress) {
    return (
      <View testID={testID} style={rowStyle} accessibilityLabel={accessibilityLabel}>
        {content}
      </View>
    );
  }
  return (
    <PressableScale onPress={onPress} accessibilityRole="button" accessibilityLabel={accessibilityLabel} testID={testID} style={rowStyle}>
      {content}
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  row: {
    minHeight: MIN_TOUCH + 20,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: radius.row,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  iconTile: { width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  iconFill: { borderRadius: 14 },
  text: { flex: 1, minWidth: 0, gap: 2 },
  amount: { flexShrink: 0 },
});
