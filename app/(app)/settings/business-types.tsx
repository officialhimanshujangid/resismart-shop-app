import React, { useState } from 'react';
import { Alert, useColorScheme, View } from 'react-native';
import { Snackbar, Text } from 'react-native-paper';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';

import { themeColors } from '../../../src/constants/colors';
import { usePartnerEntitlements } from '../../../src/hooks';
import { apiErrorMessage } from '../../../src/api/axios';
import { ErrorBlock, Loading, Screen } from '../../../src/features/more/ui';
import { Banner } from '../../../src/features/p1/ui';
import { categoryModulesApi, p2Keys } from '../../../src/features/p2/api';
import { CategoryModulesView, P2Module, P2_SETTINGS_KEY } from '../../../src/features/p2/modules';
import { ModuleSwitchCard } from '../../../src/features/p2/components/ModuleSwitchCard';
import { ModuleSettingsSheet } from '../../../src/features/p2/components/ModuleSettingsSheet';

/**
 * Settings → Business type modules (CONTRACT-partner-P2 §5, web W1 twin).
 *
 * Four switches — Pharmacy, Subscriptions & tuition, Appointments, Jobs — off by
 * default and free on every plan. Switching one off deletes nothing (batch
 * tracking is suspended, not lost). Each has its own settings, which may be set
 * up BEFORE the module is switched on. SETTINGS READ to look, FULL to change.
 */
export default function BusinessTypesScreen() {
  const { t } = useTranslation();
  const c = themeColors(useColorScheme() === 'dark');
  const queryClient = useQueryClient();
  const { can, refresh } = usePartnerEntitlements();
  const canManage = can('SETTINGS', 'FULL');
  const [settingsFor, setSettingsFor] = useState<P2Module | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [settingsError, setSettingsError] = useState<string | null>(null);

  const view = useQuery({ queryKey: p2Keys.modules(), queryFn: categoryModulesApi.get });

  const afterChange = (next: CategoryModulesView) => {
    queryClient.setQueryData(p2Keys.modules(), next);
    // The doors (More, Today, the P2 screens) are gated on entitlements.
    refresh();
    void queryClient.invalidateQueries({ queryKey: p2Keys.all() });
  };

  const toggle = useMutation({
    mutationFn: ({ key, on }: { key: P2Module; on: boolean }) => categoryModulesApi.toggle(key, on),
    onSuccess: (next, vars) => {
      setError(null);
      afterChange(next);
      setToast(t(vars.on ? 'p2.settings.switchedOn' : 'p2.settings.switchedOff', { module: t(`p2.settings.modules.${vars.key}.label`) }));
    },
    onError: (e) => setError(apiErrorMessage(e, t('p2.common.saveFailed'))),
  });

  const saveSettings = useMutation({
    mutationFn: ({ key, body }: { key: P2Module; body: Record<string, unknown> }) =>
      categoryModulesApi.saveSettings(P2_SETTINGS_KEY[key], body),
    onSuccess: (settings) => {
      setSettingsError(null);
      const cur = queryClient.getQueryData<CategoryModulesView>(p2Keys.modules());
      if (cur) queryClient.setQueryData(p2Keys.modules(), { ...cur, settings });
      setSettingsFor(null);
      setToast(t('p2.settings.saved'));
    },
    onError: (e) => setSettingsError(apiErrorMessage(e, t('p2.common.saveFailed'))),
  });

  const onToggle = (key: P2Module, on: boolean) => {
    if (on) { toggle.mutate({ key, on }); return; }
    Alert.alert(
      t('p2.settings.offTitle', { module: t(`p2.settings.modules.${key}.label`) }),
      t('p2.settings.offBody'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        { text: t('p2.settings.offConfirm'), style: 'destructive', onPress: () => toggle.mutate({ key, on: false }) },
      ],
    );
  };

  const title = t('p2.settings.title');
  if (view.isPending) return <Screen c={c} title={title}><Loading c={c} /></Screen>;
  if (view.isError || !view.data) {
    return <Screen c={c} title={title}><ErrorBlock c={c} message={apiErrorMessage(view.error, t('p2.common.loadFailed'))} onRetry={() => view.refetch()} /></Screen>;
  }

  return (
    <Screen
      c={c}
      title={title}
      floating={<Snackbar visible={!!toast} onDismiss={() => setToast(null)} duration={3000}>{toast}</Snackbar>}
    >
      <Text style={{ color: c.textSecondary, fontSize: 13, lineHeight: 19 }}>{t('p2.settings.intro')}</Text>
      {!canManage ? <Banner c={c} body={t('p2.common.viewOnly')} /> : null}
      {error ? <Banner c={c} tone="error" body={error} testID="p2-toggle-error" /> : null}
      <View style={{ gap: 12 }}>
        {view.data.modules.map((row) => (
          <ModuleSwitchCard
            key={row.key}
            c={c}
            row={row}
            canManage={canManage}
            busy={toggle.isPending}
            onToggle={(on) => onToggle(row.key, on)}
            onSettings={() => { setSettingsError(null); setSettingsFor(row.key); }}
          />
        ))}
      </View>
      <ModuleSettingsSheet
        c={c}
        module={settingsFor}
        settings={view.data.settings}
        visible={settingsFor !== null}
        canManage={canManage}
        saving={saveSettings.isPending}
        error={settingsError}
        onSave={(body) => settingsFor && saveSettings.mutate({ key: settingsFor, body })}
        onDismiss={() => setSettingsFor(null)}
      />
    </Screen>
  );
}
