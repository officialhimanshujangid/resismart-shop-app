import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, StyleSheet, View, useColorScheme } from 'react-native';
import { Button, Chip, Switch, Text } from 'react-native-paper';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';

import { themeColors, radii, palette } from '../../../src/constants/colors';
import { usePartnerEntitlements, PartnerModuleState } from '../../../src/hooks'; // X2F: plan no longer locks a module
import { partnerApi } from '../../../src/api/partner.api';
import { PARTNER_MODULES, PartnerModule } from '../../../src/types/api-contract.generated';
import { qk } from '../../../src/lib/queryKeys';
import { apiErrorMessage } from '../../../src/api/axios';
import { Card, ErrorBlock, Loading, Screen } from '../../../src/features/more/ui';

/**
 * Gate 2 — what this business actually uses. C7, mirroring web
 * `partner/settings/modules/page.tsx`.
 *
 * Two states:
 *
 *   ON      switched on, and the partner may switch it off.
 *   OFF     switched off by the partner. One tap brings it back — nothing is
 *           deleted, so a business that turns Orders off for the monsoon
 *           finds every order still there in October.
 *
 * >>> X2F — the third state, LOCKED ("not in your plan"), is gone: every partner
 * plan has every module (Owner, 2026-10-04); the plan limits catalogue items only.
 * <<< X2F
 */

/**
 * The badge copy, by state. Catalogue keys rather than sentences: the STATE is
 * an enum the server and `moduleStateOf` both read, so only the label moves.
 */
// >>> X2F — every partner plan has every module (Owner, 2026-10-04): no LOCKED
// state, no lock icon, no "not in your plan" footer. Every row is a toggle.
const MODULE_STATE_KEY: Record<PartnerModuleState, string> = {
  ON: 'settings.modules.stateOn',
  OFF: 'settings.modules.stateOff',
};
// <<< X2F

export default function PartnerModulesScreen() {
  const { t } = useTranslation();
  const isDark = useColorScheme() === 'dark';
  const c = themeColors(isDark);
  const queryClient = useQueryClient();
  const { loading: gating, can, refresh: refreshEntitlements } = usePartnerEntitlements(); // X2F: plan limits no longer read here

  const mayManage = can('SETTINGS', 'FULL');

  const query = useQuery({
    queryKey: qk.partner.modules(),
    queryFn: partnerApi.modules,
    enabled: mayManage,
  });

  const [chosen, setChosen] = useState<PartnerModule[]>([]);
  const [baseline, setBaseline] = useState<PartnerModule[]>([]);
  const [saving, setSaving] = useState(false);

  // An empty stored list does not mean "nothing switched on" — it means the
  // partner has never chosen, and the server derives the set from their
  // `kind`. `effective` is that derived answer; falling back to it rather
  // than an empty draft is what stops the first save from switching
  // everything off for a partner who simply never opened this screen.
  useEffect(() => {
    if (!query.data) return;
    const known = query.data.chosen.filter((m): m is PartnerModule => (PARTNER_MODULES as readonly string[]).includes(m));
    const start = known.length > 0 ? known : query.data.effective;
    setChosen(start);
    setBaseline(start);
  }, [query.data]);

  const stateOf = useCallback(
    (key: PartnerModule): PartnerModuleState => (chosen.includes(key) ? 'ON' : 'OFF'), // X2F: the plan never locks a module
    [chosen],
  );

  const dirty = useMemo(() => {
    const a = [...chosen].sort().join(',');
    const b = [...baseline].sort().join(',');
    return a !== b;
  }, [chosen, baseline]);

  const toggle = (key: PartnerModule) => {
    setChosen((prev) => (prev.includes(key) ? prev.filter((m) => m !== key) : [...prev, key]));
  };

  const save = async () => {
    setSaving(true);
    try {
      const payload = [...chosen]; // X2F: every module may be chosen on every plan
      await partnerApi.saveModules(payload);
      setBaseline(payload);
      setChosen(payload);
      // Everything downstream of gate 2 changes with this: the tab bar, the
      // More menu, and every open screen's `can()`/`hasModule()`.
      await queryClient.invalidateQueries({ queryKey: qk.partner.modules() });
      refreshEntitlements();
      Alert.alert(t('settings.modules.savedTitle'), t('settings.modules.savedBody'));
    } catch (e: unknown) {
      Alert.alert(t('settings.modules.couldNotSave'), apiErrorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  if (gating) return <Screen c={c} title={t('settings.modules.title')}><Loading c={c} label={t('settings.modules.checkingAccess')} /></Screen>;

  if (!mayManage) {
    return (
      <Screen c={c} title={t('settings.modules.title')}>
        <ErrorBlock c={c} message={t('settings.modules.noPermission')} />
      </Screen>
    );
  }

  if (query.isError) {
    return <Screen c={c} title={t('settings.modules.title')}><ErrorBlock c={c} message={apiErrorMessage(query.error, t('settings.modules.couldNotLoad'))} onRetry={() => query.refetch()} /></Screen>;
  }

  if (query.isPending) return <Screen c={c} title={t('settings.modules.title')}><Loading c={c} label={t('settings.modules.loadingModules')} /></Screen>;

  return (
    <Screen
      c={c}
      title={t('settings.modules.title')}
      subtitle={t('settings.modules.subtitle')}
      floating={
        dirty ? (
          <View style={[styles.bottomBar, { backgroundColor: c.surface, borderTopColor: c.divider }]}>
            <Button onPress={() => setChosen(baseline)} disabled={saving}>{t('settings.modules.undo')}</Button>
            <Button mode="contained" onPress={save} loading={saving} disabled={saving} style={{ flex: 1 }}>
              {t('settings.modules.saveChanges')}
            </Button>
          </View>
        ) : undefined
      }
    >
      {PARTNER_MODULES.map((key) => {
        const state = stateOf(key);
        // `key` is the enum the server stores; only its LABEL is translated.
        const label = t(`modules.${key}.label`);
        const blurb = t(`modules.${key}.blurb`);
        // >>> X2F — no LOCKED rows: every module is a toggle on every plan.
        return (
          <Card key={key} c={c}>
            <View style={styles.headerRow}>
              <View style={{ flex: 1 }}>
                <View style={styles.titleRow}>
                  <Text style={{ fontSize: 15, fontWeight: '600', color: c.textPrimary }}>{label}</Text>
                  <Chip
                    compact
                    style={[styles.badge, { backgroundColor: state === 'ON' ? palette.brand[50] : c.surfaceVariant }]}
                    textStyle={{
                      fontSize: 10, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.3, marginVertical: 0,
                      color: state === 'ON' ? c.primary : c.textSecondary,
                    }}
                  >
                    {t(MODULE_STATE_KEY[state])}
                  </Chip>
                </View>
                <Text style={{ fontSize: 12.5, color: c.textSecondary, marginTop: 4, lineHeight: 17 }}>{blurb}</Text>
              </View>
              <Switch value={state === 'ON'} onValueChange={() => toggle(key)} color={c.primary} />
            </View>
          </Card>
          // <<< X2F
        );
      })}

      <Text style={{ fontSize: 11, color: c.textDisabled, lineHeight: 16 }}>
        {t('settings.modules.footNote')}
      </Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  headerRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  badge: { borderRadius: radii.pill },
  lockedFooter: {
    flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10, paddingTop: 10, borderTopWidth: StyleSheet.hairlineWidth,
  },
  bottomBar: {
    flexDirection: 'row', alignItems: 'center', gap: 10, padding: 16, borderTopWidth: StyleSheet.hairlineWidth,
  },
});
