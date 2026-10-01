import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Text } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';

import { ColorScheme, radii } from '../../../constants/colors';
import { PillButton } from '../../p1/ui';
import { dayTimeLabel, istDayOf, istTimeOf } from '../../p2/dates';
import { gateText } from '../logic';
import type { JobGateView } from '../types';

/**
 * The gate pre-approval (S-priority). While the pass is ACTIVE the six digits
 * are drawn BIG and selectable — the technician reads them to the guard — with
 * the window and the name on the pass. Every other state is one sentence (plus
 * the server's reason). "Refresh gate pass" asks the server to re-sync it.
 */
export function GateCard({
  c, gate, canRefresh, refreshing, onRefresh, message,
}: {
  c: ColorScheme; gate: JobGateView; canRefresh: boolean; refreshing: boolean; onRefresh: () => void; message?: string | null;
}) {
  const { t } = useTranslation();
  const view = gateText(gate);
  const windowText = gate.validFrom && gate.validTo
    ? t('p2.jobs.gate.window', {
      from: dayTimeLabel(gate.validFrom, t),
      to: istDayOf(gate.validFrom) === istDayOf(gate.validTo) ? istTimeOf(gate.validTo) : dayTimeLabel(gate.validTo, t),
    })
    : null;

  return (
    <View style={[styles.card, { backgroundColor: c.surface, borderColor: view.showCode ? c.success : c.divider }]} testID="job-gate-card">
      <View style={styles.head}>
        <MaterialCommunityIcons name={view.showCode ? 'shield-check' : 'shield-outline'} size={20} color={view.showCode ? c.success : c.textSecondary} />
        <Text style={[styles.title, { color: c.textPrimary }]} numberOfLines={1}>{t('p2.jobs.gate.title')}</Text>
      </View>

      {view.showCode && gate.code ? (
        <>
          <Text
            selectable
            style={[styles.code, { color: c.textPrimary }]}
            accessibilityLabel={t('p2.jobs.gate.codeLabel', { code: gate.code.split('').join(' ') })}
            testID="job-gate-code"
          >
            {gate.code}
          </Text>
          {windowText ? <Text style={{ color: c.textSecondary }}>{windowText}</Text> : null}
          {gate.visitorName ? (
            <Text style={{ color: c.textSecondary }} numberOfLines={1}>{t('p2.jobs.gate.visitor', { name: gate.visitorName })}</Text>
          ) : null}
        </>
      ) : null}

      <Text style={{ color: view.showCode ? c.textSecondary : c.textPrimary, fontSize: view.showCode ? 12 : 14 }} testID="job-gate-text">
        {t(`p2.jobs.gate.${view.key}`)}
      </Text>
      {view.reason ? (
        <Text style={{ color: c.textSecondary, fontSize: 12 }} testID="job-gate-reason">{t('p2.jobs.gate.reason', { reason: view.reason })}</Text>
      ) : null}
      {!view.showCode && windowText && (gate.status === 'USED' || gate.status === 'REVOKED') ? (
        <Text style={{ color: c.textSecondary, fontSize: 12 }}>{windowText}</Text>
      ) : null}
      {message ? <Text style={{ color: c.error, fontSize: 12 }}>{message}</Text> : null}

      {canRefresh && view.refreshable ? (
        <View style={styles.actions}>
          <PillButton
            c={c}
            tone="outline"
            icon="refresh"
            label={refreshing ? t('p2.jobs.gate.refreshing') : t('p2.jobs.actions.refreshGate')}
            onPress={onRefresh}
            disabled={refreshing}
            testID="job-gate-refresh"
          />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: radii.card, borderWidth: 1, padding: 14, gap: 6 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { fontWeight: '700', fontSize: 14, flex: 1, minWidth: 0 },
  code: { fontSize: 38, fontWeight: '800', letterSpacing: 8, fontVariant: ['tabular-nums'], marginVertical: 4 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
});
