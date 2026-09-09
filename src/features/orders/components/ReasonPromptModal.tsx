import React, { useEffect, useState } from 'react';
import { StyleSheet, useColorScheme } from 'react-native';
import { Portal, Dialog, Text, TextInput, Button, HelperText } from 'react-native-paper';
import { useTranslation } from 'react-i18next';

import { themeColors } from '../../../constants/colors';
import { KnownOrderVerb } from '../api';
import { ORDER_VERB_LABEL_KEYS } from '../backend-mirror';

/**
 * `reject`, `markReturned` and `cancel` all require a reason the CUSTOMER
 * reads (`orderReasonSchema`: min 3 characters). One modal for all three,
 * since the shape of the ask is identical — only the title and the sentence
 * shown differ.
 */
export interface ReasonPromptTarget {
  orderCode: string;
  verb: KnownOrderVerb;
}

interface ReasonPromptModalProps {
  target: ReasonPromptTarget | null;
  submitting: boolean;
  onCancel: () => void;
  onSubmit: (reason: string) => void;
}

export function ReasonPromptModal({ target, submitting, onCancel, onSubmit }: ReasonPromptModalProps) {
  const { t } = useTranslation();
  const c = themeColors(useColorScheme() === 'dark');
  const [reason, setReason] = useState('');

  useEffect(() => {
    if (target) setReason('');
  }, [target]);

  const trimmed = reason.trim();
  const tooShort = trimmed.length > 0 && trimmed.length < 3;
  const canSubmit = trimmed.length >= 3 && !submitting;

  return (
    <Portal>
      <Dialog visible={Boolean(target)} onDismiss={submitting ? undefined : onCancel} style={{ backgroundColor: c.surface }}>
        <Dialog.Title>{target ? t(ORDER_VERB_LABEL_KEYS[target.verb]) : ''}</Dialog.Title>
        <Dialog.Content>
          <Text style={[styles.body, { color: c.textSecondary }]}>
            {target?.verb === 'reject'
              ? t('orders.reason.rejectBody', { code: target.orderCode })
              : target?.verb === 'cancel'
                ? t('orders.reason.cancelBody', { code: target.orderCode })
                : t('orders.reason.returnBody', { code: target?.orderCode ?? '' })}
          </Text>
          <TextInput
            mode="outlined"
            value={reason}
            onChangeText={setReason}
            placeholder={t('orders.reason.placeholder')}
            multiline
            numberOfLines={3}
            autoFocus
            outlineStyle={styles.outline}
          />
          <HelperText type="error" visible={tooShort}>
            {t('orders.reason.tooShort')}
          </HelperText>
        </Dialog.Content>
        <Dialog.Actions>
          <Button onPress={onCancel} disabled={submitting}>{t('common.cancel')}</Button>
          <Button onPress={() => onSubmit(trimmed)} disabled={!canSubmit} loading={submitting}>
            {t('orders.reason.confirm')}
          </Button>
        </Dialog.Actions>
      </Dialog>
    </Portal>
  );
}

const styles = StyleSheet.create({
  body: { fontSize: 13, marginBottom: 10, lineHeight: 18 },
  outline: { borderRadius: 12 },
});
