import React, { useEffect, useState } from 'react';
import { useColorScheme } from 'react-native';
import { Button, Dialog, HelperText, Portal, Text, TextInput } from 'react-native-paper';
import { useTranslation } from 'react-i18next';

import { radii, themeColors } from '../../constants/colors';

/**
 * "Say why" — the one dialog every P1 reason-carrying action shares (close a PO
 * short, cancel a stock count, cancel an expense or transfer, reopen a day).
 * Every one of those validators wants 3–300 characters.
 */
export function ReasonDialog({
  visible, title, body, confirmLabel, submitting, onCancel, onSubmit, danger,
}: {
  visible: boolean;
  title: string;
  body?: string;
  confirmLabel: string;
  submitting: boolean;
  onCancel: () => void;
  onSubmit: (reason: string) => void;
  danger?: boolean;
}) {
  const { t } = useTranslation();
  const c = themeColors(useColorScheme() === 'dark');
  const [reason, setReason] = useState('');
  useEffect(() => { if (visible) setReason(''); }, [visible]);

  const trimmed = reason.trim();
  const tooShort = trimmed.length > 0 && trimmed.length < 3;

  return (
    <Portal>
      <Dialog visible={visible} onDismiss={submitting ? undefined : onCancel} style={{ backgroundColor: c.surface }}>
        <Dialog.Title>{title}</Dialog.Title>
        <Dialog.Content>
          {body ? <Text style={{ color: c.textSecondary, fontSize: 13, marginBottom: 10, lineHeight: 18 }}>{body}</Text> : null}
          <TextInput
            mode="outlined"
            value={reason}
            onChangeText={(v) => setReason(v.slice(0, 300))}
            label={t('p1.reason.label')}
            multiline
            outlineStyle={{ borderRadius: radii.field }}
          />
          <HelperText type="error" visible={tooShort}>{t('p1.reason.tooShort')}</HelperText>
        </Dialog.Content>
        <Dialog.Actions>
          <Button onPress={onCancel} disabled={submitting}>{t('common.cancel')}</Button>
          <Button
            onPress={() => onSubmit(trimmed)}
            disabled={trimmed.length < 3 || submitting}
            loading={submitting}
            textColor={danger ? c.error : undefined}
          >
            {confirmLabel}
          </Button>
        </Dialog.Actions>
      </Dialog>
    </Portal>
  );
}
