import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Button, Surface, Text } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { ColorScheme, radii } from '../../../constants/colors';
import { formatI18nDate } from '../../../i18n';
import { homeBannerOf } from '../logic';
import type { MyReach } from '../types';

/**
 * The home-society banner on Today (CONTRACT-partner-P3 §9 / §11), same copy as
 * the web partner home: "Society shop of <society> — approved" with who can find
 * the business, or "Removed by your society on <date>: <reason>".
 *
 * Never replaces the dashboard — it is a fact about the listing, not a reason to
 * hide the takings. Independents and an unknown state draw nothing.
 */
export function HomeSocietyBanner({ c, reach, canManage }: { c: ColorScheme; reach: MyReach | undefined; canManage: boolean }) {
  const { t } = useTranslation();
  const b = homeBannerOf(reach);
  if (!b) return null;

  const revoked = b.kind === 'REVOKED';
  const title = revoked ? t('society.banner.removedTitle') : t('society.banner.approvedTitle', { society: b.society });
  const body = revoked
    ? b.reason
      ? t('society.banner.removedBody', { date: b.at ? formatI18nDate(b.at, t) : '—', reason: b.reason })
      : t('society.banner.removedBodyNoReason', { date: b.at ? formatI18nDate(b.at, t) : '—' })
    : t(`society.banner.approvedBody.${b.reach}`, { society: b.society, km: b.km ?? 3 });

  return (
    <Surface
      testID="home-society-banner"
      style={[styles.card, { backgroundColor: c.surface, borderLeftColor: revoked ? c.warning : c.primary }]}
      elevation={1}
    >
      <View style={styles.head}>
        <MaterialCommunityIcons name={revoked ? 'home-remove-outline' : 'home-city-outline'} size={22} color={revoked ? c.warning : c.primary} />
        <Text style={[styles.title, { color: c.textPrimary }]}>{title}</Text>
      </View>
      <Text style={[styles.body, { color: c.textSecondary }]}>{body}</Text>
      {revoked ? <Text style={[styles.note, { color: c.textSecondary }]}>{t('society.banner.removedHint')}</Text> : null}
      {canManage ? (
        <Button mode="text" compact icon="account-search-outline" onPress={() => router.push('/settings/reach')} style={styles.action}>
          {t('society.reach.title')}
        </Button>
      ) : null}
    </Surface>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: radii.card, padding: 16, gap: 6, borderLeftWidth: 3 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { flex: 1, fontSize: 15.5, fontWeight: '600' },
  body: { fontSize: 13.5, lineHeight: 19 },
  note: { fontSize: 12, lineHeight: 17 },
  action: { alignSelf: 'flex-start', marginLeft: -8 },
});
