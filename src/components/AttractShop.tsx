// >>> W2E — the shop app's share of "Show on app" (N9: banner / strip / picture
// card / one-time popup) and the Home showcase (N4: "Create a deal"). Web twin:
// `frontend/src/components/attract/*` (partner dashboard).
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Image, Linking, Modal, Pressable, ScrollView, StyleSheet, Text, useColorScheme, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { router, useFocusEffect, type Href } from 'expo-router';

import { apiClient } from '../api/axios';
import { useAuth } from '../context/AuthContext';
import { themeColors, radii } from '../constants/colors';
import { Rise } from '../theme/motion';
import { Button } from './ui';

const REFRESH_MS = 5 * 60 * 1000;

interface Lang2 { en: string; hi?: string }
interface PromoItem {
  id: string; kind: 'BANNER' | 'STRIP' | 'CARD' | 'POPUP' | 'SHOWCASE';
  title: Lang2; body: Lang2;
  cta: { labelEn: string; labelHi: string; href: string; external: boolean } | null;
  imageUrl: string | null; imageDarkUrl: string | null;
  tone: 'info' | 'success' | 'warning' | 'danger' | 'festive'; dismissible: boolean;
}
interface ShowcaseCard {
  key: string; source: 'feature' | 'promo'; promoId?: string; art: string;
  title: Lang2; body: Lang2; cta: { en: string; hi: string; href: string; external: boolean };
}
interface HomeSlot { mode: 'festival' | 'card' | 'strip' | 'none'; card: PromoItem | null; cards: ShowcaseCard[] }

const isHi = (lng: string) => String(lng || '').startsWith('hi');
const pick = (v: Lang2 | undefined, lng: string): string => {
  if (!v) return '';
  const hi = typeof v.hi === 'string' ? v.hi.trim() : '';
  return isHi(lng) && hi ? hi : (v.en || '');
};
const track = (id: string, event: 'view' | 'tap' | 'dismiss') => {
  apiClient.post(`/app-promos/${encodeURIComponent(id)}/event`, { event }).catch(() => { /* counts are best effort */ });
};
const open = (href: string, external: boolean) => {
  if (external) { void Linking.openURL(href).catch(() => {}); return; }
  router.push(href as Href);
};

function useRefresh(load: () => void) {
  useFocusEffect(useCallback(() => {
    load();
    const timer = setInterval(load, REFRESH_MS + 1000);
    return () => clearInterval(timer);
  }, [load]));
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => { if (s === 'active') load(); });
    return () => sub.remove();
  }, [load]);
}

/** The Owner's top BANNER / STRIP for shops, and a POPUP once per person. */
export function ShopPromoBanner() {
  const { t, i18n } = useTranslation();
  const { isAuthenticated } = useAuth();
  const dark = useColorScheme() === 'dark';
  const c = themeColors(dark);
  const [items, setItems] = useState<PromoItem[]>([]);
  const [closed, setClosed] = useState<Set<string>>(new Set());
  const seen = useRef<Set<string>>(new Set());
  const last = useRef(0);

  const load = useCallback(() => {
    if (!isAuthenticated) return;
    const now = Date.now();
    if (last.current && now - last.current < REFRESH_MS) return;
    last.current = now;
    apiClient.get('/app-promos/live', { params: { surface: 'shop' } })
      .then((res) => setItems(((res as { data?: { data?: { items?: PromoItem[] } } })?.data?.data?.items ?? [])))
      .catch(() => { /* quiet */ });
  }, [isAuthenticated]);
  useRefresh(load);

  const top = items.find((i) => (i.kind === 'BANNER' || i.kind === 'STRIP') && !closed.has(i.id));
  const popup = items.find((i) => i.kind === 'POPUP' && !closed.has(i.id));
  useEffect(() => {
    for (const i of [top, popup]) if (i && !seen.current.has(i.id)) { seen.current.add(i.id); track(i.id, 'view'); }
  }, [top, popup]);

  if (!isAuthenticated) return null;
  const close = (i: PromoItem) => { setClosed((s) => new Set(s).add(i.id)); track(i.id, 'dismiss'); };
  const tap = (i: PromoItem) => {
    if (!i.cta) return;
    track(i.id, 'tap');
    if (i.kind === 'POPUP') setClosed((s) => new Set(s).add(i.id));
    open(i.cta.href, i.cta.external);
  };
  const label = (i: PromoItem) => (i.cta ? (isHi(i18n.language) && i.cta.labelHi ? i.cta.labelHi : i.cta.labelEn) : '');
  const tone = (i: PromoItem) => (i.tone === 'danger' ? c.error : i.tone === 'warning' || i.tone === 'festive' ? c.warning : i.tone === 'success' ? c.success : c.primary);

  return (
    <>
      {top ? (
        <Rise style={styles.wrap}>
          <View testID="shop-promo-banner" style={[styles.card, { borderColor: `${tone(top)}40`, backgroundColor: c.surfaceElevated }]}>
            <View style={[styles.chip, { backgroundColor: `${tone(top)}1F` }]}>
              <MaterialCommunityIcons name={top.tone === 'festive' ? 'star-four-points' : 'bullhorn'} size={18} color={tone(top)} />
            </View>
            <View style={styles.body} accessible accessibilityRole="text">
              <Text style={[styles.title, { color: c.textPrimary }]} numberOfLines={top.kind === 'STRIP' ? 2 : undefined}>{pick(top.title, i18n.language)}</Text>
              {pick(top.body, i18n.language) ? <Text style={[styles.text, { color: c.textSecondary }]}>{pick(top.body, i18n.language)}</Text> : null}
              {top.kind === 'BANNER' && top.cta ? (
                <Pressable onPress={() => tap(top)} accessibilityRole="button" hitSlop={8} style={styles.link}>
                  <Text style={[styles.linkText, { color: c.primary }]}>{label(top)} →</Text>
                </Pressable>
              ) : null}
            </View>
            {top.dismissible ? (
              <Pressable onPress={() => close(top)} accessibilityRole="button" accessibilityLabel={t('attract.close')}
                style={({ pressed }) => [styles.close, { opacity: pressed ? 0.6 : 1 }]}>
                <MaterialCommunityIcons name="close" size={18} color={c.iconMuted} />
              </Pressable>
            ) : null}
          </View>
        </Rise>
      ) : null}

      <Modal visible={!!popup} transparent animationType="fade" onRequestClose={() => { if (popup) close(popup); }}>
        <View style={styles.backdrop}>
          {popup ? (
            <View style={[styles.sheet, { backgroundColor: c.surface }]} testID="shop-promo-popup">
              {popup.imageUrl ? <Image source={{ uri: (dark && popup.imageDarkUrl) || popup.imageUrl }} style={styles.popupImg} resizeMode="cover" accessibilityIgnoresInvertColors /> : null}
              <Text style={[styles.popupTitle, { color: c.textPrimary }]}>{pick(popup.title, i18n.language)}</Text>
              {pick(popup.body, i18n.language) ? <Text style={[styles.text, { color: c.textSecondary }]}>{pick(popup.body, i18n.language)}</Text> : null}
              <View style={{ gap: 10, marginTop: 6 }}>
                {popup.cta ? <Button label={label(popup)} onPress={() => tap(popup)} fullWidth /> : null}
                <Button label={t('attract.close')} variant="outline" onPress={() => close(popup)} fullWidth />
              </View>
            </View>
          ) : null}
        </View>
      </Modal>
    </>
  );
}

/** Home's one promo slot for a shop: the Owner's CARD, else "Try something new" (e.g. "Create a deal"). */
export function ShopPromoSlot() {
  const { t, i18n } = useTranslation();
  const { isAuthenticated } = useAuth();
  const dark = useColorScheme() === 'dark';
  const c = themeColors(dark);
  const [slot, setSlot] = useState<HomeSlot | null>(null);
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const viewed = useRef<string | null>(null);
  const last = useRef(0);

  const load = useCallback(() => {
    if (!isAuthenticated) return;
    const now = Date.now();
    if (last.current && now - last.current < REFRESH_MS) return;
    last.current = now;
    apiClient.get('/showcase/home', { params: { surface: 'shop' } })
      .then((res) => setSlot((res as { data?: { data?: HomeSlot } })?.data?.data ?? null))
      .catch(() => setSlot(null));
  }, [isAuthenticated]);
  useRefresh(load);

  useEffect(() => {
    if (!slot) return;
    const ids = slot.mode === 'card' && slot.card ? [slot.card.id] : slot.cards.filter((x) => x.promoId).map((x) => x.promoId as string);
    const sig = ids.join(',');
    if (!sig || viewed.current === sig) return;
    viewed.current = sig;
    ids.forEach((id) => track(id, 'view'));
  }, [slot]);

  if (!slot || slot.mode === 'none') return null;
  const lng = i18n.language;

  if (slot.mode === 'card' && slot.card && !hidden.has(slot.card.id)) {
    const p = slot.card;
    const img = (dark && p.imageDarkUrl) || p.imageUrl;
    return (
      <Rise style={styles.wrap}>
        <View testID="shop-promo-card" style={[styles.bigCard, { borderColor: c.border, backgroundColor: c.surfaceElevated }]}>
          {img ? <Image source={{ uri: img }} style={styles.cardImg} resizeMode="cover" accessibilityIgnoresInvertColors /> : null}
          <View style={{ padding: 14, gap: 6 }}>
            <Text style={[styles.popupTitle, { color: c.textPrimary, paddingRight: 36 }]}>{pick(p.title, lng)}</Text>
            {pick(p.body, lng) ? <Text style={[styles.text, { color: c.textSecondary }]}>{pick(p.body, lng)}</Text> : null}
            {p.cta ? (
              <View style={{ alignSelf: 'flex-start', marginTop: 4 }}>
                <Button label={isHi(lng) && p.cta.labelHi ? p.cta.labelHi : p.cta.labelEn} size="sm" onPress={() => { track(p.id, 'tap'); open(p.cta!.href, p.cta!.external); }} />
              </View>
            ) : null}
          </View>
          {p.dismissible ? (
            <Pressable onPress={() => { setHidden((s) => new Set(s).add(p.id)); track(p.id, 'dismiss'); }} accessibilityRole="button" accessibilityLabel={t('attract.close')}
              style={[styles.close, styles.cornerClose, { backgroundColor: c.surface }]}>
              <MaterialCommunityIcons name="close" size={18} color={c.iconMuted} />
            </Pressable>
          ) : null}
        </View>
      </Rise>
    );
  }

  const cards = slot.cards.filter((x) => !hidden.has(x.key));
  if (slot.mode !== 'strip' || !cards.length) return null;
  return (
    <Rise style={styles.wrap}>
      <View testID="shop-showcase" style={{ gap: 8 }}>
        <Text style={[styles.sectionTitle, { color: c.textPrimary }]} accessibilityRole="header">{t('attract.tryTitle')}</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12, paddingRight: 8 }}>
          {cards.map((x) => (
            <View key={x.key} style={[styles.smallCard, { borderColor: c.border, backgroundColor: c.surfaceElevated }]}>
              <View style={[styles.chip, { backgroundColor: c.surfaceVariant }]}>
                <MaterialCommunityIcons name={x.art === 'tag' ? 'tag-outline' : 'star-four-points-outline'} size={18} color={c.primary} />
              </View>
              <Text style={[styles.title, { color: c.textPrimary, paddingRight: 28 }]}>{pick(x.title, lng)}</Text>
              <Text style={[styles.text, { color: c.textSecondary, flex: 1 }]}>{pick(x.body, lng)}</Text>
              <View style={{ alignSelf: 'flex-start' }}>
                <Button label={isHi(lng) && x.cta.hi ? x.cta.hi : x.cta.en} size="sm" onPress={() => { if (x.promoId) track(x.promoId, 'tap'); open(x.cta.href, x.cta.external); }} />
              </View>
              <Pressable onPress={() => { setHidden((s) => new Set(s).add(x.key)); apiClient.post('/showcase/dismiss', { key: x.key }).catch(() => {}); }}
                accessibilityRole="button" accessibilityLabel={t('attract.hideCard')} style={[styles.close, styles.cornerClose]}>
                <MaterialCommunityIcons name="close" size={18} color={c.iconMuted} />
              </Pressable>
            </View>
          ))}
        </ScrollView>
      </View>
    </Rise>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: 14 },
  card: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingVertical: 12, paddingLeft: 12, borderRadius: radii.md, borderWidth: 1 },
  chip: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  body: { flex: 1, gap: 2 },
  title: { fontSize: 15, lineHeight: 21, fontWeight: '700' },
  text: { fontSize: 14, lineHeight: 20 },
  link: { alignSelf: 'flex-start', minHeight: 32, justifyContent: 'center' },
  linkText: { fontSize: 13, fontWeight: '700' },
  close: { width: 44, height: 40, alignItems: 'center', justifyContent: 'center' },
  cornerClose: { position: 'absolute', top: 6, right: 6, borderRadius: 20 },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  sheet: { borderTopLeftRadius: radii.sheet, borderTopRightRadius: radii.sheet, padding: 20, gap: 8 },
  popupImg: { width: '100%', height: 170, borderRadius: radii.card },
  popupTitle: { fontSize: 18, lineHeight: 24, fontWeight: '700' },
  bigCard: { borderRadius: radii.card, borderWidth: 1, overflow: 'hidden' },
  cardImg: { width: '100%', height: 150 },
  smallCard: { width: 240, minHeight: 170, borderRadius: radii.card, borderWidth: 1, padding: 14, gap: 8 },
  sectionTitle: { fontSize: 17, fontWeight: '700' },
});
// <<< W2E
