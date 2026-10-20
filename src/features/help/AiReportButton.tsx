import React, { useState } from 'react';
import { StyleSheet, Text, TextInput, View, useColorScheme } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import Animated, { FadeIn } from 'react-native-reanimated';

import { themeColors } from '../../constants/colors';
import { useLanguage } from '../../i18n/useLanguage';
import { Button, SnapSheet, useToast } from '../../components/ui';
import { PressableScale, successHaptic, tapHaptic, useMotionOK } from '../../theme/motion';
import {
  AI_REPORT_NOTE_MAX, AI_REPORT_REASONS, aiRefusal, reportAiAnswer,
  type AiReportFeature, type AiReportReason,
} from '../../api/ai.api';

/**
 * AI-R — "Report" under an AI answer (Google Play, AI-Generated Content policy).
 * Same verbs, codes and words as the website and the other apps.
 *
 * A small flag + text button (never stretched). Tap → a bottom sheet with the
 * four reasons and an optional note → Send → `POST /ai/report` with the
 * question that produced this answer. Sent → a toast, and the button turns into
 * a disabled "Reported". A refusal shows the server's own sentence inside the
 * sheet; the chat underneath keeps working either way.
 */
export function AiReportButton({ feature, question, answer, testID }: {
  feature: AiReportFeature;
  question: string;
  answer: string;
  testID?: string;
}) {
  const { t } = useTranslation();
  const { language } = useLanguage();
  const c = themeColors(useColorScheme() === 'dark');
  const toast = useToast();
  const motionOK = useMotionOK();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<AiReportReason | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [reported, setReported] = useState(false);

  const close = () => { if (!busy) setOpen(false); };

  const send = async () => {
    if (!reason || busy) return;
    setBusy(true);
    setErr('');
    try {
      await reportAiAnswer({ feature, question, answer, reason, note, lang: language });
      successHaptic();
      setReported(true);
      setOpen(false);
      toast.show({ message: t('ai.report.sent'), tone: 'success' });
    } catch (e) {
      const r = aiRefusal(e);
      setErr(r.code ? t(`ai.errors.${r.code}`) : r.message || t('ai.report.failed'));
    } finally {
      setBusy(false);
    }
  };

  if (reported) {
    return (
      <Animated.View entering={motionOK ? FadeIn.duration(180) : undefined} style={styles.wrap}>
        <View style={styles.btn} accessibilityRole="button" accessibilityState={{ disabled: true }} accessibilityLabel={t('ai.report.reported')} testID={testID ? `${testID}-done` : undefined}>
          <MaterialCommunityIcons name="flag-checkered" size={14} color={c.textSecondary} />
          <Text style={[styles.label, { color: c.textSecondary }]}>{t('ai.report.reported')}</Text>
        </View>
      </Animated.View>
    );
  }

  return (
    <View style={styles.wrap}>
      <PressableScale
        onPress={() => { tapHaptic(); setErr(''); setOpen(true); }}
        accessibilityRole="button"
        accessibilityLabel={t('ai.report.title')}
        hitSlop={8}
        style={styles.btn}
        testID={testID}
      >
        <MaterialCommunityIcons name="flag-outline" size={14} color={c.textSecondary} />
        <Text style={[styles.label, { color: c.textSecondary }]}>{t('ai.report.button')}</Text>
      </PressableScale>

      <SnapSheet
        visible={open}
        onDismiss={close}
        title={t('ai.report.title')}
        subtitle={t('ai.report.subtitle')}
        snapPoints={[0.7, 0.92]}
        footer={(
          <View style={styles.footer}>
            <Button label={t('ai.report.cancel')} variant="outline" onPress={close} disabled={busy} />
            <Button label={t('ai.report.send')} onPress={() => void send()} disabled={!reason || busy} loading={busy} />
          </View>
        )}
      >
        <View style={{ gap: 8 }} accessibilityRole="radiogroup">
          {AI_REPORT_REASONS.map((r) => {
            const on = reason === r;
            return (
              <PressableScale
                key={r}
                onPress={() => { tapHaptic(); setReason(r); }}
                accessibilityRole="radio"
                accessibilityState={{ checked: on }}
                accessibilityLabel={t(`ai.report.reason.${r}`)}
                style={[styles.reason, { borderColor: on ? c.primary : c.border, backgroundColor: on ? `${c.primary}14` : c.surface }]}
              >
                <MaterialCommunityIcons name={on ? 'radiobox-marked' : 'radiobox-blank'} size={22} color={on ? c.primary : c.textSecondary} />
                <Text style={[styles.reasonText, { color: c.textPrimary }]}>{t(`ai.report.reason.${r}`)}</Text>
              </PressableScale>
            );
          })}
        </View>
        <TextInput
          value={note}
          onChangeText={setNote}
          placeholder={t('ai.report.note')}
          placeholderTextColor={c.textSecondary}
          accessibilityLabel={t('ai.report.note')}
          multiline
          maxLength={AI_REPORT_NOTE_MAX}
          style={[styles.note, { color: c.textPrimary, borderColor: c.border, backgroundColor: c.surface }]}
        />
        <Text style={[styles.count, { color: c.textSecondary }]}>{`${note.length}/${AI_REPORT_NOTE_MAX}`}</Text>
        {err ? <Text accessibilityLiveRegion="polite" style={[styles.err, { color: c.error }]}>{err}</Text> : null}
      </SnapSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignSelf: 'flex-start', marginTop: 8 },
  btn: { flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 32, paddingHorizontal: 4, alignSelf: 'flex-start' },
  label: { fontSize: 12.5, lineHeight: 16, fontWeight: '600' },
  reason: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 48, paddingHorizontal: 12, borderRadius: 14, borderWidth: 1.5 },
  reasonText: { flex: 1, fontSize: 15, lineHeight: 21 },
  note: { marginTop: 12, minHeight: 72, maxHeight: 120, borderWidth: 1, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15, textAlignVertical: 'top' },
  count: { marginTop: 4, fontSize: 12, textAlign: 'right' },
  err: { marginTop: 8, fontSize: 13, lineHeight: 18 },
  footer: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10 },
});
