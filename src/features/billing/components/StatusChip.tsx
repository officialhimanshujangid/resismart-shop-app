import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Text } from 'react-native-paper';
import { useTranslation } from 'react-i18next';
import { ColorScheme, radii } from '../../../constants/colors';
import { DraftSyncStatus, PartnerDocumentStatus, STATUS_LABEL_KEY } from '../types';

/** One colour + label table, read by both the server-status chip and the local draft-sync chip, so the two never invent different colours for "this needs your attention". */
function tone(c: ColorScheme, kind: 'neutral' | 'good' | 'warn' | 'bad'): { bg: string; fg: string } {
  switch (kind) {
    case 'good':
      return { bg: c.success + '22', fg: c.success };
    case 'warn':
      return { bg: c.warning + '22', fg: c.warning };
    case 'bad':
      return { bg: c.error + '22', fg: c.error };
    default:
      return { bg: c.surfaceVariant, fg: c.textSecondary };
  }
}

function serverStatusKind(status: PartnerDocumentStatus): 'neutral' | 'good' | 'warn' | 'bad' {
  if (status === 'PAID') return 'good';
  if (status === 'PARTIALLY_PAID') return 'warn';
  if (status === 'CANCELLED' || status === 'EXPIRED') return 'bad';
  if (status === 'DRAFT') return 'neutral';
  return 'neutral';
}

export function DocumentStatusChip({ status, c }: { status: PartnerDocumentStatus; c: ColorScheme }) {
  const { t } = useTranslation();
  const { bg, fg } = tone(c, serverStatusKind(status));
  return (
    <View style={[styles.chip, { backgroundColor: bg }]}>
      <Text style={[styles.label, { color: fg }]}>{t(STATUS_LABEL_KEY[status])}</Text>
    </View>
  );
}

/** Catalogue keys. The status itself is local state (`DraftSyncStatus`), never sent. */
const DRAFT_STATUS_LABEL_KEY: Record<DraftSyncStatus, string> = {
  PENDING: 'billing.draftStatus.PENDING',
  SYNCING: 'billing.draftStatus.SYNCING',
  FAILED: 'billing.draftStatus.FAILED',
  BLOCKED_UPGRADE: 'billing.draftStatus.BLOCKED_UPGRADE',
  SYNCED: 'billing.draftStatus.SYNCED',
};

function draftStatusKind(status: DraftSyncStatus): 'neutral' | 'good' | 'warn' | 'bad' {
  if (status === 'SYNCED') return 'good';
  if (status === 'FAILED' || status === 'BLOCKED_UPGRADE') return 'bad';
  if (status === 'SYNCING') return 'warn';
  return 'neutral';
}

export function DraftStatusChip({ status, c }: { status: DraftSyncStatus; c: ColorScheme }) {
  const { t } = useTranslation();
  const { bg, fg } = tone(c, draftStatusKind(status));
  return (
    <View style={[styles.chip, { backgroundColor: bg }]}>
      <Text style={[styles.label, { color: fg }]}>{t(DRAFT_STATUS_LABEL_KEY[status])}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: radii.pill, alignSelf: 'flex-start' },
  label: { fontSize: 12, fontWeight: '600' },
});
