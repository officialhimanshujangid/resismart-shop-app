import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';

import type { ColorScheme } from '../../../constants/colors';
import { formatI18nDate } from '../../../i18n';
import { Button, Card } from '../../../components/ui';
import { radius, typeScale } from '../../../theme/tokens';
import { useAppTheme } from '../../../theme/useAppTheme';
import { Rise } from '../../../theme/motion';
import { homeBannerOf } from '../logic';
import type { MyReach } from '../types';

/**
 * The home-society banner on Today (CONTRACT-partner-P3 §9 / §11), same copy as
 * the web partner home: "Society shop of <society> — approved" with who can find
 * the business, or "Removed by your society on <date>: <reason>".
 *
 * Never replaces the dashboard — it is a fact about the listing, not a reason to
 * hide the takings. Independents and an unknown state draw nothing.
 *
 * M04-H redesign (DS v1, green): a kit `Card` with a tinted icon tile — green
 * for approved, amber for removed (never red: the partner did nothing wrong) —
 * and the reach door as a kit ghost button. Colours come from `useAppTheme()`
 * (light + dark); `c` stays in the signature for the callers and tests.
 */
export function HomeSocietyBanner({ reach, canManage }: { c: ColorScheme; reach: MyReach | undefined; canManage: boolean }) {
  const { t } = useTranslation();
  const { ds, tints, isDark } = useAppTheme();
  const b = homeBannerOf(reach);
  if (!b) return null;

  const revoked = b.kind === 'REVOKED';
  // P2A (M04-Q13): the home society's account is paused — amber, like removed.
  const paused = b.kind === 'PAUSED';
  const title = revoked ? t('society.banner.removedTitle')
    : paused ? t('society.banner.pausedTitle')
      : t('society.banner.approvedTitle', { society: b.society });
  const body = b.kind === 'REVOKED'
    ? b.reason
      ? t('society.banner.removedBody', { date: b.at ? formatI18nDate(b.at, t) : '—', reason: b.reason })
      : t('society.banner.removedBodyNoReason', { date: b.at ? formatI18nDate(b.at, t) : '—' })
    : b.kind === 'PAUSED'
      ? t('society.banner.pausedBody', { society: b.society })
      : t(`society.banner.approvedBody.${b.reach}`, { society: b.society, km: b.km ?? 3 });
  const tn = tints[revoked || paused ? 'amber' : 'green'];
  // Light green tint icon is 2.9:1 on its gradient (< 3:1); the deeper brand token reads ≈4:1.
  const iconColor = !revoked && !paused && !isDark ? ds.primaryDeep : tn.icon;

  return (
    // Rise inside: an independent draws nothing, and an outside wrapper would leave a gap.
    <Rise index={2}><Card testID="home-society-banner">
      <View style={styles.head}>
        <View style={styles.iconTile}>
          <LinearGradient colors={[tn.from, tn.to]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[StyleSheet.absoluteFill, styles.iconFill]} />
          <MaterialCommunityIcons name={revoked ? 'home-remove-outline' : paused ? 'pause-circle-outline' : 'home-city-outline'} size={22} color={iconColor} />
        </View>
        <View style={styles.text}>
          <Text style={[typeScale.row, { color: ds.ink }]}>{title}</Text>
          <Text style={[typeScale.detail, { color: ds.muted }]}>{body}</Text>
          {revoked ? <Text style={[typeScale.detail, { color: ds.muted }]}>{t('society.banner.removedHint')}</Text> : null}
        </View>
      </View>
      {canManage ? (
        <Button
          variant="ghost"
          size="sm"
          icon="account-search-outline"
          label={t('society.reach.title')}
          onPress={() => router.push('/settings/reach')}
          style={styles.action}
        />
      ) : null}
    </Card></Rise>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  iconTile: { width: 42, height: 42, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  iconFill: { borderRadius: radius.md },
  text: { flex: 1, minWidth: 0, gap: 3 },
  // Lines the ghost button's label up under the text column (icon 42 + gap 12 − button padding 16).
  action: { marginLeft: 38, marginTop: -4 },
});
