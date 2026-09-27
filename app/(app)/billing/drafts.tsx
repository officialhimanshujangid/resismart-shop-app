import React, { useCallback, useState } from 'react';
import { Alert, FlatList, StyleSheet, useColorScheme, View } from 'react-native';
import { ActivityIndicator, Button, IconButton, Surface, Text } from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { themeColors, radii } from '../../../src/constants/colors';
import { formatPaise } from '../../../src/lib/money';
import { useOfflineDrafts } from '../../../src/features/billing/useOfflineDrafts';
import { estimateDraftTotalPaise } from '../../../src/features/billing/offlineDrafts';
import { DraftStatusChip } from '../../../src/features/billing/components/StatusChip';
import { InvoiceDraft, documentTypeLabelKey } from '../../../src/features/billing/types';
import { useIsGstRegistered } from '../../../src/features/billing/useGstRegistration';
import { toHref } from '../../../src/features/billing/routeHref';

/**
 * Offline invoice drafts, in one place — the screen that makes "write
 * locally, sync when the network returns" (spec §4.1) something a partner can
 * actually see happening rather than trust blindly.
 */
export default function DraftsScreen() {
  const { t } = useTranslation();
  const isDark = useColorScheme() === 'dark';
  const c = themeColors(isDark);
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
    <SafeAreaView style={[styles.root, { backgroundColor: c.background }]} edges={['top', 'bottom']}>
      <View style={styles.topBar}>
        <IconButton icon="arrow-left" onPress={() => router.back()} accessibilityLabel={t('billing.drafts.back')} />
        <Text style={[styles.topBarTitle, { color: c.textPrimary }]}>{t('billing.drafts.title')}</Text>
        <IconButton
          icon="sync"
          onPress={() => void syncPending()}
          disabled={!online || syncing}
          accessibilityLabel={t('billing.drafts.syncNow')}
        />
      </View>

      <Text style={[styles.subtitle, { color: c.textSecondary }]}>
        {online
          ? (syncing ? t('billing.drafts.syncing') : t('billing.drafts.subtitle'))
          : t('billing.drafts.offline')}
      </Text>

      {!loaded ? (
        <ActivityIndicator style={{ marginTop: 32 }} />
      ) : drafts.length === 0 ? (
        <View style={styles.empty}>
          <Text style={[styles.emptyTitle, { color: c.textPrimary }]}>{t('billing.drafts.emptyTitle')}</Text>
          <Text style={[styles.emptyBody, { color: c.textSecondary }]}>
            {t('billing.drafts.emptyBody')}
          </Text>
        </View>
      ) : (
        <FlatList
          data={drafts}
          keyExtractor={(d) => d.id}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <DraftRow
              draft={item}
              c={c}
              busy={busyId === item.id}
              onRetry={() => handleRetry(item.id)}
              onDiscard={() => handleDiscard(item)}
              onOpen={
                item.status === 'SYNCED' && item.syncedDocumentId
                  ? () => router.push(toHref(`/(app)/billing/${item.syncedDocumentId}`))
                  : undefined
              }
            />
          )}
        />
      )}
    </SafeAreaView>
  );
}

function DraftRow({
  draft, c, busy, onRetry, onDiscard, onOpen,
}: {
  draft: InvoiceDraft;
  c: ReturnType<typeof themeColors>;
  busy: boolean;
  onRetry: () => void;
  onDiscard: () => void;
  onOpen?: () => void;
}) {
  const { t } = useTranslation();
  // An offline draft has no server totals yet; an unregistered shop's
  // TAX_INVOICE will be issued untaxed, i.e. as a bill of supply.
  const isGstRegistered = useIsGstRegistered();
  const canRetry = draft.status === 'PENDING' || draft.status === 'FAILED' || draft.status === 'BLOCKED_UPGRADE';

  return (
    <Surface style={[styles.row, { backgroundColor: c.surface }]} elevation={1}>
      <View style={styles.rowTop}>
        <Text style={[styles.rowParty, { color: c.textPrimary }]} numberOfLines={1}>
          {draft.partySnapshot.name}
        </Text>
        <DraftStatusChip status={draft.status} c={c} />
      </View>
      {/* `_one`/`_other`, not an English `-s`. Hindi cannot suffix a noun, and
          CLDR puts 0 as well as 1 in `one` for it — so the count is interpolated
          into both forms rather than only the plural one. */}
      <Text style={[styles.rowMeta, { color: c.textSecondary }]}>
        {t('billing.drafts.meta', {
          count: draft.lines.length,
          type: t(documentTypeLabelKey(draft.type, isGstRegistered)),
          amount: formatPaise(estimateDraftTotalPaise(draft.lines)),
        })}
      </Text>
      {!!draft.lastError && draft.status !== 'SYNCED' && (
        <Text style={[styles.rowError, { color: c.error }]}>{draft.lastError}</Text>
      )}
      {draft.status === 'SYNCED' && !!draft.syncedNumber && (
        <Text style={[styles.rowError, { color: c.success }]}>{t('billing.drafts.issuedAs', { number: draft.syncedNumber })}</Text>
      )}

      <View style={styles.rowActions}>
        {onOpen && (
          <Button mode="text" compact onPress={onOpen}>
            {t('billing.drafts.viewInvoice')}
          </Button>
        )}
        {canRetry && (
          <Button mode="text" compact loading={busy} disabled={busy} onPress={onRetry}>
            {t('billing.drafts.retry')}
          </Button>
        )}
        {draft.status !== 'SYNCED' && draft.status !== 'SYNCING' && (
          <Button mode="text" compact textColor={c.error} disabled={busy} onPress={onDiscard}>
            {t('billing.drafts.discard')}
          </Button>
        )}
      </View>
    </Surface>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 4 },
  topBarTitle: { fontSize: 16, fontWeight: '600' },
  subtitle: { fontSize: 12, paddingHorizontal: 20, marginTop: 2, marginBottom: 8 },
  list: { padding: 20, paddingTop: 4, gap: 10 },
  row: { borderRadius: radii.card, padding: 14, gap: 4 },
  rowTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  rowParty: { fontSize: 14, fontWeight: '600', flex: 1, marginRight: 8 },
  rowMeta: { fontSize: 12 },
  rowError: { fontSize: 12, fontWeight: '600' },
  rowActions: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: 4 },
  empty: { padding: 32, alignItems: 'center', gap: 6 },
  emptyTitle: { fontSize: 16, fontWeight: '600' },
  emptyBody: { fontSize: 13, textAlign: 'center' },
});
