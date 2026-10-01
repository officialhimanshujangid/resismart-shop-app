import React, { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, View, useColorScheme } from 'react-native';
import { Button, Dialog, Portal, Text } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';

import { themeColors, radii } from '../../../constants/colors';
import { AppInput } from '../../../components/AppInput';
import { apiErrorMessage } from '../../../api/axios';
import { useCreateInvite } from '../hooks';
import { validateInviteForm, InviteFormValues } from '../logic';
import type { CreatedInvite, InviteKind } from '../types';

const EMPTY: InviteFormValues = { name: '', phone: '', email: '', note: '' };

/**
 * "Invite a co-owner" and "Hand over this business" — one form, two kinds.
 *
 * The handover variant carries the three sentences the contract requires next
 * to the button: previous owners lose ALL access on acceptance; a re-rented
 * shop is NOT a handover; bills after the cut-over carry the new owner's GSTIN.
 */
export function InviteFormDialog({
  kind, onDismiss, onCreated,
}: {
  /** `null` = closed. */
  kind: InviteKind | null;
  onDismiss: () => void;
  onCreated: (created: CreatedInvite) => void;
}) {
  const { t } = useTranslation();
  const c = themeColors(useColorScheme() === 'dark');
  const create = useCreateInvite();
  const [values, setValues] = useState<InviteFormValues>(EMPTY);
  const [touched, setTouched] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  useEffect(() => {
    if (kind) {
      setValues(EMPTY);
      setTouched(false);
      setServerError(null);
      create.reset();
    }
    // `create.reset` is stable; re-running on `kind` is the point.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind]);

  const errors = kind ? validateInviteForm(kind, values) : {};
  const shown = touched ? errors : {};
  const set = (k: keyof InviteFormValues) => (v: string) => setValues((s) => ({ ...s, [k]: v }));
  const isTransfer = kind === 'TRANSFER';

  const submit = () => {
    setTouched(true);
    setServerError(null);
    if (!kind || Object.keys(errors).length > 0) return;
    create.mutate(
      { kind, ...values },
      {
        onSuccess: (created) => onCreated(created),
        onError: (e) => setServerError(apiErrorMessage(e, t('owners.form.failed'))),
      },
    );
  };

  return (
    <Portal>
      <Dialog
        visible={kind !== null}
        onDismiss={create.isPending ? undefined : onDismiss}
        style={[styles.dialog, { backgroundColor: c.surface }]}
      >
        <Dialog.Title style={{ color: c.textPrimary }}>
          {isTransfer ? t('owners.form.transferTitle') : t('owners.form.coOwnerTitle')}
        </Dialog.Title>
        <Dialog.ScrollArea style={styles.scrollArea}>
          <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
            {isTransfer ? (
              <View style={[styles.warn, { backgroundColor: c.error + '14', borderColor: c.error + '55' }]}>
                <View style={styles.warnHead}>
                  <MaterialCommunityIcons name="alert-outline" size={18} color={c.error} />
                  <Text style={[styles.warnTitle, { color: c.error }]}>{t('owners.form.transferWarnTitle')}</Text>
                </View>
                <Text style={[styles.warnText, { color: c.textPrimary }]}>{t('owners.form.transferWarnAccess')}</Text>
                <Text style={[styles.warnText, { color: c.textPrimary }]}>{t('owners.form.transferWarnRerent')}</Text>
                <Text style={[styles.warnText, { color: c.textPrimary }]}>{t('owners.form.transferWarnGstin')}</Text>
              </View>
            ) : (
              <Text style={[styles.intro, { color: c.textSecondary }]}>{t('owners.form.coOwnerIntro')}</Text>
            )}

            <AppInput
              label={isTransfer ? t('owners.form.newOwnerName') : t('owners.form.name')}
              value={values.name}
              onChangeText={set('name')}
              autoCapitalize="words"
              error={shown.name ? t(shown.name) : undefined}
            />
            <AppInput
              label={isTransfer ? t('owners.form.emailRequired') : t('owners.form.email')}
              value={values.email}
              onChangeText={set('email')}
              keyboardType="email-address"
              autoCapitalize="none"
              error={shown.email ? t(shown.email) : undefined}
            />
            <AppInput
              label={isTransfer ? t('owners.form.phoneRecommended') : t('owners.form.phone')}
              value={values.phone}
              onChangeText={set('phone')}
              keyboardType="phone-pad"
              autoCapitalize="none"
              error={shown.phone ? t(shown.phone) : undefined}
            />
            {shown.contact ? (
              <Text style={[styles.inlineError, { color: c.error }]}>{t(shown.contact)}</Text>
            ) : (
              <Text style={[styles.hint, { color: c.textSecondary }]}>
                {isTransfer ? t('owners.form.transferContactHint') : t('owners.form.contactHint')}
              </Text>
            )}
            <AppInput
              label={t('owners.form.note')}
              value={values.note}
              onChangeText={set('note')}
              multiline
              numberOfLines={2}
              error={shown.note ? t(shown.note) : undefined}
            />
            {serverError ? (
              <Text style={[styles.inlineError, { color: c.error }]} accessibilityLiveRegion="polite">{serverError}</Text>
            ) : null}
          </ScrollView>
        </Dialog.ScrollArea>
        <Dialog.Actions style={styles.actions}>
          <Button onPress={onDismiss} disabled={create.isPending}>{t('common.cancel')}</Button>
          <Button
            mode="contained"
            onPress={submit}
            loading={create.isPending}
            disabled={create.isPending}
            buttonColor={isTransfer ? c.error : c.primary}
            textColor={c.textInverse}
          >
            {isTransfer ? t('owners.form.sendTransfer') : t('owners.form.sendInvite')}
          </Button>
        </Dialog.Actions>
      </Dialog>
    </Portal>
  );
}

const styles = StyleSheet.create({
  dialog: { width: '92%', maxWidth: 560, alignSelf: 'center' },
  scrollArea: { paddingHorizontal: 0, maxHeight: 520 },
  body: { paddingHorizontal: 20, paddingVertical: 8, gap: 2 },
  intro: { fontSize: 13, lineHeight: 19, marginBottom: 4 },
  warn: { borderRadius: radii.sm, borderWidth: 1, padding: 12, gap: 6, marginBottom: 6 },
  warnHead: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  warnTitle: { fontSize: 13.5, fontWeight: '700', flexShrink: 1 },
  warnText: { fontSize: 12.5, lineHeight: 18 },
  hint: { fontSize: 12, lineHeight: 17, marginBottom: 2 },
  inlineError: { fontSize: 12.5, lineHeight: 18, marginTop: 4 },
  actions: { flexWrap: 'wrap', gap: 8, paddingHorizontal: 16 },
});
