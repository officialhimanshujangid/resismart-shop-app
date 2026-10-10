import React from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import Animated, { FadeIn } from 'react-native-reanimated';
import { useTranslation } from 'react-i18next';

import { usePartnerEntitlements } from '../../hooks';
import { useAppTheme } from '../../theme/useAppTheme';
import { radius, typeScale } from '../../theme/tokens';
import { useMotionOK } from '../../theme/motion';

/**
 * P9A (Owner 2026-10-10, Phase 9 Q6): a role set to "Only my assigned jobs".
 * The server lists only the bookings and jobs given to this person; this line
 * says so, so a short list never reads as missing work. Draws nothing for
 * everybody else. Twin of the web note on Bookings and Jobs.
 */
export function OnlyMyJobsNote({ style }: { style?: StyleProp<ViewStyle> }) {
  const { t } = useTranslation();
  const { entitlements } = usePartnerEntitlements();
  const { status } = useAppTheme();
  const ok = useMotionOK();
  if (entitlements.jobScope !== 'ASSIGNED' || entitlements.isAdmin) return null;
  return (
    <Animated.View entering={ok ? FadeIn.duration(200) : undefined} style={style}>
      <View
        style={[styles.note, { backgroundColor: status.success.bg, borderColor: status.success.fg }]}
        accessibilityRole="text"
        testID="only-my-jobs-note"
      >
        <MaterialCommunityIcons name="account-hard-hat-outline" size={18} color={status.success.fg} />
        <Text style={[typeScale.detail, styles.flex, { color: status.success.fg }]}>{t('staff.jobScope.youOnly')}</Text>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  note: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    borderRadius: radius.md, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: 12, paddingVertical: 10,
  },
  flex: { flex: 1, flexWrap: 'wrap' },
});
