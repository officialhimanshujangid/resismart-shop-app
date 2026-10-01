import { useCallback, useState } from 'react';
import { Alert } from 'react-native';
import { router } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';

import { useAuth } from '../../context/AuthContext';
import { qk } from '../../lib/queryKeys';
import type { AcceptResult } from './types';

/**
 * After an invitation is accepted: a signed-in invitee switches straight into
 * the business (contract §2.3 — "refresh/switch context to see the business");
 * a signed-out one goes to sign-in with the SAME phone/email.
 */
export function useOpenAcceptedBusiness() {
  const { t } = useTranslation();
  const { isAuthenticated, switchToContext } = useAuth();
  const queryClient = useQueryClient();
  const [opening, setOpening] = useState(false);

  const onAccepted = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: qk.owners.mine() });
  }, [queryClient]);

  const open = useCallback(
    async (result: AcceptResult) => {
      if (!isAuthenticated) {
        router.replace('/(auth)/login');
        return;
      }
      setOpening(true);
      try {
        await switchToContext(`partner:${result.partnerId}`);
        router.replace('/(app)/(tabs)');
      } catch (e) {
        Alert.alert(t('owners.accept.openFailedTitle'), e instanceof Error ? e.message : t('owners.accept.openFailedBody'));
      } finally {
        setOpening(false);
      }
    },
    [isAuthenticated, switchToContext, t],
  );

  return {
    open,
    onAccepted,
    opening,
    finishLabel: isAuthenticated ? t('owners.accept.openBusiness') : t('owners.accept.signIn'),
  };
}
