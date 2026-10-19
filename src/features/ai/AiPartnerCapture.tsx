import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { Text } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import Animated, { useAnimatedStyle, useSharedValue, withRepeat, withTiming, cancelAnimation } from 'react-native-reanimated';
import { useTranslation } from 'react-i18next';

import type { ColorScheme } from '../../constants/colors';
import { useLanguage } from '../../i18n/useLanguage';
import { Button, Skeleton } from '../../components/ui';
import { Rise, successHaptic, tapHaptic, useMotionOK } from '../../theme/motion';
import { aiApi, aiRefusal } from '../../api/ai.api';
import {
  aiPartnerApi, aiPartnerRefusal, AI_NOTES_MAX,
  type AiPartnerStatus, type AiProductDraft, type AiPurchaseDraft, type PickedFile,
} from '../../api/ai-partner.api';

/**
 * AI-4 — the "fill from a photo" card at the top of an EXISTING shop form:
 *
 *   mode `product`   P1, in Add product: a photo of the item (+ an optional note)
 *                    → name, description (en + hi), category, unit, HSN / GST
 *                    suggestion. The price stays empty.
 *   mode `purchase`  P2, in a new purchase bill: a photo of the supplier's bill
 *                    → supplier, bill no. / date, matched lines.
 *
 * The screen puts the draft INTO its form; nothing is saved until the partner
 * presses the form's own save. Shown only when the server says the feature is
 * on for this business (the screen checks that + the permission). Consent (18+)
 * first, once, right here. Green shop tokens, light + dark, 360 dp, motion with
 * reduce-motion, haptics on the primary actions.
 */
export function AiPartnerCapture({
  c, mode, status, onStatus, disabled, onProduct, onPhotoKept, onPurchase, children, testID,
}: {
  c: ColorScheme;
  mode: 'product' | 'purchase';
  status: AiPartnerStatus;
  /** After consent: the screen reloads the status. */
  onStatus: () => void;
  disabled?: boolean;
  onProduct?: (r: { photoUrl: string; draft: AiProductDraft }) => void;
  onPhotoKept?: (url: string) => void;
  onPurchase?: (d: AiPurchaseDraft) => void;
  children?: React.ReactNode;
  testID?: string;
}) {
  const { t } = useTranslation();
  const { language } = useLanguage();
  const [phase, setPhase] = useState<'idle' | 'consent' | 'reading'>('idle');
  const [err, setErr] = useState('');
  const [notes, setNotes] = useState('');
  const [done, setDone] = useState(false);
  const product = mode === 'product';

  const send = async (file: PickedFile) => {
    setErr('');
    setPhase('reading');
    try {
      if (product) onProduct?.(await aiPartnerApi.productDraft(file, notes, language));
      else onPurchase?.(await aiPartnerApi.purchaseDraft(file, language));
      successHaptic();
      setDone(true);
    } catch (e) {
      const r = aiPartnerRefusal(e);
      if (r.photoUrl) onPhotoKept?.(r.photoUrl);
      const words = r.partnerCode ? t(`aiPartner.errors.${r.partnerCode}`) : r.aiCode ? t(`ai.errors.${r.aiCode}`) : r.message || t('aiPartner.errors.generic');
      setErr(`${words} ${r.photoUrl ? t('aiPartner.photoKept') : t('aiPartner.byHand')}`);
      if (r.aiCode === 'AI_CONSENT_REQUIRED') onStatus();
    } finally {
      setPhase('idle');
    }
  };

  const pick = async (from: 'camera' | 'library') => {
    setErr('');
    if (!status.consent) { setPhase('consent'); return; }
    try {
      if (from === 'camera') {
        const perm = await ImagePicker.requestCameraPermissionsAsync();
        if (!perm.granted) { setErr(t('aiPartner.cameraDenied')); return; }
      }
      const picked = from === 'camera'
        ? await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.8 })
        : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.8 });
      if (picked.canceled || !picked.assets?.length) return;
      const a = picked.assets[0];
      const mimeType = a.mimeType && ['image/jpeg', 'image/png', 'image/webp'].includes(a.mimeType) ? a.mimeType : 'image/jpeg';
      await send({ uri: a.uri, name: a.fileName ?? `${mode}-${Date.now()}.jpg`, mimeType });
    } catch {
      setErr(t('aiPartner.pickFailed'));
    }
  };

  return (
    <Rise index={0}>
      <View testID={testID ?? `ai-partner-${mode}`} style={[styles.card, { backgroundColor: c.surface, borderColor: c.divider }]}>
        <View style={styles.head}>
          <View style={[styles.badge, { backgroundColor: c.primarySoft }]}>
            <MaterialCommunityIcons name="creation" size={22} color={c.primary} />
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={[styles.title, { color: c.textPrimary }]}>{t(`aiPartner.${mode}.title`)}</Text>
            <Text style={[styles.small, { color: c.textSecondary }]}>{t(`aiPartner.${mode}.hint`)}</Text>
          </View>
        </View>

        {product && phase !== 'consent' ? (
          <TextInput
            value={notes}
            onChangeText={setNotes}
            maxLength={AI_NOTES_MAX}
            editable={!disabled && phase !== 'reading'}
            placeholder={t('aiPartner.product.notesPlaceholder')}
            placeholderTextColor={c.textSecondary}
            accessibilityLabel={t('aiPartner.product.notes')}
            style={[styles.input, { color: c.textPrimary, borderColor: c.divider, backgroundColor: c.background }]}
          />
        ) : null}

        {phase === 'consent' ? (
          <Consent c={c} onDone={(ok) => { setPhase('idle'); if (ok) onStatus(); }} />
        ) : (
          <View style={styles.buttons}>
            <View style={styles.half}>
              <Button label={done ? t('aiPartner.again') : t('aiPartner.takePhoto')} icon="camera-outline" variant="soft" size="sm" fullWidth
                loading={phase === 'reading'} disabled={disabled || phase === 'reading'} onPress={() => void pick('camera')} testID={`ai-partner-${mode}-camera`} />
            </View>
            <View style={styles.half}>
              <Button label={t(`aiPartner.${mode}.chooseApp`)} icon="image-outline" variant="outline" size="sm" fullWidth
                disabled={disabled || phase === 'reading'} onPress={() => void pick('library')} testID={`ai-partner-${mode}-library`} />
            </View>
          </View>
        )}

        {phase === 'reading' ? <Reading c={c} label={t('aiPartner.reading')} /> : null}
        {err ? <Text accessibilityLiveRegion="polite" style={[styles.small, { color: c.error, marginTop: 10 }]}>{err}</Text> : null}
        {phase === 'idle' ? children : null}
      </View>
    </Rise>
  );
}

/** Consent inline (the same words and 18+ tick as Help › Ask AI). */
function Consent({ c, onDone }: { c: ColorScheme; onDone: (accepted: boolean) => void }) {
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
      onDone(true);
    } catch (e) {
      const r = aiRefusal(e);
      setErr(r.code ? t(`ai.errors.${r.code}`) : r.message || t('ai.consent.failed'));
    } finally {
      setBusy(false);
    }
  };
  return (
    <View style={{ marginTop: 12 }} testID="ai-partner-consent">
      <Text style={[styles.title, { color: c.textPrimary }]}>{t('ai.consent.title')}</Text>
      <Text style={[styles.body, { color: c.textPrimary, marginTop: 6 }]}>{t('ai.consent.body')}</Text>
      <Pressable
        onPress={() => { tapHaptic(); setAdult((a) => !a); }}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: adult }}
        accessibilityLabel={t('ai.consent.adult')}
        style={[styles.tick, { borderColor: adult ? c.primary : c.divider, backgroundColor: c.surfaceVariant }]}
      >
        <MaterialCommunityIcons name={adult ? 'checkbox-marked' : 'checkbox-blank-outline'} size={26} color={adult ? c.primary : c.textSecondary} />
        <Text style={[styles.title, { color: c.textPrimary, flex: 1 }]}>{t('ai.consent.adult')}</Text>
      </Pressable>
      {err ? <Text style={[styles.small, { color: c.error, marginTop: 8 }]}>{err}</Text> : null}
      <View style={styles.buttons}>
        <View style={styles.half}><Button label={busy ? t('ai.consent.saving') : t('ai.consent.accept')} size="sm" fullWidth disabled={!adult || busy} loading={busy} onPress={() => void accept()} /></View>
        <View style={styles.half}><Button label={t('ai.consent.notNow')} variant="outline" size="sm" fullWidth onPress={() => onDone(false)} /></View>
      </View>
    </View>
  );
}

/** "Reading…" with a sweeping bar (transform only; still under reduce-motion) and skeleton rows. */
function Reading({ c, label }: { c: ColorScheme; label: string }) {
  const ok = useMotionOK();
  const x = useSharedValue(0);
  useEffect(() => {
    if (ok) x.value = withRepeat(withTiming(1, { duration: 1100 }), -1, false);
    return () => cancelAnimation(x);
  }, [ok, x]);
  const sweep = useAnimatedStyle(() => ({ transform: [{ translateX: -120 + x.value * 360 }] }));
  return (
    <View accessibilityRole="progressbar" accessibilityLabel={label} style={{ marginTop: 12, gap: 8 }}>
      <Text style={[styles.small, { color: c.textSecondary, fontWeight: '600' }]}>{label}</Text>
      <View style={[styles.track, { backgroundColor: c.surfaceVariant }]}>
        <Animated.View style={[styles.bar, { backgroundColor: c.primary }, sweep]} />
      </View>
      <Skeleton width="60%" height={14} />
      <Skeleton width="40%" height={14} />
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 16, padding: 14, marginBottom: 12 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  badge: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 15, fontWeight: '600' },
  body: { fontSize: 14, lineHeight: 20 },
  small: { fontSize: 12.5, lineHeight: 18 },
  input: { marginTop: 12, minHeight: 44, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, fontSize: 14 },
  buttons: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  half: { flexGrow: 1, flexBasis: 140 },
  tick: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1.5, borderRadius: 12, padding: 12, marginTop: 10 },
  track: { height: 6, borderRadius: 3, overflow: 'hidden' },
  bar: { width: 120, height: 6, borderRadius: 3 },
});
