import React, { useCallback, useState } from 'react';
import { Alert, FlatList, StyleSheet, useColorScheme, View } from 'react-native';
import { ActivityIndicator, Button, IconButton, Surface, Text } from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';

import { themeColors, radii } from '../../../src/constants/colors';
import { formatPaise } from '../../../src/lib/money';
import { useOfflineDrafts } from '../../../src/features/billing/useOfflineDrafts';
import { estimateDraftTotalPaise } from '../../../src/features/billing/offlineDrafts';
import { DraftStatusChip } from '../../../src/features/billing/components/StatusChip';
import { DOCUMENT_TYPE_LABEL, InvoiceDraft } from '../../../src/features/billing/types';
import { toHref } from '../../../src/features/billing/routeHref';

/**
 * Offline invoice drafts, in one place — the screen that makes "write
 * locally, sync when the network returns" (spec §4.1) something a partner can
 * actually see happening rather than trust blindly.
 */
export default function DraftsScreen() {
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
        'Discard this bill?',
        `${draft.partySnapshot.name} · ${formatPaise(estimateDraftTotalPaise(draft.lines))}. This only removes it from this device — nothing was ever sent.`,
        [
          { text: 'Keep it', style: 'cancel' },
          { text: 'Discard', style: 'destructive', onPress: () => void discardDraft(draft.id) },
        ],
      );
    },
    [discardDraft],
  );

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: c.background }]} edges={['top', 'bottom']}>
      <View style={styles.topBar}>
        <IconButton icon="arrow-left" onPress={() => router.back()} accessibilityLabel="Back" />
        <Text style={[styles.topBarTitle, { color: c.textPrimary }]}>Drafts</Text>
        <IconButton
          icon="sync"
          onPress={() => void syncPending()}
          disabled={!online || syncing}
          accessibilityLabel="Sync now"
        />
      </View>

      <Text style={[styles.subtitle, { color: c.textSecondary }]}>
        {online ? (syncing ? 'Syncing…' : 'Bills waiting to sync, or ones that need your attention.') : 'No connection — these will sync automatically once you are back online.'}
      </Text>

      {!loaded ? (
        <ActivityIndicator style={{ marginTop: 32 }} />
      ) : drafts.length === 0 ? (
        <View style={styles.empty}>
          <Text style={[styles.emptyTitle, { color: c.textPrimary }]}>Nothing queued</Text>
          <Text style={[styles.emptyBody, { color: c.textSecondary }]}>
            Every offline bill you create shows up here until it is synced.
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
  const canRetry = draft.status === 'PENDING' || draft.status === 'FAILED' || draft.status === 'BLOCKED_UPGRADE';

  return (
    <Surface style={[styles.row, { backgroundColor: c.surface }]} elevation={1}>
      <View style={styles.rowTop}>
        <Text style={[styles.rowParty, { color: c.textPrimary }]} numberOfLines={1}>
          {draft.partySnapshot.name}
        </Text>
        <DraftStatusChip status={draft.status} c={c} />
      </View>
      <Text style={[styles.rowMeta, { color: c.textSecondary }]}>
        {DOCUMENT_TYPE_LABEL[draft.type]} · {draft.lines.length} item{draft.lines.length === 1 ? '' : 's'} ·{' '}
        {formatPaise(estimateDraftTotalPaise(draft.lines))}
      </Text>
      {!!draft.lastError && draft.status !== 'SYNCED' && (
        <Text style={[styles.rowError, { color: c.error }]}>{draft.lastError}</Text>
      )}
      {draft.status === 'SYNCED' && !!draft.syncedNumber && (
        <Text style={[styles.rowError, { color: c.success }]}>Issued as {draft.syncedNumber}</Text>
      )}

      <View style={styles.rowActions}>
        {onOpen && (
          <Button mode="text" compact onPress={onOpen}>
            View invoice
          </Button>
        )}
        {canRetry && (
          <Button mode="text" compact loading={busy} disabled={busy} onPress={onRetry}>
            Retry
          </Button>
        )}
        {draft.status !== 'SYNCED' && draft.status !== 'SYNCING' && (
          <Button mode="text" compact textColor={c.error} disabled={busy} onPress={onDiscard}>
            Discard
          </Button>
        )}
      </View>
    </Surface>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 4 },
  topBarTitle: { fontSize: 16, fontWeight: '800' },
  subtitle: { fontSize: 12, paddingHorizontal: 20, marginTop: 2, marginBottom: 8 },
  list: { padding: 20, paddingTop: 4, gap: 10 },
  row: { borderRadius: radii.card, padding: 14, gap: 4 },
  rowTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  rowParty: { fontSize: 14, fontWeight: '700', flex: 1, marginRight: 8 },
  rowMeta: { fontSize: 12 },
  rowError: { fontSize: 12, fontWeight: '600' },
  rowActions: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: 4 },
  empty: { padding: 32, alignItems: 'center', gap: 6 },
  emptyTitle: { fontSize: 16, fontWeight: '700' },
  emptyBody: { fontSize: 13, textAlign: 'center' },
});
