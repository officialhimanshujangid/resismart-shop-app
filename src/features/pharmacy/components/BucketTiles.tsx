import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from 'react-native-paper';
import { useTranslation } from 'react-i18next';

import { ColorScheme, radii } from '../../../constants/colors';
import { formatPaise } from '../../../lib/money';
import { bucketLabel, fmtQty } from '../logic';
import type { NearExpiryBucket } from '../types';

/**
 * The near-expiry buckets as tiles (Expired, Within 7 / 30 / 90 days — the
 * thresholds come from the server). Two to a row on a phone; the cost value
 * only when the server sent it (COSTS holders). Tapping a tile calls `onPress`.
 */
export function BucketTiles({
  c, buckets, onPress, testID,
}: { c: ColorScheme; buckets: NearExpiryBucket[]; onPress?: (label: string) => void; testID?: string }) {
  const { t } = useTranslation();
  if (!buckets.length) return null;
  return (
    <View style={styles.grid} testID={testID}>
      {buckets.map((b) => {
        const color = b.label === 'EXPIRED' ? c.error : b.count > 0 ? c.warning : c.textSecondary;
        return (
          <Pressable
            key={b.label}
            onPress={onPress ? () => onPress(b.label) : undefined}
            disabled={!onPress}
            accessibilityRole="button"
            accessibilityLabel={`${bucketLabel(b.label, t)}: ${b.count}`}
            style={[styles.tile, { backgroundColor: c.surface, borderColor: c.divider }]}
            testID={`bucket-${b.label}`}
          >
            <Text style={[styles.label, { color: c.textSecondary }]} numberOfLines={1}>{bucketLabel(b.label, t)}</Text>
            <Text style={[styles.value, { color }]} numberOfLines={1}>{String(b.count)}</Text>
            <Text style={[styles.sub, { color: c.textSecondary }]} numberOfLines={1}>
              {t('p2.pharmacy.bucket.qty', { qty: fmtQty(b.qty) })}
              {typeof b.valuePaise === 'number' ? ` · ${formatPaise(b.valuePaise)}` : ''}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  tile: {
    flexGrow: 1, flexBasis: '45%', minWidth: 130, minHeight: 64, borderRadius: radii.card,
    borderWidth: StyleSheet.hairlineWidth, paddingVertical: 10, paddingHorizontal: 12, gap: 2,
  },
  label: { fontSize: 12, fontWeight: '600' },
  value: { fontSize: 20, fontWeight: '700' },
  sub: { fontSize: 11.5 },
});
