import React, { useMemo } from 'react';
import { Alert, View, StyleSheet, useColorScheme } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { themeColors } from '../../../src/constants/colors';
import { usePartnerEntitlements } from '../../../src/hooks';
import { apiErrorMessage } from '../../../src/api/axios';
import { ErrorBlock } from '../../../src/features/more/ui';
import { SkeletonList } from '../../../src/components/ui'; // M23
import { partnerApi } from '../../../src/api/partner.api';
import { qk } from '../../../src/lib/queryKeys';
import {
  ServiceForm, ServiceMode, SERVICE_MODES, useService, useUpdateService, useWithdrawService,
} from '../../../src/features/services';

export default function ServiceDetailScreen() {
  const { t } = useTranslation();
  const isDark = useColorScheme() === 'dark';
  const c = themeColors(isDark);
  const { id } = useLocalSearchParams<{ id: string }>();
  const { can } = usePartnerEntitlements();
  const canManage = can('CATALOG_MANAGE', 'FULL');

  const serviceQuery = useService(id);
  const categoriesQuery = useQuery({
    queryKey: qk.onboarding.categories(),
    queryFn: () => partnerApi.categories(),
    staleTime: 60_000,
  });
  const meQuery = useQuery({ queryKey: qk.partner.me(), queryFn: partnerApi.me });
  const allowedModes = useMemo<ServiceMode[] | null>(() => {
    if (!meQuery.isSuccess) return null;
    const modes = meQuery.data.partner.serviceModes;
    return (Array.isArray(modes) ? modes : []).filter((m): m is ServiceMode => (SERVICE_MODES as readonly string[]).includes(m));
  }, [meQuery.isSuccess, meQuery.data]);

  const updateService = useUpdateService(id);
  const withdrawService = useWithdrawService();

  const confirmWithdraw = () => {
    if (!serviceQuery.data) return;
    Alert.alert(
      // The same two catalogue entries `services/index.tsx#confirmWithdraw`
      // asks with — one dialog, word for word, in both places.
      t('services.withdraw.title', { name: serviceQuery.data.name }),
      t('services.withdraw.body'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('services.withdraw.confirm'), style: 'destructive',
          onPress: () => withdrawService.mutate(id, {
            onSuccess: () => router.back(),
            onError: (e: unknown) => Alert.alert(t('services.detail.actionFailed'), apiErrorMessage(e)),
          }),
        },
      ],
    );
  };

  const reoffer = () => {
    updateService.mutate({ isActive: true }, {
      onError: (e: unknown) => Alert.alert(t('services.detail.actionFailed'), apiErrorMessage(e)),
    });
  };

  /**
   * The same shape as `catalog/[id].tsx`, and for the same reason: `isLoading`
   * settles to false on failure as well as success and `data` stays undefined,
   * so `isLoading || !data` was a spinner with no exit — a partner who tapped a
   * service on a bad connection could only press back. `isPaused` covers
   * offline, where `onlineManager` (see `lib/queryClient.ts`) holds the request
   * rather than firing it into a dead radio.
   */
  const loadError = serviceQuery.isError
    ? apiErrorMessage(serviceQuery.error, t('services.detail.loadFailed'))
    : serviceQuery.isPending && serviceQuery.isPaused
      ? t('services.detail.noConnection')
      : null;

  if (loadError) {
    return (
      <View style={[styles.center, { backgroundColor: c.background }]}>
        <ErrorBlock c={c} message={loadError} onRetry={() => void serviceQuery.refetch()} />
      </View>
    );
  }

  if (!serviceQuery.data) {
    return (
      // M23 — a skeleton, not a lone spinner (DS v1).
      <View style={[styles.center, { backgroundColor: c.background }]}>
        <SkeletonList rows={5} />
      </View>
    );
  }

  return (
    <ServiceForm
      initial={serviceQuery.data}
      categories={categoriesQuery.data ?? []}
      allowedModes={allowedModes}
      canManage={canManage}
      submitLabel={serviceQuery.data.isActive ? t('services.detail.saveChanges') : t('common.save')}
      submitting={updateService.isPending}
      onSubmit={(body) => {
        updateService.mutate(body, {
          onSuccess: () => router.back(),
          onError: (e: unknown) => Alert.alert(t('services.detail.saveFailed'), apiErrorMessage(e)),
        });
      }}
      footer={
        canManage
          ? {
            isActive: serviceQuery.data.isActive,
            withdrawing: withdrawService.isPending,
            onWithdraw: confirmWithdraw,
            onReoffer: reoffer,
          }
          : undefined
      }
    />
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
