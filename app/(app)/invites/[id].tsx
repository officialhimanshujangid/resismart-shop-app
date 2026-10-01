import React from 'react';
import { StyleSheet, View, useColorScheme } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { themeColors } from '../../../src/constants/colors';
import { LoadingOverlay } from '../../../src/components/LoadingOverlay';
import { Screen } from '../../../src/features/more/ui';
import { InviteAcceptFlow } from '../../../src/features/owners/components/InviteAcceptFlow';
import { useOpenAcceptedBusiness } from '../../../src/features/owners/useOpenAcceptedBusiness';

/** An invitation sent to me, opened from "Invitations for you" (signed in, by id). */
export default function MyInviteScreen() {
  const { t } = useTranslation();
  const c = themeColors(useColorScheme() === 'dark');
  const { id } = useLocalSearchParams<{ id: string }>();
  const { open, onAccepted, opening, finishLabel } = useOpenAcceptedBusiness();

  return (
    <Screen c={c} title={t('owners.accept.title')} help={false}>
      <View style={styles.column}>
        {id ? (
          <InviteAcceptFlow
            address={{ id: String(id) }}
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
