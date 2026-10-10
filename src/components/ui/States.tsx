import React from 'react';
import { StyleSheet, Text, View, type DimensionValue, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';

import { radius, typeScale } from '../../theme/tokens';
import { useAppTheme } from '../../theme/useAppTheme';
import { useAmbientLoop } from '../../theme/motion';
import { Button } from './Button';

/**
 * Empty state: art (an illustration) or an icon in a soft circle, a title, an
 * optional line, and at most ONE action. Text is centred and wraps.
 */
export function EmptyState({
  title,
  body,
  icon = 'inbox-outline',
  art,
  actionLabel,
  actionIcon,
  onAction,
  testID,
  style,
}: {
  title: string;
  body?: string;
  icon?: string;
  /** An illustration; replaces the icon circle. */
  art?: React.ReactNode;
  actionLabel?: string;
  actionIcon?: string;
  onAction?: () => void;
  testID?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const { ds } = useAppTheme();
  return (
    <View testID={testID} style={[styles.block, style]}>
      {art ?? (
        <View style={[styles.iconCircle, { backgroundColor: ds.primarySoft }]}>
          <MaterialCommunityIcons name={icon as never} size={30} color={ds.primary} />
        </View>
      )}
      <Text style={[typeScale.section, styles.center, { color: ds.ink }]}>{title}</Text>
      {body ? <Text style={[typeScale.detail, styles.center, { color: ds.muted }]}>{body}</Text> : null}
      {actionLabel && onAction ? (
        <Button label={actionLabel} icon={actionIcon} onPress={onAction} style={styles.action} />
      ) : null}
    </View>
  );
}

/**
 * Error state: what went wrong (the server's own translated text when there is
 * one — never a generic line over a specific one) and a "Try again" button.
 */
export function ErrorState({
  message,
  title,
  onRetry,
  testID,
  style,
}: {
  message?: string;
  title?: string;
  onRetry?: () => void;
  testID?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const { t } = useTranslation();
  const { status, ds } = useAppTheme();
  return (
    <View testID={testID} style={[styles.block, style]} accessibilityRole="alert">
      <View style={[styles.iconCircle, { backgroundColor: status.danger.bg }]}>
        <MaterialCommunityIcons name="alert-circle-outline" size={30} color={status.danger.fg} />
      </View>
      <Text style={[typeScale.section, styles.center, { color: ds.ink }]}>{title ?? t('kit.errorTitle')}</Text>
      {message ? <Text style={[typeScale.detail, styles.center, { color: ds.muted }]}>{message}</Text> : null}
      {onRetry ? (
        <Button label={t('common.tryAgain')} icon="refresh" variant="soft" onPress={onRetry} style={styles.action} />
      ) : null}
    </View>
  );
}

/** One shimmering block. Pulses 0.55 ↔ 1; static under reduce-motion. */
export function Skeleton({
  width = '100%',
  height = 16,
  rounded = radius.sm,
  style,
}: {
  width?: DimensionValue;
  height?: number;
  rounded?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const { ds } = useAppTheme();
  const v = useAmbientLoop(800);
  const pulse = useAnimatedStyle(() => ({ opacity: 1 - 0.45 * v.value }));
  return (
    <Animated.View
      style={[{ width, height, borderRadius: rounded, backgroundColor: ds.skeleton }, pulse, style]}
    />
  );
}

/** A loading list: `rows` row-shaped skeletons (icon tile + two lines). */
export function SkeletonList({ rows = 4, testID }: { rows?: number; testID?: string }) {
  const { t } = useTranslation();
  const { ds } = useAppTheme();
  return (
    <View testID={testID} style={styles.list} accessible accessibilityLabel={t('common.loading')} accessibilityRole="progressbar">
      {Array.from({ length: rows }, (_, i) => (
        <View key={i} style={[styles.skRow, { backgroundColor: ds.surface, borderWidth: 1, borderColor: ds.line }]}>
          <Skeleton width={42} height={42} rounded={14} />
          <View style={styles.skText}>
            <Skeleton width="70%" height={14} />
            <Skeleton width="45%" height={12} />
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  block: { alignItems: 'center', justifyContent: 'center', gap: 10, paddingVertical: 36, paddingHorizontal: 24 },
  iconCircle: { width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center', marginBottom: 2 },
  center: { textAlign: 'center' },
  action: { alignSelf: 'center', marginTop: 6 },
  list: { gap: 10 },
  skRow: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: radius.row, padding: 14 },
  skText: { flex: 1, gap: 8 },
});
