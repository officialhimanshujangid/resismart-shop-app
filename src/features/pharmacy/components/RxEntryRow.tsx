import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Text } from 'react-native-paper';
import { useTranslation } from 'react-i18next';

import { ColorScheme, radii } from '../../../constants/colors';
import { shortDay } from '../../p2/dates';
import { Pill } from '../../p2/ui';
import { istDayOfIso } from '../logic';
import type { RxRegisterRow } from '../types';
// M20 — DS v1: card edge + soft shadow, press scale; a cancelled entry keeps full contrast (its pill says so).
import { PressableScale } from '../../../theme/motion';
import { useAppTheme } from '../../../theme/useAppTheme';

/** One register entry: number · sale day, patient (masked phone), prescriber, medicines count, CANCELLED pill. */
export function RxEntryRow({ c, row, onPress }: { c: ColorScheme; row: RxRegisterRow; onPress: () => void }) {
  const { t } = useTranslation();
  const cancelled = row.status === 'CANCELLED';
  const { shadow } = useAppTheme();
  return (
    <PressableScale onPress={onPress} accessibilityRole="button" accessibilityLabel={row.number} testID={`rx-${row.id}`}>
      <View style={[styles.row, { backgroundColor: c.surface, borderColor: c.border }, shadow('card')]}>
        <View style={styles.top}>
          <Text style={[styles.number, { color: c.textPrimary }]} numberOfLines={1}>{row.number}</Text>
          <Text style={{ color: c.textSecondary, fontSize: 12 }} numberOfLines={1}>{shortDay(istDayOfIso(row.saleDate), t)}</Text>
        </View>
        <Text style={{ color: c.textPrimary }} numberOfLines={1}>
          {row.patient?.name}{row.patient?.phoneMasked ? ` · ${row.patient.phoneMasked}` : ''}
        </Text>
        <Text style={{ color: c.textSecondary, fontSize: 12.5 }} numberOfLines={1}>
          {t('p2.pharmacy.register.prescriber', { name: row.prescriber?.name ?? '' })}
          {row.rxNo ? ` · ${t('p2.pharmacy.register.rxNo', { rxNo: row.rxNo })}` : ''}
        </Text>
        <View style={styles.bottom}>
          <Text style={{ flex: 1, minWidth: 0, color: c.textSecondary, fontSize: 12.5 }} numberOfLines={1}>
            {t('p2.pharmacy.register.items', { count: row.items?.length ?? 0 })}
          </Text>
          {cancelled ? <Pill c={c} label={t('p2.pharmacy.register.status.CANCELLED')} tone="bad" /> : null}
        </View>
      </View>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  row: { borderRadius: radii.card, borderWidth: 1, padding: 14, gap: 3, minHeight: 64 },
  top: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  number: { flex: 1, minWidth: 0, fontSize: 15, fontWeight: '700' },
  bottom: { flexDirection: 'row', alignItems: 'center', gap: 8 },
});
