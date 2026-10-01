import React, { useState } from 'react';
import { Pressable, StyleSheet, useColorScheme, View } from 'react-native';
import { Text } from 'react-native-paper';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';

import { radii, themeColors } from '../../../src/constants/colors';
import { usePartnerEntitlements } from '../../../src/hooks';
import { apiErrorMessage } from '../../../src/api/axios';
import { formatPaise } from '../../../src/lib/money';
import { EmptyBlock, ErrorBlock, Loading, Screen } from '../../../src/features/more/ui';
import { ActionRow, PillButton } from '../../../src/features/p1/ui';
import { Pill } from '../../../src/features/p2/ui';
import { subKeys, subscriptionsApi } from '../../../src/features/subscriptions/api';
import { lineSummary, scheduleText } from '../../../src/features/subscriptions/logic';
import type { Plan, PlanBody } from '../../../src/features/subscriptions/types';
import { PlanSheet } from '../../../src/features/subscriptions/components/PlanSheet';

/** Plans: ready-made subscriptions (1 L milk daily, lunch tiffin on weekdays, a tuition class) to start one from. */
export default function PlansScreen() {
  const { t } = useTranslation();
  const c = themeColors(useColorScheme() === 'dark');
  const { can } = usePartnerEntitlements();
  const canManage = can('SUBSCRIPTIONS_MANAGE', 'FULL');
  const qc = useQueryClient();
  const [editing, setEditing] = useState<Plan | null>(null);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const plans = useQuery({ queryKey: subKeys.plans(), queryFn: subscriptionsApi.plans });
  const save = useMutation({
    mutationFn: (body: PlanBody) => (editing ? subscriptionsApi.updatePlan(editing._id, body) : subscriptionsApi.createPlan(body)),
    onSuccess: () => { setOpen(false); void qc.invalidateQueries({ queryKey: subKeys.plans() }); },
    onError: (e) => setError(apiErrorMessage(e, t('p2.common.saveFailed'))),
  });

  const openSheet = (p: Plan | null) => { setEditing(p); setError(null); setOpen(true); };
  const list = plans.data ?? [];

  return (
    <Screen c={c} title={t('p2.subscriptions.plans.title')}>
      {canManage ? (
        <ActionRow>
          <PillButton c={c} icon="plus" label={t('p2.subscriptions.plans.add')} onPress={() => openSheet(null)} testID="plan-add" />
        </ActionRow>
      ) : null}
      {plans.isPending ? <Loading c={c} />
        : plans.isError ? <ErrorBlock c={c} message={apiErrorMessage(plans.error, t('p2.common.loadFailed'))} onRetry={() => void plans.refetch()} />
          : list.length === 0 ? <EmptyBlock c={c} icon="clipboard-list-outline" title={t('p2.subscriptions.plans.empty')} body={t('p2.subscriptions.plans.emptyBody')} />
            : list.map((p) => (
              <Pressable
                key={p._id}
                onPress={canManage ? () => openSheet(p) : undefined}
                disabled={!canManage}
                accessibilityRole={canManage ? 'button' : undefined}
                testID={`plan-${p._id}`}
                style={[styles.row, { backgroundColor: c.surface, borderColor: c.divider, opacity: p.isActive ? 1 : 0.6 }]}
              >
                <View style={styles.top}>
                  <Text style={[styles.name, { color: c.textPrimary }]} numberOfLines={1}>{p.name}</Text>
                  <Pill c={c} tone={p.isActive ? 'good' : 'neutral'} label={p.isActive ? t('p2.subscriptions.plans.on') : t('p2.subscriptions.plans.off')} />
                </View>
                <Text style={{ color: c.textSecondary, fontSize: 12 }} numberOfLines={1}>
                  {[t(`p2.subscriptions.kind.${p.kind}`), scheduleText(p.defaultSchedule, t)].filter(Boolean).join(' · ')}
                </Text>
                <Text style={{ color: c.textPrimary }} numberOfLines={2}>{lineSummary(p.lines ?? [])}</Text>
                <Text style={{ color: c.textSecondary, fontSize: 12 }} numberOfLines={1}>
                  {p.billing?.mode === 'FIXED_MONTHLY'
                    ? t('p2.subscriptions.detail.fixedFee', { amount: formatPaise(p.billing.monthlyFeePaise ?? 0) })
                    : (p.lines ?? []).map((l) => `${l.itemName} ${formatPaise(l.ratePaise)}/${l.unit}`).join(' · ')}
                </Text>
              </Pressable>
            ))}
      <PlanSheet visible={open} plan={editing} onDismiss={() => setOpen(false)} submitting={save.isPending} error={error}
        onSubmit={(body) => save.mutate(body)} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { borderRadius: radii.card, borderWidth: StyleSheet.hairlineWidth, padding: 12, gap: 4, minHeight: 64 },
  top: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  name: { flex: 1, minWidth: 0, fontSize: 15, fontWeight: '700' },
});
