import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Button, Text, TextInput } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import { themeColors, radii } from '../../../constants/colors';
import { ReviewPublicView, fmtReviewDate, replyStillEditable } from '../types';

interface Props {
  review: ReviewPublicView;
  /** Gate 3 (`CUSTOMERS` at FULL). A reader may see replies and post none. */
  mayReply: boolean;
  busy: boolean;
  onSubmit: (reviewId: string, text: string) => void;
  c: ReturnType<typeof themeColors>;
}

/**
 * The reply half of one review row — the mobile twin of web `ReplyBox.tsx`.
 *
 * Three states, and they are three because the server has three:
 *
 *   no reply yet          → the box, open.
 *   replied, under 24h    → the reply, with Edit. Replying again OVERWRITES
 *                           the text and leaves `at` alone, so the window
 *                           counts from when it first went public.
 *   replied, over 24h     → the reply, read-only, saying why. The server
 *                           answers 403 here; greying the button out first is
 *                           what stops a partner writing a paragraph they
 *                           cannot post.
 */
export function ReplyBox({ review, mayReply, busy, onSubmit, c }: Props) {
  const existing = review.partnerReply;
  const editable = existing ? replyStillEditable(existing.at) : true;

  const [open, setOpen] = useState(false);
  const [text, setText] = useState(existing?.text ?? '');

  const submit = () => {
    const trimmed = text.trim();
    if (!trimmed) return;
    onSubmit(review._id, trimmed);
  };

  if (existing && !open) {
    return (
      <View style={[styles.existingBox, { borderLeftColor: c.divider }]}>
        <View style={styles.existingRow}>
          <MaterialCommunityIcons name="reply" size={14} color={c.textSecondary} style={{ marginTop: 2 }} />
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 13, color: c.textSecondary }}>
              <Text style={{ fontWeight: '800', color: c.textPrimary }}>Your reply</Text>
              {'  ·  '}{fmtReviewDate(existing.at)}{existing.byName ? ` · ${existing.byName}` : ''}
            </Text>
            <Text style={{ fontSize: 13, color: c.textPrimary, marginTop: 2 }}>{existing.text}</Text>
          </View>
        </View>
        {mayReply && (
          editable ? (
            <Button
              compact
              mode="text"
              icon="pencil"
              onPress={() => { setText(existing.text); setOpen(true); }}
              labelStyle={{ fontSize: 12, fontWeight: '700' }}
              style={{ alignSelf: 'flex-start', marginTop: 2 }}
            >
              Edit reply
            </Button>
          ) : (
            <Text style={{ fontSize: 11, color: c.textDisabled, marginTop: 4 }}>
              This reply has been public for over 24 hours and can no longer be edited.
            </Text>
          )
        )}
      </View>
    );
  }

  if (!mayReply) return null;

  if (!open) {
    return (
      <Button
        compact
        mode="text"
        icon="reply"
        onPress={() => setOpen(true)}
        labelStyle={{ fontSize: 12, fontWeight: '700' }}
        style={{ alignSelf: 'flex-start', marginTop: 6 }}
      >
        Reply
      </Button>
    );
  }

  return (
    <View style={{ marginTop: 8, gap: 8 }}>
      <TextInput
        mode="outlined"
        value={text}
        onChangeText={setText}
        placeholder="Answer this customer. Everyone reading your profile will see it."
        multiline
        numberOfLines={2}
        outlineStyle={{ borderRadius: radii.field }}
      />
      <View style={styles.actionsRow}>
        <Button
          mode="contained"
          compact
          loading={busy}
          disabled={busy || !text.trim()}
          onPress={submit}
        >
          {busy ? 'Posting…' : existing ? 'Save reply' : 'Post reply'}
        </Button>
        <Button
          mode="text"
          compact
          disabled={busy}
          onPress={() => { setOpen(false); setText(existing?.text ?? ''); }}
        >
          Cancel
        </Button>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  existingBox: { marginTop: 8, paddingLeft: 10, borderLeftWidth: 2 },
  existingRow: { flexDirection: 'row', gap: 6 },
  actionsRow: { flexDirection: 'row', gap: 8 },
});
