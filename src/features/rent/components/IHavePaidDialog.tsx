import React, { useEffect, useRef, useState } from 'react';
import { Alert, ScrollView, StyleSheet, useColorScheme } from 'react-native';
import { Button, Dialog, HelperText, Portal, Text, TextInput } from 'react-native-paper';
import { useTranslation } from 'react-i18next';

import { radii, themeColors } from '../../../constants/colors';
import { DateField } from '../../../components/DateField';
import { ChipRow } from '../../more/ui';
import { apiErrorMessage } from '../../../api/axios';
import { newIdempotencyKey } from '../../../lib/idempotency';
import { parseRupeesToPaise } from '../../../lib/money';
import { dateOfDay, dayOf, paidFormErrors, rupeesInput } from '../logic';
import { useIHavePaid } from '../hooks';
import Animated from 'react-native-reanimated';
import { useShake } from '../../../components/ui';
import { tapHaptic } from '../../../theme/motion';
import { RENT_PAID_MODES, RentPaidMode } from '../types';

/**
 * "I have paid" (CONTRACT-partner-P4 §10.8): tells the society's lease managers
 * that the shop paid, with the amount, the UTR / cheque number and the day.
 * It records NO receipt — the office checks its bank and marks the bill paid —
 * and the sheet says so, so nobody thinks the bill is settled by this tap.
 * The server allows three notes per bill per day (429 RENT_PAID_NOTE_LIMIT).
 */
export function IHavePaidDialog({
  visible, billId, outstandingPaise, onClose,
}: { visible: boolean; billId: string; outstandingPaise: number; onClose: () => void }) {
  const { t } = useTranslation();
  const c = themeColors(useColorScheme() === 'dark');
  const today = dayOf(new Date());
  const [amount, setAmount] = useState('');
  const [reference, setReference] = useState('');
  const [paidOn, setPaidOn] = useState(today);
  const [mode, setMode] = useState<RentPaidMode>('UPI');
  const [tried, setTried] = useState(false);
  const key = useRef('');
  const paid = useIHavePaid(billId);

  useEffect(() => {
    if (!visible) return;
    setAmount(rupeesInput(outstandingPaise));
    setReference('');
    setPaidOn(dayOf(new Date()));
    setMode('UPI');
    setTried(false);
    // One key per opening of the sheet = one decision; a retry reuses it.
    key.current = newIdempotencyKey('rent-paid');
  }, [visible, outstandingPaise]);

  const errors = paidFormErrors({ amount, reference, paidOn }, today);
  const show = tried ? errors : null;

  // M15: a refused form shakes once (invalid fields, or the server said no); success taps a haptic.
  const { style: shakeStyle, shake } = useShake();
  const submit = () => {
    setTried(true);
    if (errors) { shake(); return; }
    paid.mutate(
      { body: { amountPaise: parseRupeesToPaise(amount)!, reference, paidOn: paidOn || undefined, mode }, key: key.current },
      {
        onSuccess: () => {
          tapHaptic();
          onClose();
          Alert.alert(t('rent.paid.doneTitle'), t('rent.paid.doneBody'));
        },
        onError: (e) => { shake(); Alert.alert(t('rent.paid.failedTitle'), apiErrorMessage(e, t('rent.paid.failedBody'))); },
      },
    );
  };

  return (
    <Portal>
      <Dialog visible={visible} onDismiss={paid.isPending ? undefined : onClose} style={[styles.dialog, { backgroundColor: c.surface }]}>
        <Dialog.Title>{t('rent.paid.title')}</Dialog.Title>
        <Dialog.ScrollArea style={styles.scrollArea}>
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
          <Animated.View style={shakeStyle}>
            <Text style={[styles.body, { color: c.textSecondary }]}>{t('rent.paid.body')}</Text>
            <TextInput
              mode="outlined"
              label={t('rent.paid.amount')}
              value={amount}
              onChangeText={(v) => setAmount(v.replace(/[^0-9.]/g, '').slice(0, 12))}
              keyboardType="decimal-pad"
              left={<TextInput.Affix text="₹" />}
              outlineStyle={{ borderRadius: radii.field }}
              testID="rent-paid-amount"
            />
            <HelperText type="error" visible={!!show?.amount}>{show?.amount ? t(show.amount) : ' '}</HelperText>
            <Text style={[styles.label, { color: c.textSecondary }]}>{t('rent.paid.mode')}</Text>
            <ChipRow
              c={c}
              value={mode}
              options={RENT_PAID_MODES.map((m) => ({ key: m, label: t(`rent.paid.modes.${m}`) }))}
              onChange={setMode}
            />
            <TextInput
              mode="outlined"
              label={t('rent.paid.reference')}
              placeholder={t('rent.paid.referenceHint')}
              value={reference}
              onChangeText={(v) => setReference(v.slice(0, 80))}
              autoCapitalize="characters"
              outlineStyle={{ borderRadius: radii.field }}
              style={styles.gapTop}
              testID="rent-paid-reference"
            />
            <HelperText type="error" visible={!!show?.reference}>{show?.reference ? t(show.reference) : ' '}</HelperText>
            <DateField
              label={t('rent.paid.paidOn')}
              value={paidOn}
              onChangeText={setPaidOn}
              maximumDate={dateOfDay(today)}
              error={show?.paidOn ? t(show.paidOn) : undefined}
            />
          </Animated.View>
          </ScrollView>
        </Dialog.ScrollArea>
        <Dialog.Actions style={styles.actions}>
          <Button onPress={onClose} disabled={paid.isPending}>{t('common.cancel')}</Button>
          <Button mode="contained" onPress={submit} loading={paid.isPending} disabled={paid.isPending} testID="rent-paid-send">
            {t('rent.paid.send')}
          </Button>
        </Dialog.Actions>
      </Dialog>
    </Portal>
  );
}

const styles = StyleSheet.create({
  dialog: { maxHeight: '90%' },
  scrollArea: { paddingHorizontal: 0 },
  content: { paddingHorizontal: 24, paddingVertical: 8 },
  body: { fontSize: 13, lineHeight: 18, marginBottom: 10 },
  label: { fontSize: 12, fontWeight: '600', marginBottom: 6 },
  gapTop: { marginTop: 10 },
  actions: { flexWrap: 'wrap', gap: 4 },
});
