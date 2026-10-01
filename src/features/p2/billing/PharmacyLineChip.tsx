import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';

import { ColorScheme, radii } from '../../../constants/colors';
import type { DrugInfo } from './usePharmacyBilling';

/**
 * Under a medicine's line on the bill: which batch it is sold from (tap to
 * change — the default is the earliest expiry) and its schedule. Wraps on a
 * 320dp phone; the chip is a 44dp target.
 */
export function PharmacyLineChip({
  c, info, batchLabel, onPickBatch, testID,
}: { c: ColorScheme; info: DrugInfo | undefined; batchLabel?: string; onPickBatch: () => void; testID?: string }) {
  const { t } = useTranslation();
  if (!info) return null;
  const x = info.schedule === 'X';
  return (
    <View style={styles.row}>
      {info.batchTracking && !x ? (
        <Pressable
          onPress={onPickBatch}
          hitSlop={6}
          accessibilityRole="button"
          accessibilityLabel={t('p2.billing.pickBatch')}
          style={[styles.chip, { borderColor: c.primary }]}
          testID={testID}
        >
          <MaterialCommunityIcons name="package-variant" size={14} color={c.primary} />
          <Text style={[styles.chipText, { color: c.primary }]} numberOfLines={1}>
            {batchLabel ? t('p2.billing.batchChosen', { batch: batchLabel }) : t('p2.billing.batchAuto')}
          </Text>
        </Pressable>
      ) : null}
      {info.schedule ? (
        <View style={[styles.badge, { backgroundColor: `${x ? c.error : c.warning}1A` }]}>
          <Text style={[styles.badgeText, { color: x ? c.error : c.warning }]} numberOfLines={1}>
            {x ? t('p2.billing.scheduleX') : t('p2.billing.scheduleRx', { schedule: info.schedule })}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4 },
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 32, paddingHorizontal: 10,
    borderRadius: radii.pill, borderWidth: 1, maxWidth: '100%',
  },
  chipText: { fontSize: 11.5, fontWeight: '600', flexShrink: 1 },
  badge: { minHeight: 24, paddingHorizontal: 8, borderRadius: radii.pill, justifyContent: 'center' },
  badgeText: { fontSize: 11, fontWeight: '700' },
});
