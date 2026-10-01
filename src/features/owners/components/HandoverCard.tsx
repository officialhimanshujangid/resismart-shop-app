import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Text } from 'react-native-paper';
import { useTranslation } from 'react-i18next';

import { ColorScheme, radii } from '../../../constants/colors';
import { formatI18nDate } from '../../../i18n';
import type { InviteView } from '../types';

/**
 * One completed handover with its cut-over record: when it happened, the GSTIN
 * on bills at that moment and the last number issued per series — what an
 * accountant needs to split the books at the handover line.
 */
export function HandoverCard({ c, invite }: { c: ColorScheme; invite: InviteView }) {
  const { t } = useTranslation();
  const cut = invite.cutover;
  return (
    <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.divider }]}>
      <Text style={[styles.title, { color: c.textPrimary }]} numberOfLines={2}>
        {t('owners.history.to', { name: invite.toName })}
      </Text>
      <Text style={[styles.meta, { color: c.textSecondary }]}>
        {t('owners.history.on', { date: formatI18nDate(cut?.at ?? invite.acceptedAt, t) })}
        {invite.revokedCount > 0 ? ` · ${t('owners.history.revoked', { count: invite.revokedCount })}` : ''}
      </Text>
      {cut ? (
        <View style={styles.cut}>
          <Text style={[styles.label, { color: c.textSecondary }]}>{t('owners.history.gstin')}</Text>
          <Text style={[styles.value, { color: c.textPrimary }]}>{cut.gstinAtCutover || t('owners.history.noGstin')}</Text>
          {cut.lastNumbers.length > 0 ? (
            <>
              <Text style={[styles.label, { color: c.textSecondary, marginTop: 6 }]}>{t('owners.history.lastNumbers')}</Text>
              {cut.lastNumbers.map((n, i) => (
                <View key={`${n.series}-${n.financialYear ?? ''}-${i}`} style={styles.numberRow}>
                  <Text style={[styles.series, { color: c.textSecondary }]} numberOfLines={1}>
                    {n.series}{n.financialYear ? ` · ${n.financialYear}` : ''}
                  </Text>
                  <Text style={[styles.number, { color: c.textPrimary }]} numberOfLines={1}>
                    {n.number ?? (typeof n.seq === 'number' ? String(n.seq) : '—')}
                  </Text>
                </View>
              ))}
            </>
          ) : null}
          {cut.note ? <Text style={[styles.meta, { color: c.textSecondary, marginTop: 6 }]}>{cut.note}</Text> : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: radii.md, borderWidth: StyleSheet.hairlineWidth, padding: 12, gap: 3 },
  title: { fontSize: 14.5, fontWeight: '600' },
  meta: { fontSize: 12 },
  cut: { marginTop: 8, gap: 2 },
  label: { fontSize: 11.5, fontWeight: '600', letterSpacing: 0.2 },
  value: { fontSize: 13 },
  numberRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  series: { fontSize: 12.5, flexShrink: 1 },
  number: { fontSize: 12.5, fontWeight: '600', fontVariant: ['tabular-nums'], flexShrink: 0, maxWidth: '55%' },
});
