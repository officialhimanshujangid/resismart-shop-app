// >>> OC6 — platform-wide announcement banner (web parity: frontend AnnouncementMarquee).
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Pressable, ScrollView, StyleSheet, Text, useColorScheme, View } from 'react-native';
import Animated, {
  cancelAnimation, Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withRepeat, withTiming,
} from 'react-native-reanimated';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useFocusEffect } from 'expo-router';

import { apiClient } from '../api/axios';
import { useAuth } from '../context/AuthContext';
import { store } from '../lib/store';
import { themeColors, radii, type ColorScheme } from '../constants/colors';
import { Rise } from '../theme/motion';

/** Longer than this runs as a one-line marquee, with "Read more" for the full text. */
const LONG_AT = 90;
/** Marquee speed (px per second) and the gap between the two running copies. */
const MARQUEE_SPEED = 38;
const MARQUEE_GAP = 56;

/**
 * One line that scrolls sideways when it doesn't fit — the web's
 * AnnouncementMarquee, on the UI thread. Reduce-motion shows still text
 * folded to two lines instead.
 */
function MarqueeText({ text, color }: { text: string; color: string }) {
  const reduce = useReducedMotion();
  const [boxW, setBoxW] = useState(0);
  const [textW, setTextW] = useState(0);
  const x = useSharedValue(0);
  const moving = !reduce && boxW > 0 && textW > boxW;

  useEffect(() => {
    cancelAnimation(x);
    x.value = 0;
    if (!moving) return undefined;
    const dist = textW + MARQUEE_GAP;
    x.value = withRepeat(
      withTiming(-dist, { duration: (dist / MARQUEE_SPEED) * 1000, easing: Easing.linear }),
      -1,
      false,
    );
    return () => cancelAnimation(x);
  }, [moving, textW, x]);

  const aStyle = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }] }));

  if (reduce) return <Text numberOfLines={2} style={[styles.text, { color }]}>{text}</Text>;
  return (
    <View onLayout={(e) => setBoxW(e.nativeEvent.layout.width)} style={styles.clip}>
      <ScrollView horizontal scrollEnabled={false} showsHorizontalScrollIndicator={false} pointerEvents="none">
        <Animated.View style={[styles.row, aStyle]}>
          <Text numberOfLines={1} onLayout={(e) => setTextW(e.nativeEvent.layout.width)} style={[styles.text, { color }]}>{text}</Text>
          {moving
            ? <Text numberOfLines={1} importantForAccessibility="no" style={[styles.text, { color, marginLeft: MARQUEE_GAP }]}>{text}</Text>
            : null}
        </Animated.View>
      </ScrollView>
    </View>
  );
}

/**
 * The maintenance / announcement line ResiSmart writes in its own settings —
 * the same one the web dashboard shows above every page.
 *
 * `GET /settings/announcement` (any signed-in user). `enabled` is already the
 * server's final word ("show it now": switch on, text present, inside the
 * start/end window), so nothing here re-checks dates.
 *
 * Quiet by design: a failed read shows nothing (a missing banner is not worth
 * an error), and closing it hides that exact announcement on this device until
 * it is edited or replaced.
 */

export type AnnouncementTone = 'info' | 'success' | 'warning' | 'danger';

export interface Announcement {
  enabled: boolean;
  text: string;
  /** Older servers do not send these — treated as empty / null. */
  textHi?: string;
  tone?: AnnouncementTone;
  startsAt?: string | null;
  endsAt?: string | null;
  updatedAt?: string | null;
}

/** Re-read at most this often (focus, foreground and the timer all respect it). */
export const ANNOUNCEMENT_REFRESH_MS = 5 * 60 * 1000;

/** AsyncStorage key for "the announcement this device closed" (device-scoped, survives sign-out). */
const DISMISS_KEY = 'resismart_partner_announcement_dismissed';

/** The words to show, in the reader's language — '' means "show nothing". */
export function announcementText(a: Announcement | null | undefined, language: string): string {
  if (!a || a.enabled !== true) return '';
  const en = typeof a.text === 'string' ? a.text.trim() : '';
  const hi = typeof a.textHi === 'string' ? a.textHi.trim() : '';
  return String(language || '').startsWith('hi') && hi ? hi : en;
}

/** One announcement's identity — a new or edited one has a different id. Same as the web. */
export const announcementDismissId = (a: Announcement): string => `${a.updatedAt ?? ''}|${a.text ?? ''}`;

function toneColor(tone: AnnouncementTone | undefined, c: ColorScheme): string {
  switch (tone) {
    case 'success': return c.success;
    case 'warning': return c.warning;
    case 'danger': return c.error;
    default: return c.info;
  }
}

export function AnnouncementBanner() {
  const { t, i18n } = useTranslation();
  const { isAuthenticated } = useAuth();
  const dark = useColorScheme() === 'dark';
  const c = themeColors(dark);
  const [announcement, setAnnouncement] = useState<Announcement | null>(null);
  const [dismissed, setDismissed] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const lastFetch = useRef(0);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; };
  }, []);

  const load = useCallback(async () => {
    if (!isAuthenticated) return;
    const now = Date.now();
    if (lastFetch.current && now - lastFetch.current < ANNOUNCEMENT_REFRESH_MS) return;
    lastFetch.current = now;
    try {
      const res = await apiClient.get('/settings/announcement');
      const data = (res as { data?: { data?: unknown } } | undefined)?.data?.data;
      const next = data && typeof data === 'object' ? (data as Announcement) : null;
      const closed = await store.get(DISMISS_KEY);
      if (!alive.current) return;
      setDismissed(closed);
      setAnnouncement(next);
    } catch {
      // A missing banner is not worth an error.
    }
  }, [isAuthenticated]);

  // Screen focus (and a slow timer while it stays focused).
  useFocusEffect(useCallback(() => {
    void load();
    const timer = setInterval(() => { void load(); }, ANNOUNCEMENT_REFRESH_MS + 1000);
    return () => clearInterval(timer);
  }, [load]));

  // The app coming back to the foreground.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') void load();
    });
    return () => sub.remove();
  }, [load]);

  const text = announcementText(announcement, i18n.language);
  if (!isAuthenticated || !announcement || !text) return null;
  const id = announcementDismissId(announcement);
  if (dismissed === id) return null;

  const tone = toneColor(announcement.tone, c);
  const close = () => {
    setDismissed(id);
    void store.set(DISMISS_KEY, id);
  };

  // Long notes (a Hindi paragraph easily runs 5–6 lines) fold to two lines with
  // "Read more", so the banner never pushes the screen down.
  const long = text.length > LONG_AT;

  return (
    <Rise style={styles.wrap}>
      <View
        testID="announcement-banner"
        style={[styles.card, { borderColor: `${tone}40`, backgroundColor: c.surfaceElevated }, dark ? null : styles.shadow]}
      >
        <View style={[styles.chip, { backgroundColor: `${tone}1F` }]}>
          <MaterialCommunityIcons name="bullhorn" size={18} color={tone} />
        </View>
        <View
          accessible
          accessibilityRole="text"
          accessibilityLabel={`${t('announcement.label')}: ${text}`}
          style={styles.body}
        >
          <Text style={[styles.label, { color: tone }]}>{t('announcement.label')}</Text>
          {expanded || !long
            ? <Text style={[styles.text, { color: c.textPrimary }]}>{text}</Text>
            : <MarqueeText text={text} color={c.textPrimary} />}
        </View>
        <Pressable
          onPress={close}
          accessibilityRole="button"
          accessibilityLabel={t('announcement.close')}
          testID="announcement-close"
          style={({ pressed }) => [styles.close, { opacity: pressed ? 0.6 : 1 }]}
        >
          <MaterialCommunityIcons name="close" size={18} color={c.textSecondary} />
        </Pressable>
      </View>
      {long ? (
        <Pressable
          onPress={() => setExpanded((v) => !v)}
          accessibilityRole="button"
          testID="announcement-more"
          hitSlop={8}
          style={styles.more}
        >
          <Text style={[styles.moreText, { color: c.primary }]}>
            {expanded ? t('announcement.less') : t('announcement.more')}
          </Text>
        </Pressable>
      ) : null}
    </Rise>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: 14 },
  card: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    borderWidth: 1,
    borderRadius: radii.lg,
    paddingVertical: 12,
    paddingLeft: 12,
  },
  shadow: { shadowColor: '#18233F', shadowOpacity: 0.06, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 2 },
  chip: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  body: { flex: 1, flexShrink: 1, gap: 2 },
  label: { fontSize: 12, lineHeight: 16, fontWeight: '700', letterSpacing: 0.3 },
  text: { fontSize: 14, lineHeight: 20, fontWeight: '500' },
  close: { width: 44, height: 40, alignItems: 'center', justifyContent: 'center' },
  more: { alignSelf: 'flex-start', marginTop: 6, marginLeft: 60, minHeight: 32, justifyContent: 'center' },
  moreText: { fontSize: 13, fontWeight: '700' },
  clip: { overflow: 'hidden' },
  row: { flexDirection: 'row' },
});
// <<< OC6
