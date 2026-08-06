import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, StyleSheet, View, useColorScheme } from 'react-native';
import { Button, Switch, Text } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import { themeColors, radii, palette } from '../../../src/constants/colors';
import { usePartnerEntitlements, PARTNER_MODULE_INFO, planSells, PartnerModuleState } from '../../../src/hooks';
import { partnerApi } from '../../../src/api/partner.api';
import { PARTNER_MODULES, PartnerModule } from '../../../src/types/api-contract.generated';
import { qk } from '../../../src/lib/queryKeys';
import { apiErrorMessage } from '../../../src/api/axios';
import { Card, ErrorBlock, Loading, Screen } from '../../../src/features/more/ui';

/**
 * Gate 2 — what this business actually uses. C7, mirroring web
 * `partner/settings/modules/page.tsx`.
 *
 * Three states, and the difference between the last two is the whole point:
 *
 *   ON      switched on, and the partner may switch it off.
 *   OFF     switched off by the partner. One tap brings it back — nothing is
 *           deleted, so a business that turns Orders off for the monsoon
 *           finds every order still there in October.
 *   LOCKED  their plan does not sell it. Shown WITH the price attached
 *           rather than hidden — the one screen in the app where hiding is
 *           the wrong answer. A partner who never learns Promotion exists
 *           never buys it.
 *
 * Gate 2 can only ever NARROW gate 1 — switching a module on here cannot
 * give the business something the plan did not sell, the server intersects
 * the two on every request whatever this screen stored — so a LOCKED row is
 * genuinely not a toggle, and is not drawn as one.
 */

const MODULE_STATE_COPY: Record<PartnerModuleState, string> = {
  ON: 'In use',
  OFF: 'Switched off',
  LOCKED: 'Not in your plan',
};

export default function PartnerModulesScreen() {
  const isDark = useColorScheme() === 'dark';
  const c = themeColors(isDark);
  const queryClient = useQueryClient();
  const { loading: gating, can, entitlements, refresh: refreshEntitlements } = usePartnerEntitlements();

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
    (key: PartnerModule): PartnerModuleState => {
      // Locked is decided by the PLAN alone, never by the local draft, so a
      // row the partner cannot buy their way out of by tapping never appears
      // to move.
      const info = PARTNER_MODULE_INFO[key];
      if (!planSells(entitlements.plan.limits, info.capability)) return 'LOCKED';
      return chosen.includes(key) ? 'ON' : 'OFF';
    },
    [chosen, entitlements.plan.limits],
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
      // Locked modules are never sent — the server would drop them anyway,
      // but a request asking for something the plan does not sell reads, in
      // a log, exactly like an attempt to get it.
      const payload = chosen.filter((m) => stateOf(m) !== 'LOCKED');
      await partnerApi.saveModules(payload);
      setBaseline(payload);
      setChosen(payload);
      // Everything downstream of gate 2 changes with this: the tab bar, the
      // More menu, and every open screen's `can()`/`hasModule()`.
      await queryClient.invalidateQueries({ queryKey: qk.partner.modules() });
      refreshEntitlements();
      Alert.alert('Saved', 'Your modules are updated.');
    } catch (e: unknown) {
      Alert.alert('Could not save your modules', apiErrorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  if (gating) return <Screen c={c} title="Modules"><Loading c={c} label="Checking your access…" /></Screen>;

  if (!mayManage) {
    return (
      <Screen c={c} title="Modules">
        <ErrorBlock
          c={c}
          message="Switching a module on or off changes what the whole business sells, so it needs the Settings permission at &quot;can change&quot;. Ask the owner if you need this."
        />
      </Screen>
    );
  }

  if (query.isError) {
    return <Screen c={c} title="Modules"><ErrorBlock c={c} message={apiErrorMessage(query.error, 'We could not load your modules.')} onRetry={() => query.refetch()} /></Screen>;
  }

  if (query.isPending) return <Screen c={c} title="Modules"><Loading c={c} label="Loading your modules…" /></Screen>;

  return (
    <Screen
      c={c}
      title="Modules"
      subtitle="Choose what this business uses"
      floating={
        dirty ? (
          <View style={[styles.bottomBar, { backgroundColor: c.surface, borderTopColor: c.divider }]}>
            <Button onPress={() => setChosen(baseline)} disabled={saving}>Undo</Button>
            <Button mode="contained" onPress={save} loading={saving} disabled={saving} style={{ flex: 1 }}>
              Save changes
            </Button>
          </View>
        ) : undefined
      }
    >
      {PARTNER_MODULES.map((key) => {
        const info = PARTNER_MODULE_INFO[key];
        const state = stateOf(key);
        const locked = state === 'LOCKED';
        return (
          <Card
            key={key}
            c={c}
            style={locked ? { backgroundColor: isDark ? palette.dark.elevated : palette.coral.soft } : undefined}
          >
            <View style={styles.headerRow}>
              <View style={{ flex: 1 }}>
                <View style={styles.titleRow}>
                  <Text style={{ fontSize: 15, fontWeight: '700', color: c.textPrimary }}>{info.label}</Text>
                  <View
                    style={[
                      styles.badge,
                      {
                        backgroundColor: state === 'ON' ? palette.brand[50] : state === 'OFF' ? c.surfaceVariant : palette.coral[100],
                      },
                    ]}
                  >
                    <Text
                      style={{
                        fontSize: 10, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.3,
                        color: state === 'ON' ? c.primary : state === 'OFF' ? c.textSecondary : palette.coral[600],
                      }}
                    >
                      {MODULE_STATE_COPY[state]}
                    </Text>
                  </View>
                </View>
                <Text style={{ fontSize: 12.5, color: c.textSecondary, marginTop: 4, lineHeight: 17 }}>{info.blurb}</Text>
              </View>

              {locked ? (
                <MaterialCommunityIcons name="lock-outline" size={20} color={palette.coral[600]} />
              ) : (
                <Switch value={state === 'ON'} onValueChange={() => toggle(key)} color={c.primary} />
              )}
            </View>

            {locked && (
              <View style={[styles.lockedFooter, { borderTopColor: palette.coral[100] }]}>
                <Text style={{ fontSize: 11.5, color: palette.coral[600], flex: 1, lineHeight: 16 }}>
                  Your current plan does not include this. Ask your ResiSmart contact to upgrade your plan —
                  it switches on for everyone here straight away.
                </Text>
              </View>
            )}
          </Card>
        );
      })}

      <Text style={{ fontSize: 11, color: c.textDisabled, lineHeight: 16 }}>
        Switching a module off does not change anybody&apos;s role. The permissions for it simply stop being
        offered until it is back on, so a month away from Orders does not quietly reset who may handle them.
      </Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  headerRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  badge: { borderRadius: radii.pill, paddingHorizontal: 8, paddingVertical: 2 },
  lockedFooter: {
    flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10, paddingTop: 10, borderTopWidth: StyleSheet.hairlineWidth,
  },
  bottomBar: {
    flexDirection: 'row', alignItems: 'center', gap: 10, padding: 16, borderTopWidth: StyleSheet.hairlineWidth,
  },
});
