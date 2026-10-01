import { Alert } from 'react-native';
import { router } from 'expo-router';

import { apiErrorCode, apiErrorMessage } from '../../api/axios';
import i18n from '../../i18n';

/**
 * A failed save, said as an alert — with ONE refusal given a way forward.
 *
 * `PARTNER_ADMIN_EMAIL_USE_HANDOVER` (CONTRACT-partner-P0 §1): the admin email
 * decides ownership, so a screen that posted a new one is told to use Team →
 * Owners instead. The contract asks for a button straight there; every other
 * refusal is the usual coded / server / generic sentence (`apiErrorMessage`).
 */
export function alertApiError(title: string, err: unknown): void {
  const message = apiErrorMessage(err);
  if (apiErrorCode(err) === 'PARTNER_ADMIN_EMAIL_USE_HANDOVER') {
    Alert.alert(title, message, [
      { text: i18n.t('common.close'), style: 'cancel' },
      { text: i18n.t('owners.goToOwners'), onPress: () => router.push('/owners') },
    ]);
    return;
  }
  Alert.alert(title, message);
}
