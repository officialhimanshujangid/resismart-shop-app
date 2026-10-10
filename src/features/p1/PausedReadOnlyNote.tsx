import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import Animated, { FadeIn } from 'react-native-reanimated';
import { useTranslation } from 'react-i18next';

import { usePartnerEntitlements } from '../../hooks';
import { useAppTheme } from '../../theme/useAppTheme';
import { radius, typeScale } from '../../theme/tokens';
import { useMotionOK } from '../../theme/motion';

/** P9A (Owner Q10): is this business paused (SUSPENDED) by ResiSmart? */
export function useIsPaused(): boolean {
  const { entitlements } = usePartnerEntitlements();
  return entitlements.business?.status === 'SUSPENDED';
}

/**
 * P9A (Owner 2026-10-10, Phase 9 Q10): a paused business may READ its invoice
 * and business settings, never change them (the server refuses every save with
 * 403 PARTNER_SUSPENDED + the reason). This line says why the fields are locked.
 * Draws nothing for a business that is not paused. Twin of the web note.
 */
export function PausedReadOnlyNote() {
  const { t } = useTranslation();
  const paused = useIsPaused();
  const { status } = useAppTheme();
  const ok = useMotionOK();
  if (!paused) return null;
  return (
    <Animated.View entering={ok ? FadeIn.duration(200) : undefined}>
      <View
        style={[styles.note, { backgroundColor: status.warn.bg, borderColor: status.warn.fg }]}
        accessibilityRole="text"
        testID="paused-read-only-note"
      >
        <MaterialCommunityIcons name="pause-circle-outline" size={18} color={status.warn.fg} />
        <Text style={[typeScale.detail, styles.flex, { color: status.warn.fg }]}>{t('settings.pausedReadOnly')}</Text>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  note: {
    flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12,
    borderRadius: radius.md, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: 12, paddingVertical: 10,
  },
  flex: { flex: 1, flexWrap: 'wrap' },
});
