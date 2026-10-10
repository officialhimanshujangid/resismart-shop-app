import React, { useState } from 'react';
import { useColorScheme, View } from 'react-native';
import { Snackbar } from 'react-native-paper';
import { router, useLocalSearchParams, type Href } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';

import { themeColors } from '../../../src/constants/colors';
import { usePartnerEntitlements } from '../../../src/hooks';
import { apiErrorMessage } from '../../../src/api/axios';
import { ErrorBlock, Loading, Screen, SectionLabel } from '../../../src/features/more/ui';
import { ActionRow, Banner, PillButton, TwoPane } from '../../../src/features/p1/ui';
import { ReasonDialog } from '../../../src/features/p1/ReasonDialog';
import { jobKeys, jobsApi } from '../../../src/features/jobs/api';
import { jobActions } from '../../../src/features/jobs/logic';
import type { JobDetail } from '../../../src/features/jobs/types';
import { GateCard } from '../../../src/features/jobs/components/GateCard';
import { InvoiceCard, JobHeaderCard, QuotesCard, VisitsCard } from '../../../src/features/jobs/components/JobCards';
import { AddVisitSheet } from '../../../src/features/jobs/components/AddVisitSheet';
import { RaiseBillSheet } from '../../../src/features/jobs/components/RaiseBillSheet';
import { JobStageTrack } from '../../../src/features/jobs/components/JobStageTrack'; // M22

/**
 * One job: who and what, the GATE (the code big while the pass is live), the
 * quotes, the visits, the bill — and only the buttons this stage and this
 * person allow (Send quote · Add visit · Raise the bill · Close job).
 */
export default function JobDetailScreen() {
  const { t } = useTranslation();
  const c = themeColors(useColorScheme() === 'dark');
  const qc = useQueryClient();
  const { id } = useLocalSearchParams<{ id: string }>();
  const jobId = String(id ?? '');
  const { can } = usePartnerEntitlements();

  const q = useQuery({ queryKey: jobKeys.detail(jobId), queryFn: () => jobsApi.get(jobId), enabled: !!jobId });
  const [sheet, setSheet] = useState<'visit' | 'bill' | 'close' | null>(null);
  const [closing, setClosing] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [gateMsg, setGateMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const refresh = () => qc.invalidateQueries({ queryKey: jobKeys.all() });

  if (q.isPending) return <Screen title={t('p2.jobs.detail.title')} c={c}><Loading c={c} skeleton={5} /></Screen>;
  if (q.isError || !q.data) {
    return (
      <Screen title={t('p2.jobs.detail.title')} c={c}>
        <ErrorBlock c={c} message={apiErrorMessage(q.error, t('p2.common.loadFailed'))} onRetry={() => q.refetch()} />
      </Screen>
    );
  }

  const d: JobDetail = q.data;
  const acts = jobActions(d.job.stage, can);

  const refreshGate = async () => {
    setRefreshing(true);
    setGateMsg(null);
    try {
      const gate = await jobsApi.refreshGate(jobId);
      qc.setQueryData<JobDetail>(jobKeys.detail(jobId), (old) => (old ? { ...old, gate } : old));
    } catch (e) {
      setGateMsg(apiErrorMessage(e, t('p2.jobs.gate.refreshFailed')));
    } finally {
      setRefreshing(false);
    }
  };

  const close = async (reason: string) => {
    setClosing(true);
    setError(null);
    try {
      await jobsApi.close(jobId, reason);
      setSheet(null);
      setToast(t('p2.jobs.detail.closedToast'));
      await refresh();
    } catch (e) {
      setSheet(null);
      setError(apiErrorMessage(e, t('p2.jobs.detail.closeFailed')));
    } finally {
      setClosing(false);
    }
  };

  const actions = (acts.sendQuote || acts.addVisit || acts.raiseBill || acts.close) ? (
    <ActionRow>
      {acts.sendQuote ? (
        <PillButton
          c={c}
          icon="file-document-edit-outline"
          label={t('p2.jobs.actions.sendQuote')}
          onPress={() => router.push(`/jobs/quote?bookingId=${d.job.primaryBookingId}&jobId=${d.job.id}` as Href)}
          testID="job-send-quote"
        />
      ) : null}
      {acts.raiseBill ? (
        <PillButton c={c} icon="receipt" label={t('p2.jobs.actions.raiseBill')} onPress={() => setSheet('bill')} testID="job-raise-bill" />
      ) : null}
      {acts.addVisit ? (
        <PillButton c={c} tone="outline" icon="calendar-plus" label={t('p2.jobs.actions.addVisit')} onPress={() => setSheet('visit')} testID="job-add-visit" />
      ) : null}
      {acts.close ? (
        <PillButton c={c} tone="danger" icon="close-circle-outline" label={t('p2.jobs.actions.close')} onPress={() => setSheet('close')} testID="job-close" />
      ) : null}
    </ActionRow>
  ) : null;

  const left = (
    <View style={{ gap: 12 }}>
      <JobHeaderCard c={c} job={d.job} />
      <JobStageTrack stage={d.job.stage} billed={!!d.invoice} />
      <GateCard c={c} gate={d.gate} canRefresh={acts.refreshGate} refreshing={refreshing} onRefresh={refreshGate} message={gateMsg} />
      {error ? <Banner c={c} tone="error" body={error} testID="job-error" /> : null}
      {actions}
      {d.invoice ? <InvoiceCard c={c} invoice={d.invoice} /> : null}
    </View>
  );
  const right = (
    <View style={{ gap: 8 }}>
      <SectionLabel c={c}>{t('p2.jobs.detail.quotes')}</SectionLabel>
      <QuotesCard c={c} quotes={d.quotes} />
      <SectionLabel c={c}>{t('p2.jobs.detail.visits')}</SectionLabel>
      <VisitsCard c={c} visits={d.visits} />
    </View>
  );

  return (
    <Screen
      title={d.job.code}
      subtitle={d.job.serviceName}
      c={c}
      rise
      floating={<Snackbar visible={!!toast} onDismiss={() => setToast(null)} duration={3000}>{toast ?? ''}</Snackbar>}
    >
      <TwoPane left={left} right={right} />

      <AddVisitSheet
        c={c}
        jobId={jobId}
        visible={sheet === 'visit'}
        onDismiss={() => setSheet(null)}
        onDone={() => { setSheet(null); setToast(t('p2.jobs.visit.added')); void refresh(); }}
      />
      <RaiseBillSheet
        c={c}
        jobId={jobId}
        visible={sheet === 'bill'}
        onDismiss={() => setSheet(null)}
        onDone={() => { void refresh(); }}
      />
      <ReasonDialog
        visible={sheet === 'close'}
        title={t('p2.jobs.actions.close')}
        body={t('p2.jobs.detail.closeBody')}
        confirmLabel={t('p2.jobs.actions.close')}
        submitting={closing}
        onCancel={() => setSheet(null)}
        onSubmit={close}
        danger
      />
    </Screen>
  );
}
