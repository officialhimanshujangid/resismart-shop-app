import React, { useMemo } from 'react';
import { Alert } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { usePartnerEntitlements, usePlanUsage } from '../../../src/hooks';
import { apiErrorMessage, isUpgradeRequired } from '../../../src/api/axios';
import { partnerApi } from '../../../src/api/partner.api';
import { qk } from '../../../src/lib/queryKeys';
import { ServiceForm, ServiceMode, SERVICE_MODES, useCreateService } from '../../../src/features/services';

/**
 * New service. `max_services` is checked BEFORE this screen is even reached
 * (the list's Add button disables itself at the ceiling — `services/index.tsx`),
 * but a plan change or a second device could still land here at the limit, so
 * `cap.atLimit` is re-checked at submit time too.
 */
export default function CreateServiceScreen() {
  const { t } = useTranslation();
  const { can } = usePartnerEntitlements();
  const canManage = can('CATALOG_MANAGE', 'FULL');
  const { capacity } = usePlanUsage();
  const cap = capacity('max_services');

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

  const createService = useCreateService();

  return (
    <ServiceForm
      initial={null}
      categories={categoriesQuery.data ?? []}
      allowedModes={allowedModes}
      canManage={canManage}
      submitLabel={t('services.create.submit')}
      submitting={createService.isPending}
      onSubmit={(body) => {
        if (cap.atLimit) {
          Alert.alert(t('services.create.limitTitle'), t('services.create.limitBody'));
          return;
        }
        createService.mutate(body, {
          onSuccess: () => router.back(),
          onError: (e: unknown) => {
            // The server's own refusal is what the partner reads here — it names
            // the ceiling and the plan; only the heading is ours.
            if (isUpgradeRequired(e)) {
              Alert.alert(t('services.create.limitTitle'), apiErrorMessage(e));
              return;
            }
            Alert.alert(t('services.create.addFailed'), apiErrorMessage(e));
          },
        });
      }}
    />
  );
}
