import React, { useRef, useState } from 'react';
import * as Haptics from 'expo-haptics';
import Animated from 'react-native-reanimated';
import { useToast } from '../../../src/components/ui'; // M22
import { useShake } from '../../../src/components/ui/Feedback'; // M22
import { StyleSheet, useColorScheme, View } from 'react-native';
import { router, type Href } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';

import { themeColors } from '../../../src/constants/colors';
import { usePartnerEntitlements } from '../../../src/hooks';
import { apiErrorMessage } from '../../../src/api/axios';
import { newIdempotencyKey } from '../../../src/lib/idempotency';
import { AppInput } from '../../../src/components/AppInput';
import { DateField } from '../../../src/components/DateField';
import { Banner, PillButton } from '../../../src/features/p1/ui';
import { Screen, SectionLabel } from '../../../src/features/more/ui';
import { ChoiceChips, PartyPicker, PickedParty } from '../../../src/features/p2/ui';
import { istToday } from '../../../src/features/p2/dates';
import { subKeys, subscriptionsApi } from '../../../src/features/subscriptions/api';
import {
  NewSubscriptionDraft, buildCreateBody, emptyLine, prefillFromPlan,
} from '../../../src/features/subscriptions/logic';
import { SUBSCRIPTION_KINDS, SubscriptionKind } from '../../../src/features/subscriptions/types';
import { LinesEditor } from '../../../src/features/subscriptions/components/LinesEditor';
import { ScheduleEditor } from '../../../src/features/subscriptions/components/ScheduleEditor';
import { BillingEditor } from '../../../src/features/subscriptions/components/BillingEditor';

/**
 * New subscription (SUBSCRIPTIONS_MANAGE): the customer, optionally a plan (it
 * fills in the rest), the lines, the days, how it is billed, the first day and
 * the route. Save once — the idempotency key is minted on the first tap and
 * reused on a retry, so a dropped connection never makes two subscriptions.
 */
export default function NewSubscriptionScreen() {
  const { t } = useTranslation();
  const c = themeColors(useColorScheme() === 'dark');
  const { can } = usePartnerEntitlements();
  const canManage = can('SUBSCRIPTIONS_MANAGE', 'FULL');
  const qc = useQueryClient();
  const [party, setParty] = useState<PickedParty | null>(null);
  const [draft, setDraft] = useState<NewSubscriptionDraft>(() => ({
    partyId: null, planId: null, kind: 'DAIRY', title: '', lines: [emptyLine([])],
    schedule: { pattern: 'DAILY', weekdays: [] }, billing: { mode: 'PER_DELIVERY', fee: '' },
    startDate: istToday(), routeId: null, routeSeq: '', notes: '',
  }));
  const [problem, setProblem] = useState<string | null>(null);
  const keyRef = useRef<string | null>(null);
  const set = (patch: Partial<NewSubscriptionDraft>) => setDraft((d) => ({ ...d, ...patch }));

  const plans = useQuery({ queryKey: subKeys.plans(), queryFn: subscriptionsApi.plans });
  const routes = useQuery({ queryKey: subKeys.routes(), queryFn: subscriptionsApi.routes });
  const activePlans = (plans.data ?? []).filter((p) => p.isActive);
  const routeKind = draft.kind === 'TUITION' ? 'BATCH' : 'ROUTE';
  const routeOptions = (routes.data ?? []).filter((r) => r.kind === routeKind && r.isActive);

  const create = useMutation({
    mutationFn: () => {
      const planLines = activePlans.find((p) => p._id === draft.planId)?.lines ?? [];
      const built = buildCreateBody({ ...draft, partyId: party?.id ?? null }, planLines);
      if (built.problem !== null) throw new Error(t(`p2.subscriptions.new.problem.${built.problem}`));
      if (!keyRef.current) keyRef.current = newIdempotencyKey('subscription');
      return subscriptionsApi.create(built.body, keyRef.current);
    },
    onSuccess: (sub) => {
      keyRef.current = null;
      void qc.invalidateQueries({ queryKey: subKeys.all() });
      // M22 — say it worked and buzz once, then open the new subscription.
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
      toast.show({ tone: 'success', message: t('p2.subscriptions.new.created') });
      if (sub?._id) router.replace(`/subscriptions/${sub._id}` as Href);
      else router.back();
    },
    onError: (e) => { setProblem(apiErrorMessage(e, t('p2.common.saveFailed'))); shake(); },
  });
  const toast = useToast();
  const { style: shakeStyle, shake } = useShake();

  const pickPlan = (id: string) => {
    if (!id) { set({ planId: null }); return; }
    const p = activePlans.find((x) => x._id === id);
    if (!p) return;
    const pre = prefillFromPlan(p);
    set({ planId: id, kind: pre.kind, title: draft.title.trim() ? draft.title : pre.title, lines: pre.lines, schedule: pre.schedule, billing: pre.billing });
  };

  const save = () => { setProblem(null); create.mutate(); };

  return (
    <Screen c={c} rise title={t('p2.subscriptions.new.title')}>
      {!canManage ? <Banner c={c} body={t('p2.common.viewOnly')} /> : null}
      <SectionLabel c={c}>{t('p2.common.customer')}</SectionLabel>
      <PartyPicker c={c} value={party} onChange={setParty} testID="new-party" />

      {activePlans.length > 0 ? (
        <>
          <SectionLabel c={c}>{t('p2.subscriptions.new.plan')}</SectionLabel>
          <ChoiceChips
            c={c}
            testID="new-plan"
            options={[{ key: '', label: t('p2.subscriptions.new.noPlan') }, ...activePlans.map((p) => ({ key: p._id, label: p.name }))]}
            value={[draft.planId ?? '']}
            onChange={(v) => pickPlan(v[0] ?? '')}
          />
        </>
      ) : null}

      <SectionLabel c={c}>{t('p2.subscriptions.new.what')}</SectionLabel>
      <ChoiceChips<SubscriptionKind>
        c={c}
        testID="new-kind"
        options={SUBSCRIPTION_KINDS.map((k) => ({ key: k, label: t(`p2.subscriptions.kind.${k}`) }))}
        value={[draft.kind]}
        onChange={(v) => set({ kind: v[0] ?? 'DAIRY', routeId: null })}
      />
      <AppInput label={t('p2.subscriptions.new.titleLabel')} value={draft.title} onChangeText={(v) => set({ title: v })}
        placeholder={t('p2.subscriptions.new.titlePlaceholder')} />
      <LinesEditor c={c} lines={draft.lines} onChange={(lines) => set({ lines })} />

      <SectionLabel c={c}>{t('p2.subscriptions.new.days')}</SectionLabel>
      <ScheduleEditor c={c} value={draft.schedule} onChange={(schedule) => set({ schedule })} />

      <SectionLabel c={c}>{t('p2.subscriptions.new.billing')}</SectionLabel>
      <BillingEditor c={c} value={draft.billing} onChange={(billing) => set({ billing })} />

      <SectionLabel c={c}>{t('p2.subscriptions.new.start')}</SectionLabel>
      <DateField label={t('p2.subscriptions.new.startDate')} value={draft.startDate} onChangeText={(v) => set({ startDate: v })} />

      {routeOptions.length > 0 ? (
        <>
          <SectionLabel c={c}>{t(routeKind === 'BATCH' ? 'p2.subscriptions.new.class' : 'p2.subscriptions.new.route')}</SectionLabel>
          <ChoiceChips
            c={c}
            testID="new-route"
            options={[{ key: '', label: t('p2.subscriptions.new.noRoute') }, ...routeOptions.map((r) => ({ key: r._id, label: r.name }))]}
            value={[draft.routeId ?? '']}
            onChange={(v) => set({ routeId: v[0] || null })}
          />
          {draft.routeId && routeKind === 'ROUTE' ? (
            <AppInput label={t('p2.subscriptions.new.routeSeq')} value={draft.routeSeq} keyboardType="numeric"
              onChangeText={(v) => set({ routeSeq: v.replace(/[^0-9]/g, '') })} />
          ) : null}
        </>
      ) : null}

      <AppInput label={t('p2.common.notes')} value={draft.notes} onChangeText={(v) => set({ notes: v })} multiline />

      {problem ? <Animated.View style={shakeStyle}><Banner c={c} tone="error" body={problem} testID="new-problem" /></Animated.View> : null}
      <View style={styles.foot}>
        <PillButton c={c} icon="content-save" label={create.isPending ? t('common.saving') : t('p2.subscriptions.new.save')}
          onPress={save} disabled={!canManage || create.isPending} testID="new-save" />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  foot: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: 4 },
});
