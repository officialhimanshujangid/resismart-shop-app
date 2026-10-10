import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Text } from 'react-native-paper';
import { useTranslation } from 'react-i18next';

import { ColorScheme, radii } from '../../../constants/colors';
import { formatPaise } from '../../../lib/money';
import { Pill } from '../../p2/ui';
import { batchStatusTone, daysLabel, expiryLabel, fmtQty } from '../logic';
import type { BatchRow } from '../types';
// M20 — DS v1: card edge + soft shadow, press scale (none under reduce-motion).
import { PressableScale } from '../../../theme/motion';
import { useAppTheme } from '../../../theme/useAppTheme';

/**
 * One batch as a list row: medicine name, batch no · expiry · qty, the status
 * pill and the days to expiry. Every text line is `flex:1, minWidth:0` with
 * `numberOfLines`, so a long medicine name never runs off a 320dp phone.
 * `action` (a Write off pill) sits UNDER the text, never beside it.
 */
export function BatchRowItem({
  c, row, onPress, action, hideProduct, testID,
}: {
  c: ColorScheme;
  row: BatchRow;
  onPress?: () => void;
  action?: React.ReactNode;
  hideProduct?: boolean;
  testID?: string;
}) {
  const { t } = useTranslation();
  const tone = batchStatusTone(row.status);
  const { shadow } = useAppTheme();
  const dayColor = row.status === 'EXPIRED' ? c.error : row.status === 'NEAR_EXPIRY' ? c.warning : c.textSecondary;
  const body = (
    <View style={[styles.row, { backgroundColor: c.surface, borderColor: c.border }, shadow('card')]} testID={testID}>
      <View style={styles.top}>
        <View style={styles.text}>
          {!hideProduct ? (
            <Text style={[styles.name, { color: c.textPrimary }]} numberOfLines={2}>{row.productName}</Text>
          ) : null}
          <Text style={[styles.meta, { color: c.textSecondary }]} numberOfLines={2}>
            {[
              t('p2.pharmacy.row.batch', { batchNo: row.batchNo }),
              t('p2.pharmacy.row.expiry', { expiry: expiryLabel(row.expiryDate) }),
              t('p2.pharmacy.row.qty', { qty: fmtQty(row.qtyOnHand) }),
              typeof row.mrpPaise === 'number' ? t('p2.pharmacy.row.mrp', { mrp: formatPaise(row.mrpPaise) }) : null,
            ].filter(Boolean).join(' · ')}
          </Text>
          <Text style={[styles.days, { color: dayColor }]} numberOfLines={1}>{daysLabel(row.daysToExpiry, t)}</Text>
        </View>
        <Pill c={c} label={t(`p2.pharmacy.status.${row.status}`)} tone={tone} />
      </View>
      {action ? <View style={styles.action}>{action}</View> : null}
    </View>
  );
  if (!onPress) return body;
  return (
    <PressableScale
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${row.productName} ${t('p2.pharmacy.row.batch', { batchNo: row.batchNo })}`}
    >
      {body}
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  row: { borderRadius: radii.card, borderWidth: 1, padding: 14, gap: 8, minHeight: 64 },
  top: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  text: { flex: 1, minWidth: 0, gap: 2 },
  name: { fontSize: 15, fontWeight: '600' },
  meta: { fontSize: 12.5 },
  days: { fontSize: 12.5, fontWeight: '600' },
  action: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
});
