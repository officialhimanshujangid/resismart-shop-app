import React from 'react';
import { StyleSheet, View, useColorScheme } from 'react-native';
import { IconButton } from 'react-native-paper';
import { router, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { themeColors } from '../../src/constants/colors';
import { useAuth } from '../../src/context/AuthContext';
import { Screen } from '../../src/features/more/ui';
import { SocietyInviteFlow } from '../../src/features/society/components/SocietyInviteFlow';

/**
 * The society invitation LINK — `resismart-shop://society-invite/<token>`, the
 * app twin of the web page `/society-invite/[token]` (CONTRACT-partner-P3 §11).
 *
 * At the ROOT beside `partner-invite/[token].tsx`, outside `(app)` and `(auth)`,
 * for the same reason: the by-token routes need no sign-in, so the link must
 * open whether or not anybody is signed in.
 */
export default function SocietyInviteLinkScreen() {
  const { t } = useTranslation();
  const c = themeColors(useColorScheme() === 'dark');
  const { token } = useLocalSearchParams<{ token: string }>();
  const { isAuthenticated } = useAuth();

  const close = () => {
    if (router.canGoBack()) router.back();
    else router.replace(isAuthenticated ? '/(app)/(tabs)' : '/(auth)/login');
  };

  return (
    <Screen
      c={c}
      title={t('society.invite.title')}
      back={false}
      help={false}
      right={<IconButton icon="close" size={24} onPress={close} accessibilityLabel={t('common.close')} />}
    >
      <View style={styles.column}>{token ? <SocietyInviteFlow token={String(token)} /> : null}</View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  column: { width: '100%', maxWidth: 640, alignSelf: 'center' },
});
