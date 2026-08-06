import React, { useMemo } from 'react';
import { Alert, View, StyleSheet, useColorScheme } from 'react-native';
import { ActivityIndicator } from 'react-native-paper';
import { useQuery } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';

import { themeColors } from '../../../src/constants/colors';
import { usePartnerEntitlements } from '../../../src/hooks';
import { apiErrorMessage } from '../../../src/api/axios';
import { partnerApi } from '../../../src/api/partner.api';
import { qk } from '../../../src/lib/queryKeys';
import {
  ServiceForm, ServiceMode, SERVICE_MODES, useService, useUpdateService, useWithdrawService,
} from '../../../src/features/services';

export default function ServiceDetailScreen() {
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
      `Stop offering "${serviceQuery.data.name}"?`,
      'Residents stop seeing it and it cannot be booked. Anything already booked keeps its own record of the name and price and goes ahead as agreed.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Stop offering it', style: 'destructive',
          onPress: () => withdrawService.mutate(id, {
            onSuccess: () => router.back(),
            onError: (e: unknown) => Alert.alert('Could not do that', apiErrorMessage(e)),
          }),
        },
      ],
    );
  };

  const reoffer = () => {
    updateService.mutate({ isActive: true }, {
      onError: (e: unknown) => Alert.alert('Could not do that', apiErrorMessage(e)),
    });
  };

  if (serviceQuery.isLoading || !serviceQuery.data) {
    return (
      <View style={[styles.center, { backgroundColor: c.background }]}>
        <ActivityIndicator color={c.primary} />
      </View>
    );
  }

  return (
    <ServiceForm
      initial={serviceQuery.data}
      categories={categoriesQuery.data ?? []}
      allowedModes={allowedModes}
      canManage={canManage}
      submitLabel={serviceQuery.data.isActive ? 'Save changes' : 'Save'}
      submitting={updateService.isPending}
      onSubmit={(body) => {
        updateService.mutate(body, {
          onSuccess: () => router.back(),
          onError: (e: unknown) => Alert.alert('Could not save changes', apiErrorMessage(e)),
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
