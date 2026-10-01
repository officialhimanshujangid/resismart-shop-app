import React, { useState } from 'react';
import { StyleSheet, View, useColorScheme } from 'react-native';
import { Button, Text } from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';

import { themeColors } from '../../../constants/colors';
import { apiErrorMessage } from '../../../api/axios';
import { useAuth } from '../../../context/AuthContext';

/**
 * What the app shows INSTEAD of the shop when the open business is archived
 * (CONTRACT-partner-P0 §3): a clear state with a way out — never a wall of
 * MODULE_NOT_AVAILABLE errors or a retry loop. Nothing was deleted; only
 * ResiSmart can restore it.
 */
export function BusinessArchivedScreen({ businessName }: { businessName?: string }) {
  const { t } = useTranslation();
  const c = themeColors(useColorScheme() === 'dark');
  const { availableContexts, profile, leaveBusiness, logout } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const hasOther = availableContexts.some((ctx) => ctx.contextId !== profile?.contextId);

  const leave = () => {
    setBusy(true);
    setError(null);
    leaveBusiness('ARCHIVED')
      .catch((e: unknown) => setError(apiErrorMessage(e)))
      .finally(() => setBusy(false));
  };

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: c.background }]}>
      <View style={styles.box}>
        <MaterialCommunityIcons name="archive-outline" size={44} color={c.textSecondary} />
        <Text style={[styles.title, { color: c.textPrimary }]}>
          {t('archive.gateTitle', { business: businessName || profile?.tenantName || t('more.yourBusiness') })}
        </Text>
        <Text style={[styles.body, { color: c.textSecondary }]}>{t('archive.gateBody')}</Text>
        {error ? <Text style={[styles.body, { color: c.error }]}>{error}</Text> : null}
        <View style={styles.buttons}>
          {hasOther ? (
            <Button mode="contained" onPress={leave} loading={busy} disabled={busy} style={styles.btn}>
              {t('archive.gateSwitch')}
            </Button>
          ) : null}
          <Button
            mode={hasOther ? 'text' : 'contained'}
            onPress={() => { void logout(); }}
            disabled={busy}
            style={styles.btn}
          >
            {t('more.signOut')}
          </Button>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'center' },
  box: { alignItems: 'center', gap: 12, paddingHorizontal: 24, width: '100%', maxWidth: 520, alignSelf: 'center' },
  title: { fontSize: 18, fontWeight: '700', textAlign: 'center' },
  body: { fontSize: 13.5, lineHeight: 20, textAlign: 'center' },
  buttons: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 8, marginTop: 8 },
  btn: { borderRadius: 12 },
});
