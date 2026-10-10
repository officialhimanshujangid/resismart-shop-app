import React from 'react';
import { StyleSheet, View } from 'react-native';
import { PressableScale } from '../../../theme/motion'; // M22 — press feedback
import { Text } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';

import { ColorScheme, radii } from '../../../constants/colors';
import { formatPaise } from '../../../lib/money';
import { Pill } from '../../p2/ui';
import { dayTimeLabel } from '../../p2/dates';
import { gateIcon, stageTone } from '../logic';
import type { JobRow } from '../types';

/** One job in the list: code + stage, customer (+ flat), service, last quote, next visit, gate. */
export function JobRowItem({ c, row, onPress }: { c: ColorScheme; row: JobRow; onPress: () => void }) {
  const { t } = useTranslation();
  const gate = gateIcon(row.gateStatus);
  const gateColor = gate.tone === 'good' ? c.success : gate.tone === 'bad' ? c.error : gate.tone === 'warn' ? c.warning : c.textDisabled;
  return (
    <PressableScale
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${row.code} ${row.serviceName}`}
      style={[styles.card, { backgroundColor: c.surface, borderColor: c.divider }]}
      testID={`job-row-${row.id}`}
    >
      <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
        <View style={styles.top}>
          <Text style={[styles.code, { color: c.textPrimary }]} numberOfLines={1}>{row.code}</Text>
          <Pill c={c} label={t(`p2.jobs.stage.${row.stage}`)} tone={stageTone(row.stage)} />
        </View>
        <Text style={{ color: c.textPrimary, fontWeight: '600' }} numberOfLines={1}>
          {[row.customerName, row.flatLabel].filter(Boolean).join(' · ')}
        </Text>
        <Text style={{ color: c.textSecondary, fontSize: 12.5 }} numberOfLines={1}>{row.serviceName}</Text>
        {row.lastQuote ? (
          <Text style={{ color: c.textSecondary, fontSize: 12 }} numberOfLines={1}>
            {`${row.lastQuote.number} · ${formatPaise(row.lastQuote.totalPaise)} · ${t(`p2.jobs.quoteStatus.${row.lastQuote.status}`)}`}
          </Text>
        ) : null}
        {row.nextVisit ? (
          <Text style={{ color: c.textSecondary, fontSize: 12 }} numberOfLines={1}>
            {t('p2.jobs.list.nextVisit', { when: dayTimeLabel(row.nextVisit.slotStart, t) })}
          </Text>
        ) : null}
      </View>
      <View style={styles.gate} accessibilityLabel={t(`p2.jobs.gateShort.${row.gateStatus in GATE_SHORT ? row.gateStatus : 'NONE'}`)}>
        <MaterialCommunityIcons name={gate.icon as never} size={22} color={gateColor} />
      </View>
    </PressableScale>
  );
}

const GATE_SHORT: Record<string, true> = { NONE: true, ACTIVE: true, NOT_AVAILABLE: true, REVOKED: true, USED: true, FAILED: true };

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, borderRadius: radii.card,
    borderWidth: StyleSheet.hairlineWidth, minHeight: 64,
  },
  top: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  code: { fontWeight: '700', fontSize: 14, flexShrink: 1 },
  gate: { width: 32, alignItems: 'center' },
});
