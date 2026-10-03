import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, useColorScheme, View } from 'react-native';
import { IconButton, Text, TextInput } from 'react-native-paper';
import { useTranslation } from 'react-i18next';

import { radii, themeColors } from '../../../constants/colors';
import { apiErrorMessage } from '../../../api/axios';
import { formatPaise } from '../../../lib/money';
import { newIdempotencyKey } from '../../../lib/idempotency';
import { PillButton } from '../../p1/ui';
import { Sheet } from '../../p2/ui';
import { useDiscardHold, useHoldBill, useHolds, useResumeHold } from '../hooks';
import { holdMinutesLeft } from '../logic';
import type { HoldInput, ResumeResult } from '../types';

/**
 * Hold a bill (D-5): a saved cart — no number, no stock, no ledger — kept 24 h,
 * at most 20 open per cashier. One sheet to name it (the label is filled in,
 * so it is two taps), one tray to take a held bill back.
 */
export function HoldNameSheet({
  visible, defaultLabel, build, onDismiss, onHeld,
}: {
  visible: boolean;
  defaultLabel: string;
  /** The hold body WITHOUT the label — built by the till at the moment of holding. */
  build: () => Omit<HoldInput, 'label'>;
  onDismiss: () => void;
  onHeld: () => void;
}) {
  const { t } = useTranslation();
  const c = themeColors(useColorScheme() === 'dark');
  const [label, setLabel] = useState(defaultLabel);
  const [error, setError] = useState<string | null>(null);
  const key = useRef(newIdempotencyKey('hold'));
  const hold = useHoldBill();

  useEffect(() => {
    if (visible) {
      setLabel(defaultLabel);
      setError(null);
      key.current = newIdempotencyKey('hold');
    }
  }, [visible, defaultLabel]);

  const save = () => {
    const name = label.trim().slice(0, 40);
    if (!name) { setError(t('commerce.counter.holdLabelNeeded')); return; }
    hold.mutate(
      { body: { ...build(), label: name }, key: key.current },
      {
        onSuccess: () => { onHeld(); onDismiss(); },
        onError: (e) => setError(apiErrorMessage(e)),
      },
    );
  };

  return (
    <Sheet
      visible={visible}
      onDismiss={onDismiss}
      title={t('commerce.counter.holdTitle')}
      testID="hold-sheet"
      footer={<PillButton c={c} icon="pause-circle-outline" label={t('commerce.counter.hold')} onPress={save} disabled={hold.isPending} testID="hold-save" />}
    >
      <Text style={{ color: c.textSecondary, fontSize: 13, lineHeight: 19 }}>{t('commerce.counter.holdBody')}</Text>
      <TextInput
        mode="outlined"
        label={t('commerce.counter.holdLabel')}
        value={label}
        onChangeText={setLabel}
        maxLength={40}
        outlineStyle={{ borderRadius: radii.field }}
        style={{ backgroundColor: 'transparent' }}
        testID="hold-label"
      />
      {error ? <Text style={{ color: c.error, fontSize: 13 }} testID="hold-error">{error}</Text> : null}
    </Sheet>
  );
}

/** The tray of held bills (newest first). Resume puts one back on the till, re-priced at today's catalogue. */
export function HoldTraySheet({
  visible, onDismiss, onResumed, warning,
}: { visible: boolean; onDismiss: () => void; onResumed: (r: ResumeResult) => void; warning?: string }) {
  const { t } = useTranslation();
  const c = themeColors(useColorScheme() === 'dark');
  const holds = useHolds(visible);
  const resume = useResumeHold();
  const discard = useDiscardHold();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { if (visible) setError(null); }, [visible]);

  const askDiscard = (id: string, label: string) => {
    Alert.alert(t('commerce.counter.discardTitle'), t('commerce.counter.discardBody', { label }), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('commerce.counter.discard'), style: 'destructive',
        onPress: () => discard.mutate(id, { onError: (e) => setError(apiErrorMessage(e)) }),
      },
    ]);
  };

  const rows = holds.data ?? [];
  return (
    <Sheet visible={visible} onDismiss={onDismiss} title={t('commerce.counter.heldBills')} testID="hold-tray">
      {warning && rows.length ? <Text style={{ color: c.warning, fontSize: 12.5, fontWeight: '600' }}>{warning}</Text> : null}
      {holds.isPending ? <ActivityIndicator color={c.primary} /> : null}
      {holds.isError ? <Text style={{ color: c.error }}>{apiErrorMessage(holds.error)}</Text> : null}
      {holds.isSuccess && rows.length === 0 ? (
        <Text style={{ color: c.textSecondary }}>{t('commerce.counter.noHeld')}</Text>
      ) : null}
      {rows.map((h) => (
        <View key={h._id} style={[styles.row, { borderColor: c.divider, backgroundColor: c.surface }]} testID={`hold-${h._id}`}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={{ color: c.textPrimary, fontWeight: '700', fontSize: 15 }} numberOfLines={1}>{h.label}</Text>
            <Text style={{ color: c.textSecondary, fontSize: 12 }} numberOfLines={2}>
              {t('commerce.counter.holdMeta', {
                count: h.lines.length,
                amount: formatPaise(h.approxTotalPaise),
                minutes: holdMinutesLeft(h.expiresAt),
              })}
            </Text>
          </View>
          <IconButton
            icon="trash-can-outline"
            size={22}
            onPress={() => askDiscard(h._id, h.label)}
            accessibilityLabel={t('commerce.counter.discardA11y', { label: h.label })}
          />
          <PillButton
            c={c}
            label={t('commerce.counter.resume')}
            disabled={resume.isPending}
            onPress={() => resume.mutate(h._id, {
              onSuccess: (r) => { onResumed(r); onDismiss(); },
              onError: (e) => setError(apiErrorMessage(e)),
            })}
            testID={`resume-${h._id}`}
          />
        </View>
      ))}
      {error ? <Text style={{ color: c.error, fontSize: 13 }} testID="tray-error">{error}</Text> : null}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: radii.card, borderWidth: 1, paddingLeft: 12, paddingRight: 8, paddingVertical: 6, minHeight: 60 },
});
