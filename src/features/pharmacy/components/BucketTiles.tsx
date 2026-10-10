import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Text } from 'react-native-paper';
import { useTranslation } from 'react-i18next';

import { ColorScheme, radii } from '../../../constants/colors';
import { formatPaise } from '../../../lib/money';
import { bucketLabel, fmtQty } from '../logic';
import type { NearExpiryBucket } from '../types';
// M20 — DS v1: tiles rise in on a stagger, press like tiles (0.93), the count counts up.
import { PressableScale, Rise, useCountUp } from '../../../theme/motion';
import { useAppTheme } from '../../../theme/useAppTheme';
import { fontFamily } from '../../../theme/tokens';

function Count({ value, color }: { value: number; color: string }) {
  const shown = useCountUp(value);
  return <Text style={[styles.value, { color }]} numberOfLines={1}>{String(Math.round(shown))}</Text>;
}

/**
 * The near-expiry buckets as tiles (Expired, Within 7 / 30 / 90 days — the
 * thresholds come from the server). Two to a row on a phone; the cost value
 * only when the server sent it (COSTS holders). Tapping a tile calls `onPress`.
 */
export function BucketTiles({
  c, buckets, onPress, testID,
}: { c: ColorScheme; buckets: NearExpiryBucket[]; onPress?: (label: string) => void; testID?: string }) {
  const { t } = useTranslation();
  const { shadow } = useAppTheme();
  if (!buckets.length) return null;
  return (
    <View style={styles.grid} testID={testID}>
      {buckets.map((b, i) => {
        const color = b.label === 'EXPIRED' ? c.error : b.count > 0 ? c.warning : c.textSecondary;
        return (
          <Rise key={b.label} index={Math.min(i, 5)} style={styles.cell}>
          <PressableScale
            onPress={onPress ? () => onPress(b.label) : undefined}
            disabled={!onPress}
            scaleTo={0.93}
            accessibilityRole="button"
            accessibilityLabel={`${bucketLabel(b.label, t)}: ${b.count}`}
            style={[styles.tile, { backgroundColor: c.surface, borderColor: c.border }, shadow('card')]}
            testID={`bucket-${b.label}`}
          >
            <Text style={[styles.label, { color: c.textSecondary }]} numberOfLines={2}>{bucketLabel(b.label, t)}</Text>
            <Count value={b.count} color={color} />
            <Text style={[styles.sub, { color: c.textSecondary }]} numberOfLines={1}>
              {t('p2.pharmacy.bucket.qty', { qty: fmtQty(b.qty) })}
              {typeof b.valuePaise === 'number' ? ` · ${formatPaise(b.valuePaise)}` : ''}
            </Text>
          </PressableScale>
          </Rise>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  cell: { flexGrow: 1, flexBasis: '45%', minWidth: 130 },
  tile: {
    minHeight: 64, borderRadius: radii.card,
    borderWidth: 1, paddingVertical: 12, paddingHorizontal: 14, gap: 2,
  },
  label: { fontSize: 12, fontWeight: '600' },
  value: { fontSize: 22, fontFamily: fontFamily.sora600 },
  sub: { fontSize: 11.5 },
});
