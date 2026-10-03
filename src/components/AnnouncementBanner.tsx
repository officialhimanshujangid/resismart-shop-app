// >>> OC6 — platform-wide announcement banner (web parity: frontend AnnouncementMarquee).
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Pressable, StyleSheet, Text, useColorScheme, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useFocusEffect } from 'expo-router';

import { apiClient } from '../api/axios';
import { useAuth } from '../context/AuthContext';
import { store } from '../lib/store';
import { themeColors, radii, type ColorScheme } from '../constants/colors';

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
  const c = themeColors(useColorScheme() === 'dark');
  const [announcement, setAnnouncement] = useState<Announcement | null>(null);
  const [dismissed, setDismissed] = useState<string | null>(null);
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

  return (
    <View testID="announcement-banner" style={[styles.card, { borderColor: tone, backgroundColor: `${tone}1F` }]}>
      <View
        accessible
        accessibilityRole="text"
        accessibilityLabel={`${t('announcement.label')}: ${text}`}
        style={styles.body}
      >
        <MaterialCommunityIcons name="bullhorn" size={18} color={tone} style={styles.icon} />
        <Text style={[styles.text, { color: c.textPrimary }]}>{text}</Text>
      </View>
      <Pressable
        onPress={close}
        accessibilityRole="button"
        accessibilityLabel={t('announcement.close')}
        testID="announcement-close"
        style={({ pressed }) => [styles.close, { opacity: pressed ? 0.6 : 1 }]}
      >
        <MaterialCommunityIcons name="close" size={20} color={c.textPrimary} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    borderWidth: 1,
    borderRadius: radii.md,
    paddingLeft: 12,
  },
  body: { flex: 1, flexDirection: 'row', alignItems: 'flex-start', gap: 8, paddingVertical: 11 },
  icon: { marginTop: 1 },
  text: { flex: 1, flexShrink: 1, fontSize: 14, lineHeight: 20, fontWeight: '500' },
  close: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
});
// <<< OC6
