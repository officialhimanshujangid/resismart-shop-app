import React, { useCallback, useState } from 'react';
import { Alert, FlatList, StyleSheet, View } from 'react-native';
import { Text } from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { formatPaise } from '../../../src/lib/money';
import { useOfflineDrafts } from '../../../src/features/billing/useOfflineDrafts';
import { estimateDraftTotalPaise } from '../../../src/features/billing/offlineDrafts';
import { DraftStatusChip } from '../../../src/features/billing/components/StatusChip';
import { InvoiceDraft, documentTypeLabelKey } from '../../../src/features/billing/types';
import { useIsGstRegistered } from '../../../src/features/billing/useGstRegistration';
import { toHref } from '../../../src/features/billing/routeHref';
// M06b — Design System v1 kit (green, light + dark, reduce-motion aware).
import { Button, Card, EmptyState, IconButton, SkeletonList, Title } from '../../../src/components/ui';
import { Rise } from '../../../src/theme/motion';
import { useAppTheme } from '../../../src/theme/useAppTheme';

/**
 * Offline invoice drafts, in one place — the screen that makes "write
 * locally, sync when the network returns" (spec §4.1) something a partner can
 * actually see happening rather than trust blindly.
 *
 * M06b (2026-10-09): kit header/cards/buttons on the DS tokens, skeleton
 * instead of a lone spinner, kit empty state, rows rise in. A failed sync is
 * worded from its stored CODE in the current language (the stored sentence was
 * frozen in whatever language the app had when the sync failed).
 */
export default function DraftsScreen() {
  const { t } = useTranslation();
  const { ds } = useAppTheme();
  const { drafts, loaded, online, syncing, retryDraft, discardDraft, syncPending } = useOfflineDrafts();

  const [busyId, setBusyId] = useState<string | null>(null);

  const handleRetry = useCallback(
    async (id: string) => {
      setBusyId(id);
      try {
        const settled = await retryDraft(id);
        if (settled?.status === 'SYNCED' && settled.syncedDocumentId) {
          router.push(toHref(`/(app)/billing/${settled.syncedDocumentId}`));
        }
      } finally {
        setBusyId(null);
      }
    },
    [retryDraft],
  );

  const handleDiscard = useCallback(
    (draft: InvoiceDraft) => {
      Alert.alert(
        t('billing.drafts.discardTitle'),
        t('billing.drafts.discardBody', {
          party: draft.partySnapshot.name,
          amount: formatPaise(estimateDraftTotalPaise(draft.lines)),
        }),
        [
          { text: t('billing.drafts.discardKeep'), style: 'cancel' },
          { text: t('billing.drafts.discardConfirm'), style: 'destructive', onPress: () => void discardDraft(draft.id) },
        ],
      );
    },
    [discardDraft, t],
  );

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: ds.ground }]} edges={['top', 'bottom']}>
      <Rise index={0} style={styles.topBar}>
        <IconButton icon="arrow-left" onPress={() => router.back()} accessibilityLabel={t('billing.drafts.back')} variant="plain" />
        <Title style={styles.topBarTitle}>{t('billing.drafts.title')}</Title>
        <IconButton
          icon="sync"
          onPress={() => void syncPending()}
          disabled={!online || syncing}
          accessibilityLabel={t('billing.drafts.syncNow')}
          variant="soft"
        />
      </Rise>

      <Rise index={1}>
        <Text style={[styles.subtitle, { color: ds.muted }]}>
          {online
            ? (syncing ? t('billing.drafts.syncing') : t('billing.drafts.subtitle'))
            : t('billing.drafts.offline')}
        </Text>
      </Rise>

      {!loaded ? (
        <View style={styles.side}><SkeletonList rows={3} /></View>
      ) : drafts.length === 0 ? (
        <Rise index={2}>
          <EmptyState icon="cloud-check-outline" title={t('billing.drafts.emptyTitle')} body={t('billing.drafts.emptyBody')} />
        </Rise>
      ) : (
        <FlatList
          data={drafts}
          keyExtractor={(d) => d.id}
          contentContainerStyle={styles.list}
          renderItem={({ item, index }) => {
            const row = (
              <DraftRow
                draft={item}
                busy={busyId === item.id}
                onRetry={() => handleRetry(item.id)}
                onDiscard={() => handleDiscard(item)}
                onOpen={
                  item.status === 'SYNCED' && item.syncedDocumentId
                    ? () => router.push(toHref(`/(app)/billing/${item.syncedDocumentId}`))
                    : undefined
                }
              />
            );
            return index < 8 ? <Rise index={Math.min(index, 4) + 2} distance={10}>{row}</Rise> : row;
          }}
        />
      )}
    </SafeAreaView>
  );
}

function DraftRow({
  draft, busy, onRetry, onDiscard, onOpen,
}: {
  draft: InvoiceDraft;
  busy: boolean;
  onRetry: () => void;
  onDiscard: () => void;
  onOpen?: () => void;
}) {
  const { t, i18n } = useTranslation();
  const { c, ds, status } = useAppTheme();
  // An offline draft has no server totals yet; an unregistered shop's
  // TAX_INVOICE will be issued untaxed, i.e. as a bill of supply.
  const isGstRegistered = useIsGstRegistered();
  const canRetry = draft.status === 'PENDING' || draft.status === 'FAILED' || draft.status === 'BLOCKED_UPGRADE';
  // The refusal in TODAY's language when it carried a code we have words for.
  const errorText = draft.lastErrorCode && i18n.exists(`errors.${draft.lastErrorCode}`)
    ? t(`errors.${draft.lastErrorCode}`, (draft.lastErrorParams ?? {}) as Record<string, unknown>)
    : draft.lastError;

  return (
    <Card padding={14}>
      <View style={styles.rowTop}>
        <Text style={[styles.rowParty, { color: ds.ink }]} numberOfLines={1}>
          {draft.partySnapshot.name}
        </Text>
        <DraftStatusChip status={draft.status} c={c} />
      </View>
      {/* `_one`/`_other`, not an English `-s`. Hindi cannot suffix a noun, and
          CLDR puts 0 as well as 1 in `one` for it — so the count is interpolated
          into both forms rather than only the plural one. */}
      <Text style={[styles.rowMeta, { color: ds.muted }]}>
        {t('billing.drafts.meta', {
          count: draft.lines.length,
          type: t(documentTypeLabelKey(draft.type, isGstRegistered)),
          amount: formatPaise(estimateDraftTotalPaise(draft.lines)),
        })}
      </Text>
      {!!errorText && draft.status !== 'SYNCED' && (
        <Text style={[styles.rowNote, { color: status.danger.fg }]}>{errorText}</Text>
      )}
      {draft.status === 'SYNCED' && !!draft.syncedNumber && (
        <Text style={[styles.rowNote, { color: status.success.fg }]}>{t('billing.drafts.issuedAs', { number: draft.syncedNumber })}</Text>
      )}

      <View style={styles.rowActions}>
        {onOpen && (
          <Button label={t('billing.drafts.viewInvoice')} variant="soft" size="sm" onPress={onOpen} />
        )}
        {canRetry && (
          <Button label={t('billing.drafts.retry')} variant="soft" size="sm" loading={busy} disabled={busy} onPress={onRetry} />
        )}
        {draft.status !== 'SYNCED' && draft.status !== 'SYNCING' && (
          <Button label={t('billing.drafts.discard')} variant="dangerOutline" size="sm" disabled={busy} onPress={onDiscard} />
        )}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  side: { marginHorizontal: 20 },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, gap: 8 },
  topBarTitle: { flex: 1, fontSize: 18 },
  subtitle: { fontSize: 12, paddingHorizontal: 20, marginTop: 2, marginBottom: 8 },
  list: { padding: 20, paddingTop: 4, gap: 10 },
  rowTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  rowParty: { fontSize: 14, fontWeight: '600', flex: 1, marginRight: 8 },
  rowMeta: { fontSize: 12, marginTop: 4 },
  rowNote: { fontSize: 12, fontWeight: '600', marginTop: 4 },
  rowActions: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'flex-end', gap: 8, marginTop: 10 },
});
