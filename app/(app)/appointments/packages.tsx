import React, { useMemo, useState } from 'react';
import { StyleSheet, useColorScheme, View } from 'react-native';
import { Snackbar, Text } from 'react-native-paper';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';

import { radii, themeColors } from '../../../src/constants/colors';
import { usePartnerEntitlements } from '../../../src/hooks';
import { apiErrorMessage } from '../../../src/api/axios';
import { formatPaise } from '../../../src/lib/money';
import { EmptyBlock, ErrorBlock, Loading, Screen } from '../../../src/features/more/ui';
import { Segmented } from '../../../src/components/ui'; // M22 — sliding pill
import { SessionsBar } from '../../../src/features/appointments/components/SessionsBar'; // M22
import { ActionRow, PillButton } from '../../../src/features/p1/ui';
import { ReasonDialog } from '../../../src/features/p1/ReasonDialog';
import { Pill } from '../../../src/features/p2/ui';
import { istDayOf, shortDay } from '../../../src/features/p2/dates';
import { appointmentsApi, apptKeys, useApptServices } from '../../../src/features/appointments/api';
import { PackageSheet } from '../../../src/features/appointments/components/PackageSheet';
import { SellSheet } from '../../../src/features/appointments/components/SellSheet';
import type { PackageRow, PurchaseRow } from '../../../src/features/appointments/types';

/**
 * Session packages: the price list of packages (create / edit, Sell package)
 * and what has been sold (sessions left, expiry, Cancel an unused one).
 */
type Tab = 'PACKAGES' | 'SOLD';
const PURCHASE_TONE = { ACTIVE: 'good', EXHAUSTED: 'neutral', EXPIRED: 'warn', CANCELLED: 'bad' } as const;

export default function PackagesScreen() {
  const { t } = useTranslation();
  const c = themeColors(useColorScheme() === 'dark');
  const qc = useQueryClient();
  const { can, hasModule } = usePartnerEntitlements();
  const canPackages = can('PACKAGES_MANAGE', 'FULL');
  const canSell = canPackages && hasModule('INVOICING') && can('INVOICING_MANAGE', 'FULL');
  const canCancel = canPackages && can('DOCUMENTS_VOID', 'FULL');
  const [tab, setTab] = useState<Tab>('PACKAGES');
  const [editing, setEditing] = useState<PackageRow | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [selling, setSelling] = useState<PackageRow | null>(null);
  const [cancelling, setCancelling] = useState<PurchaseRow | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const services = useApptServices();
  const packages = useQuery({ queryKey: apptKeys.packages(), queryFn: () => appointmentsApi.packages() });
  const purchases = useQuery({ queryKey: apptKeys.purchases(), queryFn: () => appointmentsApi.purchases(), enabled: tab === 'SOLD' });
  const names = useMemo(() => new Map((services.data ?? []).map((s) => [s._id, s.name])), [services.data]);

  const cancel = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) => appointmentsApi.cancelPurchase(id, reason),
    onSuccess: () => { qc.invalidateQueries({ queryKey: apptKeys.all }); setCancelling(null); setToast(t('p2.appointments.packages.cancelDone')); },
    onError: (e) => { setCancelling(null); setToast(apiErrorMessage(e, t('p2.common.saveFailed'))); },
  });

  const list = tab === 'PACKAGES' ? packages : purchases;
  const renderPackages = (rows: PackageRow[]) => rows.map((p) => (
    <View key={p.id} style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }]} testID={`package-${p.id}`}>
      <View style={styles.head}>
        <Text style={{ color: c.textPrimary, fontWeight: '700', fontSize: 15, flex: 1, minWidth: 0 }} numberOfLines={2}>{p.name}</Text>
        {!p.isActive ? <Pill c={c} label={t('p2.appointments.packages.inactive')} /> : null}
      </View>
      <Text style={{ color: c.textSecondary, fontSize: 13 }}>
        {t('p2.appointments.packages.row', { sessions: p.sessions, price: formatPaise(p.pricePaise), days: p.validityDays })}
      </Text>
      <Text style={{ color: c.textSecondary, fontSize: 12 }} numberOfLines={2}>
        {p.serviceIds.map((id) => names.get(id) ?? t('p2.appointments.packages.oldService')).join(', ')}
      </Text>
      {canPackages ? (
        <ActionRow>
          {canSell && p.isActive ? <PillButton c={c} icon="cash-register" label={t('p2.appointments.packages.sell')} onPress={() => setSelling(p)} testID={`package-sell-${p.id}`} /> : null}
          <PillButton c={c} tone="outline" icon="pencil-outline" label={t('p2.appointments.packages.edit')} onPress={() => { setEditing(p); setSheetOpen(true); }} />
        </ActionRow>
      ) : null}
    </View>
  ));
  const renderSold = (rows: PurchaseRow[]) => rows.map((r) => (
    <View key={r.id} style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }]} testID={`purchase-${r.id}`}>
      <View style={styles.head}>
        <Text style={{ color: c.textPrimary, fontWeight: '700', flex: 1, minWidth: 0 }} numberOfLines={1}>{r.customerName ?? '—'}</Text>
        <Pill c={c} label={t(`p2.appointments.packages.status.${r.status}`)} tone={PURCHASE_TONE[r.status] ?? 'neutral'} />
      </View>
      <Text style={{ color: c.textSecondary, fontSize: 13 }} numberOfLines={1}>{r.name}</Text>
      <SessionsBar used={r.sessionsUsed} reserved={r.sessionsReserved} total={r.sessionsTotal} style={{ marginVertical: 2 }} />
      <Text style={{ color: c.textSecondary, fontSize: 13 }}>
        {`${t('p2.appointments.packages.left', { remaining: r.remaining, total: r.sessionsTotal })} · ${t('p2.appointments.packages.expires', { day: shortDay(istDayOf(r.expiresAt), t) })}`}
      </Text>
      {/* M22 — same rule as the web: a package with a session used or held cannot be cancelled. */}
      {canCancel && r.status === 'ACTIVE' && r.sessionsUsed + r.sessionsReserved === 0 ? (
        <ActionRow>
          <PillButton c={c} tone="danger" label={t('common.cancel')} onPress={() => setCancelling(r)} testID={`purchase-cancel-${r.id}`} />
        </ActionRow>
      ) : null}
    </View>
  ));

  return (
    <Screen
      c={c}
      rise
      title={t('p2.appointments.nav.packages')}
      floating={<Snackbar visible={!!toast} onDismiss={() => setToast(null)} duration={4000}>{toast}</Snackbar>}
    >
      <Segmented<Tab>
        value={tab}
        options={[{ key: 'PACKAGES', label: t('p2.appointments.packages.tabPackages') }, { key: 'SOLD', label: t('p2.appointments.packages.tabSold') }]}
        onChange={setTab}
        testID="packages-tabs"
      />
      {tab === 'PACKAGES' && canPackages ? (
        <ActionRow>
          <PillButton c={c} icon="plus" label={t('p2.appointments.packages.add')} onPress={() => { setEditing(null); setSheetOpen(true); }} testID="package-add" />
        </ActionRow>
      ) : null}
      {list.isLoading ? <Loading c={c} skeleton={4} />
        : list.isError ? <ErrorBlock c={c} message={apiErrorMessage(list.error, t('p2.common.loadFailed'))} onRetry={() => list.refetch()} />
        : tab === 'PACKAGES'
          ? ((packages.data ?? []).length ? renderPackages(packages.data ?? []) : <EmptyBlock c={c} icon="ticket-outline" title={t('p2.appointments.packages.empty')} />)
          : ((purchases.data ?? []).length ? renderSold(purchases.data ?? []) : <EmptyBlock c={c} icon="ticket-outline" title={t('p2.appointments.packages.emptySold')} />)}

      <PackageSheet
        c={c}
        visible={sheetOpen}
        editing={editing}
        services={services.data ?? []}
        onDismiss={() => setSheetOpen(false)}
        onSaved={() => { setSheetOpen(false); setToast(t('p2.appointments.packages.saved')); }}
      />
      <SellSheet c={c} pkg={selling} onDismiss={() => setSelling(null)} />
      <ReasonDialog
        visible={!!cancelling}
        title={t('p2.appointments.packages.cancelTitle')}
        body={cancelling ? `${cancelling.customerName ?? ''} · ${cancelling.name}` : undefined}
        confirmLabel={t('p2.appointments.packages.cancelConfirm')}
        submitting={cancel.isPending}
        onCancel={() => setCancelling(null)}
        onSubmit={(reason) => cancelling && cancel.mutate({ id: cancelling.id, reason })}
        danger
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: radii.card, padding: 14, gap: 6, borderWidth: StyleSheet.hairlineWidth },
  head: { flexDirection: 'row', alignItems: 'center', gap: 8 },
});
