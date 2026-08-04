import React, { useEffect, useState } from 'react';
import { StyleSheet, useColorScheme } from 'react-native';
import { Portal, Dialog, Text, TextInput, Button, HelperText } from 'react-native-paper';
import { themeColors } from '../../../constants/colors';
import { KnownOrderVerb } from '../api';
import { ORDER_VERB_LABELS } from '../backend-mirror';

/**
 * `reject` and `markReturned` both require a reason the CUSTOMER reads
 * (`orderReasonSchema`: min 3 characters). One modal for both, since the shape
 * of the ask is identical — only the title and the verb sent differ.
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
        <Dialog.Title>{target ? ORDER_VERB_LABELS[target.verb] : ''}</Dialog.Title>
        <Dialog.Content>
          <Text style={[styles.body, { color: c.textSecondary }]}>
            {target?.verb === 'reject'
              ? `Say why order ${target.orderCode} cannot be taken — the customer reads this.`
              : `Say why order ${target?.orderCode} came back — this stays on the record.`}
          </Text>
          <TextInput
            mode="outlined"
            value={reason}
            onChangeText={setReason}
            placeholder="e.g. Out of stock on two items"
            multiline
            numberOfLines={3}
            autoFocus
            outlineStyle={styles.outline}
          />
          <HelperText type="error" visible={tooShort}>
            A couple of words at least — this is what the customer will read.
          </HelperText>
        </Dialog.Content>
        <Dialog.Actions>
          <Button onPress={onCancel} disabled={submitting}>Cancel</Button>
          <Button onPress={() => onSubmit(trimmed)} disabled={!canSubmit} loading={submitting}>
            Confirm
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
