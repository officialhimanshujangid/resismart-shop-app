import React, { useEffect, useMemo, useState } from 'react';
import { Alert, StyleSheet, useColorScheme, View } from 'react-native';
import { IconButton, Snackbar, Text } from 'react-native-paper';
import { useTranslation } from 'react-i18next';

import { themeColors } from '../../../src/constants/colors';
import { apiErrorMessage } from '../../../src/api/axios';
import { formatPaise } from '../../../src/lib/money';
import { Card, EmptyBlock, ErrorBlock, Loading, Screen, SectionLabel } from '../../../src/features/more/ui';
import { ActionRow, PillButton } from '../../../src/features/p1/ui';
import { useCommerceAccess } from '../../../src/features/commerce/access';
import { useQuickKeys, useSetQuickKeys } from '../../../src/features/commerce/hooks';
import { moveItem } from '../../../src/features/commerce/logic';
import { COMMERCE_BOUNDS, type QuickKey } from '../../../src/features/commerce/types';
import { CommerceHint, NoAccess, ProductPickerSheet } from '../../../src/features/commerce/components/ui';
import { QuickKeysGrid } from '../../../src/features/commerce/components/QuickKeysGrid';

/**
 * "Quick keys" (C6): the up-to-24 items the counter shows as big tiles. Pick,
 * put in order, Save. Saving an empty list turns quick keys off. Reading needs
 * INVOICING_VIEW; changing them INVOICING_MANAGE (the route's guards).
 */
export default function QuickKeysScreen() {
  const { t } = useTranslation();
  const c = themeColors(useColorScheme() === 'dark');
  const access = useCommerceAccess();
  const canRead = access.counter.canReadQuickKeys;
  const canEdit = access.counter.canSell;
  const query = useQuickKeys(canRead);
  const save = useSetQuickKeys();
  const [keys, setKeys] = useState<QuickKey[]>([]);
  const [picking, setPicking] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { if (query.data) setKeys(query.data); }, [query.data]);

  const changed = useMemo(
    () => JSON.stringify(keys.map((k) => k.productId)) !== JSON.stringify((query.data ?? []).map((k) => k.productId)),
    [keys, query.data],
  );

  const doSave = () => {
    setError(null);
    save.mutate(keys.map((k) => k.productId), {
      onSuccess: (next) => { setKeys(next); setSaved(true); },
      onError: (e) => setError(apiErrorMessage(e)),
    });
  };
  const onSave = () => {
    if (!keys.length) {
      Alert.alert(t('commerce.quickKeys.clearTitle'), t('commerce.quickKeys.clearBody'), [
        { text: t('common.cancel'), style: 'cancel' },
        { text: t('commerce.quickKeys.clearConfirm'), style: 'destructive', onPress: doSave },
      ]);
      return;
    }
    doSave();
  };

  if (!canRead) {
    return <Screen title={t('commerce.quickKeys.title')} c={c}><NoAccess c={c} /></Screen>;
  }

  return (
    <Screen
      title={t('commerce.quickKeys.title')}
      c={c}
      floating={<Snackbar visible={saved} onDismiss={() => setSaved(false)} duration={2000}>{t('commerce.common.saved')}</Snackbar>}
    >
      <View style={styles.wrap}>
        <CommerceHint c={c} helpKey="quickKeys" />
        {query.isPending ? <Loading c={c} /> : null}
        {query.isError ? <ErrorBlock c={c} message={apiErrorMessage(query.error)} onRetry={() => void query.refetch()} /> : null}
        {query.isSuccess ? (
          <>
            {canEdit ? (
              <ActionRow>
                <PillButton
                  c={c}
                  icon="plus"
                  label={t('commerce.quickKeys.add')}
                  onPress={() => setPicking(true)}
                  disabled={keys.length >= COMMERCE_BOUNDS.maxQuickKeys}
                  testID="quick-keys-add"
                />
                <PillButton c={c} tone="outline" icon="content-save-outline" label={t('common.save')} onPress={onSave} disabled={!changed || save.isPending} testID="quick-keys-save" />
              </ActionRow>
            ) : null}
            <Text style={{ color: c.textSecondary, fontSize: 12.5 }} testID="quick-keys-count">
              {t('commerce.quickKeys.count', { count: keys.length, max: COMMERCE_BOUNDS.maxQuickKeys })}
            </Text>
            {keys.length === 0 ? (
              <EmptyBlock c={c} icon="view-grid-plus-outline" title={t('commerce.quickKeys.emptyTitle')} body={t('commerce.quickKeys.emptyBody')} />
            ) : (
              <Card c={c} style={{ padding: 0, overflow: 'hidden' }}>
                {keys.map((k, i) => (
                  <View key={k.productId} style={[styles.row, { borderColor: c.divider }]} testID={`quick-key-row-${i}`}>
                    <Text style={[styles.pos, { color: c.textSecondary }]}>{i + 1}</Text>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={{ color: c.textPrimary, fontWeight: '600' }} numberOfLines={1}>{k.name}</Text>
                      <Text style={{ color: c.textSecondary, fontSize: 12 }} numberOfLines={1}>{`${formatPaise(k.sellPaise)} · ${k.unit}`}</Text>
                    </View>
                    {canEdit ? (
                      <>
                        <IconButton icon="arrow-up" size={20} disabled={i === 0} onPress={() => setKeys((x) => moveItem(x, i, i - 1))}
                          accessibilityLabel={t('commerce.quickKeys.up', { name: k.name })} testID={`quick-key-up-${i}`} />
                        <IconButton icon="arrow-down" size={20} disabled={i === keys.length - 1} onPress={() => setKeys((x) => moveItem(x, i, i + 1))}
                          accessibilityLabel={t('commerce.quickKeys.down', { name: k.name })} />
                        <IconButton icon="close" size={20} onPress={() => setKeys((x) => x.filter((_, j) => j !== i))}
                          accessibilityLabel={t('commerce.common.removeItem', { name: k.name })} />
                      </>
                    ) : null}
                  </View>
                ))}
              </Card>
            )}
            {keys.length ? (
              <>
                <SectionLabel c={c}>{t('commerce.quickKeys.preview')}</SectionLabel>
                <QuickKeysGrid c={c} keys={keys} onTap={() => undefined} />
              </>
            ) : null}
            {error ? <Text style={{ color: c.error, fontSize: 13 }} testID="quick-keys-error">{error}</Text> : null}
          </>
        ) : null}
      </View>
      <ProductPickerSheet
        visible={picking}
        onDismiss={() => setPicking(false)}
        title={t('commerce.quickKeys.pickTitle')}
        multi
        hideParents
        picked={keys.map((k) => k.productId)}
        onPick={(p) => setKeys((x) => {
          if (x.some((k) => k.productId === p._id)) return x.filter((k) => k.productId !== p._id);
          if (x.length >= COMMERCE_BOUNDS.maxQuickKeys) return x;
          return [...x, { productId: p._id, name: p.name, unit: p.unit, sellPaise: p.sellPaise, ...(p.trackStock ? { stockQty: p.stockQty } : {}) }];
        })}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 12, width: '100%', maxWidth: 720, alignSelf: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingLeft: 12, minHeight: 56, borderBottomWidth: StyleSheet.hairlineWidth },
  pos: { width: 22, fontWeight: '700', textAlign: 'center' },
});
