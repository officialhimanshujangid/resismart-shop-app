import React, { useState } from 'react';
import { Alert, StyleSheet, View, useColorScheme } from 'react-native';
import { Text } from 'react-native-paper';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';

import { themeColors } from '../../../src/constants/colors';
import { qk } from '../../../src/lib/queryKeys';
import { partnerApi } from '../../../src/api/partner.api';
import { apiErrorMessage } from '../../../src/api/axios';
import { useAuth } from '../../../src/context/AuthContext';
import { LoadingOverlay } from '../../../src/components/LoadingOverlay';
import { Card, ErrorBlock, Loading, Screen } from '../../../src/features/more/ui';
import { isOwnerSession } from '../../../src/features/owners/access';
import { ArchiveBusinessForm } from '../../../src/features/owners/components/ArchiveBusinessForm';

/**
 * Archive this business (CONTRACT-partner-P0 §6.3). Owners only. After
 * success the owner is taken out of the business: to another one they run, or
 * signed out with a sentence on the sign-in screen saying why.
 */
export default function ArchiveBusinessScreen() {
  const { t } = useTranslation();
  const c = themeColors(useColorScheme() === 'dark');
  const { profile, leaveBusiness } = useAuth();
  const owner = isOwnerSession(profile);
  const me = useQuery({ queryKey: qk.partner.me(), queryFn: partnerApi.me, enabled: owner });
  const [leaving, setLeaving] = useState(false);

  const afterArchive = () => {
    setLeaving(true);
    leaveBusiness('ARCHIVED')
      .catch((e: unknown) => Alert.alert(t('archive.leaveFailedTitle'), apiErrorMessage(e)))
      .finally(() => setLeaving(false));
  };

  return (
    <Screen c={c} title={t('archive.screenTitle')} rise>
      <View style={styles.column}>
        {!owner ? (
          <Card c={c}>
            <Text style={{ color: c.textPrimary, fontSize: 13.5, lineHeight: 19 }}>{t('errors.PARTNER_OWNER_ONLY')}</Text>
          </Card>
        ) : me.isPending ? (
          <Loading c={c} skeleton={3} />
        ) : me.isError ? (
          <ErrorBlock c={c} message={apiErrorMessage(me.error)} onRetry={() => void me.refetch()} />
        ) : (
          <ArchiveBusinessForm
            c={c}
            businessName={me.data.partner.name}
            onArchived={() =>
              Alert.alert(t('archive.doneTitle'), t('archive.doneBody', { business: me.data.partner.name }), [
                { text: t('common.ok'), onPress: afterArchive },
              ], { cancelable: false })
            }
          />
        )}
      </View>
      <LoadingOverlay visible={leaving} message={t('archive.leaving')} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  column: { width: '100%', maxWidth: 640, alignSelf: 'center' },
});
