import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Switch, Text } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';

import { ColorScheme, radii } from '../../../constants/colors';
import { PillButton } from '../../p1/ui';
import { Pill } from '../ui';
import type { CategoryModuleRow } from '../modules';

const ICON: Record<string, string> = {
  PHARMACY: 'pill', SUBSCRIPTIONS: 'calendar-sync-outline', APPOINTMENTS: 'calendar-account-outline', JOBS: 'hammer-wrench',
};

/**
 * One business-type module: what it is, the switch, and — when a base module
 * is off — which one to switch on first (the NEEDS_BASE sentence, said before
 * the request instead of after it).
 */
export function ModuleSwitchCard({
  c, row, canManage, busy, onToggle, onSettings,
}: {
  c: ColorScheme;
  row: CategoryModuleRow;
  canManage: boolean;
  busy: boolean;
  onToggle: (on: boolean) => void;
  onSettings: () => void;
}) {
  const { t } = useTranslation();
  const label = t(`p2.settings.modules.${row.key}.label`);
  const missing = row.missingBase.map((m) => t(`modules.${m}.label`)).join(' + ');
  return (
    <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.divider }]} testID={`p2-module-${row.key}`}>
      <View style={styles.head}>
        <View style={[styles.icon, { backgroundColor: c.surfaceVariant }]}>
          <MaterialCommunityIcons name={ICON[row.key] as never} size={22} color={c.primary} />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={[styles.title, { color: c.textPrimary }]} numberOfLines={2}>{label}</Text>
          <Text style={[styles.blurb, { color: c.textSecondary }]}>{t(`p2.settings.modules.${row.key}.blurb`)}</Text>
        </View>
        <Switch
          value={row.on}
          onValueChange={onToggle}
          disabled={!canManage || busy}
          accessibilityLabel={label}
          accessibilityState={{ disabled: !canManage || busy, checked: row.on }}
          testID={`p2-switch-${row.key}`}
        />
      </View>
      {row.on && !row.effective && missing ? (
        <Text style={[styles.warn, { color: c.warning }]}>{t('p2.settings.needsBase', { module: label, needs: missing })}</Text>
      ) : null}
      {!row.on && missing ? (
        <Text style={[styles.hint, { color: c.textSecondary }]}>{t('p2.settings.worksOn', { needs: missing })}</Text>
      ) : null}
      <View style={styles.foot}>
        <Pill c={c} label={row.effective ? t('p2.settings.stateOn') : row.on ? t('p2.settings.stateWaiting') : t('p2.settings.stateOff')} tone={row.effective ? 'good' : row.on ? 'warn' : 'neutral'} />
        <PillButton c={c} tone="outline" icon="tune-variant" label={t('p2.settings.settingsBtn')} onPress={onSettings} testID={`p2-settings-${row.key}`} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: radii.card, borderWidth: StyleSheet.hairlineWidth, padding: 14, gap: 10 },
  head: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  icon: { width: 40, height: 40, borderRadius: radii.sm, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 15, fontWeight: '700' },
  blurb: { fontSize: 12.5, lineHeight: 18, marginTop: 2 },
  warn: { fontSize: 12.5, lineHeight: 18, fontWeight: '600' },
  hint: { fontSize: 12, lineHeight: 17 },
  foot: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
});
