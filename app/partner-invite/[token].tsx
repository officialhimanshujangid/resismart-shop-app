import React from 'react';
import { StyleSheet, View, useColorScheme } from 'react-native';
import { IconButton } from 'react-native-paper';
import { router, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { themeColors } from '../../src/constants/colors';
import { useAuth } from '../../src/context/AuthContext';
import { LoadingOverlay } from '../../src/components/LoadingOverlay';
import { Screen } from '../../src/features/more/ui';
import { InviteAcceptFlow } from '../../src/features/owners/components/InviteAcceptFlow';
import { useOpenAcceptedBusiness } from '../../src/features/owners/useOpenAcceptedBusiness';

/**
 * The invitation LINK — `resismart-shop://partner-invite/<token>`, the app twin
 * of the web page `/partner-invite/[token]` (CONTRACT-partner-P0 §6.2).
 *
 * Deliberately at the ROOT, outside both `(app)` and `(auth)`: the by-token
 * routes need no sign-in, so the link must open whether or not anybody is
 * signed in, and neither protected group can promise that.
 */
export default function PartnerInviteLinkScreen() {
  const { t } = useTranslation();
  const c = themeColors(useColorScheme() === 'dark');
  const { token } = useLocalSearchParams<{ token: string }>();
  const { isAuthenticated } = useAuth();
  const { open, onAccepted, opening, finishLabel } = useOpenAcceptedBusiness();

  const close = () => {
    if (router.canGoBack()) router.back();
    else router.replace(isAuthenticated ? '/(app)/(tabs)' : '/(auth)/login');
  };

  return (
    <Screen
      c={c}
      title={t('owners.accept.title')}
      back={false}
      help={false}
      right={<IconButton icon="close" size={24} onPress={close} accessibilityLabel={t('common.close')} />}
    >
      <View style={styles.column}>
        {token ? (
          <InviteAcceptFlow
            address={{ token: String(token) }}
            onAccepted={onAccepted}
            onFinished={(r) => void open(r)}
            finishLabel={finishLabel}
          />
        ) : null}
      </View>
      <LoadingOverlay visible={opening} message={t('owners.accept.opening')} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  column: { width: '100%', maxWidth: 640, alignSelf: 'center' },
});
