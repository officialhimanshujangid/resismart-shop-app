import React, { useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, TextInput, View, useColorScheme } from 'react-native';
import { Text } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import Animated, { useAnimatedStyle, useSharedValue, withDelay, withRepeat, withSequence, withTiming } from 'react-native-reanimated';

import { themeColors, type ColorScheme } from '../../../src/constants/colors';
import { useLanguage } from '../../../src/i18n/useLanguage';
import { Button } from '../../../src/components/ui';
import { Card, Loading, Screen } from '../../../src/features/more/ui';
import { PressableScale, Rise, successHaptic, tapHaptic, useMotionOK } from '../../../src/theme/motion';
import { AI_QUESTION_MAX, aiApi, aiRefusal, type AiSource, type AiTurn } from '../../../src/api/ai.api';
import { AiReportButton } from '../../../src/features/help/AiReportButton'; // AI-R

/**
 * AI-1 — "Ask AI" (support chat) in the shop app. Same rules and words as the
 * website and the society app: shown only when the server says this business has
 * it; consent first with a REQUIRED 18+ tick; answers only from the partner help
 * articles, with the articles they came from; "I don't know — contact ResiSmart
 * support" when help has no answer; every refusal in plain words with the closest
 * articles. The thread lives only in this screen's memory.
 */

type Msg =
  | { id: number; kind: 'user'; text: string }
  | { id: number; kind: 'ai'; text: string; sources: AiSource[]; related: AiSource[]; question: string }
  | { id: number; kind: 'error'; text: string; related: AiSource[] };

export default function HelpAskScreen() {
  const { t } = useTranslation();
  const c = themeColors(useColorScheme() === 'dark');
  const status = useQuery({ queryKey: ['ai', 'status'], queryFn: aiApi.status, staleTime: 0 });

  if (status.isPending) {
    return <Screen c={c} title={t('ai.title')} help={false}><Loading c={c} skeleton={2} /></Screen>;
  }
  const s = status.data;
  if (!s?.features.supportChat) {
    return (
      <Screen c={c} title={t('ai.title')} help={false} rise>
        <Card c={c}>
          <Text style={[styles.body, { color: c.textPrimary }]}>
            {t(s?.reason === 'AI_OFF_FOR_SOCIETY' ? 'ai.errors.AI_OFF_FOR_SOCIETY' : 'ai.errors.AI_NOT_AVAILABLE')}
          </Text>
          <View style={{ marginTop: 12 }}>
            <Button label={t('ai.backToHelp')} variant="outline" fullWidth onPress={() => router.back()} />
          </View>
        </Card>
      </Screen>
    );
  }
  if (!s.consent.given) return <Consent c={c} onAccepted={() => void status.refetch()} />;
  return <Chat c={c} onStopped={() => void status.refetch()} />;
}

function Consent({ c, onAccepted }: { c: ColorScheme; onAccepted: () => void }) {
  const { t } = useTranslation();
  const { language } = useLanguage();
  const [adult, setAdult] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const accept = async () => {
    if (!adult || busy) return;
    setBusy(true);
    setErr('');
    try {
      await aiApi.consent(language);
      successHaptic();
      onAccepted();
    } catch (e) {
      const r = aiRefusal(e);
      setErr(r.code ? t(`ai.errors.${r.code}`) : r.message || t('ai.consent.failed'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen c={c} title={t('ai.title')} subtitle={t('ai.subtitle')} help={false} rise>
      <Card c={c}>
        <View style={styles.row}>
          <MaterialCommunityIcons name="shield-check-outline" size={24} color={c.primary} />
          <Text style={[styles.h2, { color: c.textPrimary }]}>{t('ai.consent.title')}</Text>
        </View>
        <Text style={[styles.body, { color: c.textPrimary, marginTop: 10 }]}>{t('ai.consent.body')}</Text>
        <Text style={[styles.small, { color: c.textSecondary, marginTop: 8 }]}>• {t('ai.consent.pointSaved')}</Text>
        <Text style={[styles.small, { color: c.textSecondary, marginTop: 4 }]}>• {t('ai.consent.pointStop')}</Text>
        <Pressable
          onPress={() => { tapHaptic(); setAdult((a) => !a); }}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: adult }}
          accessibilityLabel={t('ai.consent.adult')}
          style={[styles.tick, { borderColor: adult ? c.primary : c.border, backgroundColor: c.surfaceVariant }]}
        >
          <MaterialCommunityIcons name={adult ? 'checkbox-marked' : 'checkbox-blank-outline'} size={26} color={adult ? c.primary : c.textSecondary} />
          <Text style={[styles.title, { color: c.textPrimary, flex: 1 }]}>{t('ai.consent.adult')}</Text>
        </Pressable>
        {err ? <Text accessibilityLiveRegion="polite" style={[styles.small, { color: c.error, marginTop: 8 }]}>{err}</Text> : null}
        <View style={{ marginTop: 14, gap: 8 }}>
          <Button label={busy ? t('ai.consent.saving') : t('ai.consent.accept')} fullWidth disabled={!adult || busy} loading={busy} onPress={() => void accept()} />
          <Button label={t('ai.consent.notNow')} variant="outline" fullWidth onPress={() => router.back()} />
        </View>
      </Card>
    </Screen>
  );
}

function Chat({ c, onStopped }: { c: ColorScheme; onStopped: () => void }) {
  const { t } = useTranslation();
  const { language } = useLanguage();
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const scroll = useRef<ScrollView>(null);
  const ids = useRef(0);
  const next = () => { ids.current += 1; return ids.current; };
  const over = text.length > AI_QUESTION_MAX;
  const canSend = !!text.trim() && !busy && !over;

  useEffect(() => {
    const h = setTimeout(() => scroll.current?.scrollToEnd({ animated: true }), 60);
    return () => clearTimeout(h);
  }, [msgs, busy]);

  const send = async () => {
    const q = text.trim();
    if (!canSend) return;
    tapHaptic();
    const history: AiTurn[] = msgs
      .filter((m): m is Extract<Msg, { kind: 'user' | 'ai' }> => m.kind === 'user' || m.kind === 'ai')
      .map((m) => ({ role: m.kind === 'user' ? 'user' : 'model', text: m.text }));
    setMsgs((l) => [...l, { id: next(), kind: 'user', text: q }]);
    setText('');
    setBusy(true);
    try {
      const a = await aiApi.ask(q, history, language);
      setMsgs((l) => [...l, { id: next(), kind: 'ai', text: a.answer, sources: a.sources, related: a.related, question: q }]);
    } catch (e) {
      const r = aiRefusal(e);
      setMsgs((l) => [...l, { id: next(), kind: 'error', text: r.code ? t(`ai.errors.${r.code}`) : r.message || t('ai.errors.AI_FAILED'), related: r.related }]);
      if (r.code === 'AI_CONSENT_REQUIRED' || r.code === 'AI_OFF_FOR_SOCIETY' || r.code === 'AI_NOT_AVAILABLE') onStopped();
    } finally {
      setBusy(false);
    }
  };

  const stop = async () => {
    try { await aiApi.withdraw(); onStopped(); } catch { /* nothing changed */ }
  };

  // A source opens its help topic, where the article sits.
  const openSource = (s: AiSource) => router.push(`/help/${encodeURIComponent(s.module)}`);

  return (
    <Screen c={c} title={t('ai.title')} subtitle={t('ai.subtitle')} help={false} scroll={false}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView ref={scroll} style={{ flex: 1 }} contentContainerStyle={styles.thread} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
          {msgs.length === 0 ? (
            <Rise index={0}>
              <Card c={c}>
                <View style={styles.row}>
                  <MaterialCommunityIcons name="creation" size={22} color={c.primary} />
                  <Text style={[styles.title, { color: c.textPrimary, flex: 1 }]}>{t('ai.chat.introTitle')}</Text>
                </View>
                <Text style={[styles.body, { color: c.textSecondary, marginTop: 6 }]}>{t('ai.chat.intro')}</Text>
              </Card>
            </Rise>
          ) : null}

          {msgs.map((m) => (
            <Rise key={m.id} index={0} style={{ alignSelf: m.kind === 'user' ? 'flex-end' : 'flex-start', maxWidth: m.kind === 'user' ? '86%' : '94%' }}>
              {m.kind === 'user' ? (
                <View style={[styles.bubbleUser, { backgroundColor: c.primaryFill }]}>
                  <Text style={[styles.body, { color: c.textInverse }]}>{m.text}</Text>
                </View>
              ) : (
                <View style={[styles.bubbleAi, {
                  backgroundColor: m.kind === 'error' ? `${c.warning}1F` : c.surfaceVariant,
                  borderColor: m.kind === 'error' ? `${c.warning}55` : c.border,
                }]}>
                  {m.kind === 'ai' ? (
                    <View style={[styles.row, { marginBottom: 4 }]}>
                      <MaterialCommunityIcons name="creation" size={14} color={c.primary} />
                      <Text style={[styles.caption, { color: c.primary }]}>{t('ai.chat.aiLabel').toUpperCase()}</Text>
                    </View>
                  ) : null}
                  <Text style={[styles.body, { color: c.textPrimary }]}>{m.text}</Text>
                  {m.kind === 'ai' && m.sources.length ? <Sources c={c} title={t('ai.chat.sources')} items={m.sources} onOpen={openSource} /> : null}
                  {m.related.length ? <Sources c={c} title={t('ai.chat.related')} items={m.related} onOpen={openSource} /> : null}
                  {m.kind === 'ai' && m.text.trim() ? (
                    <AiReportButton feature="SUPPORT_CHAT" question={m.question} answer={m.text} testID={`ai-report-${m.id}`} />
                  ) : null}
                </View>
              )}
            </Rise>
          ))}

          {busy ? (
            <View accessibilityLabel={t('ai.chat.thinking')} style={[styles.bubbleAi, { alignSelf: 'flex-start', backgroundColor: c.surfaceVariant, borderColor: c.border }]}>
              <View style={{ flexDirection: 'row', gap: 6 }}>
                {[0, 1, 2].map((i) => <Dot key={i} delay={i * 150} color={c.primary} />)}
              </View>
            </View>
          ) : null}

          <View style={{ alignItems: 'flex-start' }}>
            <Button label={t('ai.chat.stop')} variant="ghost" size="sm" onPress={() => void stop()} />
          </View>
        </ScrollView>

        <View style={[styles.composerWrap, { backgroundColor: c.background }]}>
          <View style={[styles.composer, { borderColor: over ? c.error : c.border, backgroundColor: c.surface }]}>
            <TextInput
              value={text}
              onChangeText={setText}
              placeholder={t('ai.chat.placeholder')}
              placeholderTextColor={c.textSecondary}
              accessibilityLabel={t('ai.chat.placeholder')}
              multiline
              maxLength={AI_QUESTION_MAX + 50}
              style={[styles.input, { color: c.textPrimary }]}
            />
            <PressableScale
              onPress={() => void send()}
              disabled={!canSend}
              haptic
              accessibilityRole="button"
              accessibilityLabel={t('ai.chat.send')}
              style={[styles.send, { backgroundColor: canSend ? c.primaryFill : c.border }]}
            >
              <MaterialCommunityIcons name="send" size={20} color={canSend ? c.textInverse : c.textSecondary} />
            </PressableScale>
          </View>
          <View style={styles.metaRow}>
            <Text style={[styles.small, { color: c.textSecondary, flex: 1 }]}>{t('ai.chat.disclaimer')}</Text>
            <Text style={[styles.small, { color: over ? c.error : c.textSecondary }]}>{`${text.length}/${AI_QUESTION_MAX}`}</Text>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}

function Sources({ c, title, items, onOpen }: { c: ColorScheme; title: string; items: AiSource[]; onOpen: (s: AiSource) => void }) {
  return (
    <View style={{ marginTop: 10, gap: 6 }}>
      <Text style={[styles.caption, { color: c.textSecondary }]}>{title.toUpperCase()}</Text>
      {items.map((s) => (
        <PressableScale key={s.ref} onPress={() => onOpen(s)} accessibilityRole="button" accessibilityLabel={s.question}
          style={[styles.source, { borderColor: c.border, backgroundColor: c.surface }]}>
          <MaterialCommunityIcons name="book-open-variant" size={16} color={c.primary} />
          <Text style={[styles.small, { color: c.primary, flex: 1, fontWeight: '600' }]}>{s.question}</Text>
        </PressableScale>
      ))}
    </View>
  );
}

/** Bobbing dots while the answer is written; still when the phone asks for less motion. */
function Dot({ delay, color }: { delay: number; color: string }) {
  const ok = useMotionOK();
  const y = useSharedValue(0);
  useEffect(() => {
    if (!ok) return;
    y.value = withDelay(delay, withRepeat(withSequence(withTiming(-4, { duration: 300 }), withTiming(0, { duration: 300 })), -1));
  }, [delay, ok, y]);
  const st = useAnimatedStyle(() => ({ transform: [{ translateY: y.value }] }));
  return <Animated.View style={[{ width: 8, height: 8, borderRadius: 4, backgroundColor: color, opacity: 0.7 }, st]} />;
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  h2: { fontSize: 17, lineHeight: 23, fontWeight: '600', flex: 1 },
  title: { fontSize: 15.5, lineHeight: 21, fontWeight: '600' },
  body: { fontSize: 15, lineHeight: 22 },
  small: { fontSize: 13, lineHeight: 18 },
  caption: { fontSize: 11, lineHeight: 15, fontWeight: '600', letterSpacing: 0.2 },
  tick: { marginTop: 14, flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 52, paddingHorizontal: 12, borderRadius: 16, borderWidth: 1.5 },
  thread: { paddingHorizontal: 16, paddingVertical: 8, gap: 10 },
  bubbleUser: { borderRadius: 20, borderBottomRightRadius: 6, paddingHorizontal: 14, paddingVertical: 10 },
  bubbleAi: { borderRadius: 20, borderBottomLeftRadius: 6, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 12 },
  source: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 14, borderWidth: 1 },
  composerWrap: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 10 },
  composer: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, borderWidth: 1.5, borderRadius: 22, paddingLeft: 14, paddingRight: 6, paddingVertical: 6 },
  input: { flex: 1, minHeight: 40, maxHeight: 120, fontSize: 15, paddingVertical: 8 },
  send: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  metaRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 6, gap: 8 },
});
