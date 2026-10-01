import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Text } from 'react-native-paper';
import { useTranslation } from 'react-i18next';

import { ColorScheme, radii } from '../../../constants/colors';
import { Pill } from '../../p2/ui';
import { ActionRow, PillButton } from '../../p1/ui';
import { shortDay } from '../../p2/dates';
import type { Pause } from '../types';

/**
 * Pauses (and, on the holidays screen, shop holidays): the days, who paused
 * (customer / shop), the reason; a removed one is struck through. Before it
 * starts a pause can be removed; while it runs, deliveries can be restarted.
 */
export function PausesList({
  c, pauses, today, onRemove, onRestart, busy, emptyText,
}: {
  c: ColorScheme;
  pauses: readonly Pause[];
  today: string;
  onRemove?: (p: Pause) => void;
  onRestart?: (p: Pause) => void;
  busy?: boolean;
  emptyText: string;
}) {
  const { t } = useTranslation();
  if (!pauses.length) return <Text style={{ color: c.textSecondary }}>{emptyText}</Text>;
  return (
    <View style={{ gap: 8 }}>
      {pauses.map((p) => {
        const gone = !!p.cancelledAt;
        const future = !gone && p.from > today;
        const running = !gone && p.from <= today && p.to >= today;
        const over = !gone && p.to < today;
        return (
          <View key={p._id} style={[styles.row, { backgroundColor: c.surface, borderColor: c.divider }]} testID={`pause-${p._id}`}>
            <View style={styles.top}>
              <Text
                style={[styles.days, { color: gone ? c.textDisabled : c.textPrimary, textDecorationLine: gone ? 'line-through' : 'none' }]}
                numberOfLines={1}
              >
                {p.from === p.to ? shortDay(p.from, t) : `${shortDay(p.from, t)} – ${shortDay(p.to, t)}`}
              </Text>
              <Pill c={c} tone={gone ? 'neutral' : running ? 'warn' : 'info'}
                label={gone ? t('p2.subscriptions.pause.removed') : running ? t('p2.subscriptions.pause.running') : over ? t('p2.subscriptions.pause.over') : t('p2.subscriptions.pause.upcoming')} />
            </View>
            <Text style={{ color: c.textSecondary, fontSize: 12 }} numberOfLines={2}>
              {[t(`p2.subscriptions.pausedBy.${p.by}`), p.reason].filter(Boolean).join(' · ')}
            </Text>
            {(future && onRemove) || (running && onRestart) ? (
              <ActionRow>
                {future && onRemove ? (
                  <PillButton c={c} tone="danger" icon="delete-outline" label={t('p2.subscriptions.pause.remove')} onPress={() => onRemove(p)}
                    disabled={busy} testID={`pause-remove-${p._id}`} />
                ) : null}
                {running && onRestart ? (
                  <PillButton c={c} tone="outline" icon="play-circle-outline" label={t('p2.subscriptions.pause.restart')} onPress={() => onRestart(p)}
                    disabled={busy} testID={`pause-restart-${p._id}`} />
                ) : null}
              </ActionRow>
            ) : null}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { borderRadius: radii.card, borderWidth: StyleSheet.hairlineWidth, padding: 12, gap: 6 },
  top: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  days: { flex: 1, minWidth: 0, fontSize: 15, fontWeight: '700' },
});
