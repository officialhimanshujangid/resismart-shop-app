import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Text } from 'react-native-paper';
import { useTranslation } from 'react-i18next';

import { ColorScheme } from '../../../constants/colors';
import { ActionRow, PillButton } from '../../p1/ui';

/** "Showing 30 of 112" and a Load more pill (never stretched). Nothing when the list is empty. */
export function PagerFooter({
  c, shown, total, hasMore, loading, onMore, testID,
}: {
  c: ColorScheme; shown: number; total: number; hasMore: boolean; loading: boolean; onMore: () => void; testID?: string;
}) {
  const { t } = useTranslation();
  if (shown === 0) return null;
  return (
    <View style={styles.wrap} testID={testID}>
      <Text style={{ color: c.textSecondary, fontSize: 12 }}>{t('p2.common.showing', { shown, total: Math.max(total, shown) })}</Text>
      {hasMore ? (
        <ActionRow>
          <PillButton
            c={c}
            tone="outline"
            icon="chevron-down"
            label={loading ? t('common.loading') : t('p2.pharmacy.loadMore')}
            onPress={onMore}
            disabled={loading}
          />
        </ActionRow>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', gap: 8, paddingVertical: 12 },
});
