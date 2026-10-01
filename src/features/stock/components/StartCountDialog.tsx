import React, { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, useColorScheme, View } from 'react-native';
import { Button, Dialog, Portal, Switch, Text, TextInput } from 'react-native-paper';
import { useTranslation } from 'react-i18next';

import { radii, themeColors } from '../../../constants/colors';
import { useProductCategories } from '../../catalog/hooks';
import { ChipRow } from '../../more/ui';
import type { CreateStockCountBody } from '../api';

/**
 * Start a stock count (screen S11): the whole shop or some categories, blind or
 * not (a blind count hides the system quantity from the counter), and what an
 * uncounted product means at posting — left alone (IGNORE) or zero (ZERO).
 */
export function StartCountDialog({
  visible, submitting, onCancel, onSubmit,
}: {
  visible: boolean;
  submitting: boolean;
  onCancel: () => void;
  onSubmit: (body: CreateStockCountBody) => void;
}) {
  const { t } = useTranslation();
  const c = themeColors(useColorScheme() === 'dark');
  const categories = useProductCategories();
  const [name, setName] = useState('');
  const [all, setAll] = useState(true);
  const [picked, setPicked] = useState<string[]>([]);
  const [blind, setBlind] = useState(false);
  const [policy, setPolicy] = useState<'IGNORE' | 'ZERO'>('IGNORE');

  useEffect(() => {
    if (visible) { setName(''); setAll(true); setPicked([]); setBlind(false); setPolicy('IGNORE'); }
  }, [visible]);

  const valid = all || picked.length > 0;
  const cats = (categories.data ?? []).filter((x) => x.isActive);

  return (
    <Portal>
      <Dialog visible={visible} onDismiss={submitting ? undefined : onCancel} style={{ backgroundColor: c.surface, maxHeight: '90%' }}>
        <Dialog.Title>{t('stock.count.startTitle')}</Dialog.Title>
        <Dialog.ScrollArea style={{ paddingHorizontal: 0 }}>
          <ScrollView contentContainerStyle={styles.body}>
            <TextInput
              mode="outlined"
              label={t('stock.count.nameOptional')}
              value={name}
              onChangeText={(v) => setName(v.slice(0, 80))}
              outlineStyle={{ borderRadius: radii.field }}
            />
            <Text style={[styles.label, { color: c.textSecondary }]}>{t('stock.count.scope')}</Text>
            <ChipRow
              c={c}
              value={all ? 'ALL' : 'CATS'}
              options={[{ key: 'ALL', label: t('stock.count.scopeAll') }, { key: 'CATS', label: t('stock.count.scopeCategories') }]}
              onChange={(v) => setAll(v === 'ALL')}
            />
            {!all && (
              <View style={styles.cats}>
                {cats.length === 0 ? (
                  <Text style={{ color: c.textSecondary, fontSize: 12 }}>{t('stock.count.noCategories')}</Text>
                ) : cats.map((cat) => {
                  const on = picked.includes(cat._id);
                  return (
                    <Pressable
                      key={cat._id}
                      onPress={() => setPicked((p) => (on ? p.filter((x) => x !== cat._id) : [...p, cat._id]))}
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked: on }}
                      style={[styles.cat, { backgroundColor: on ? c.primary : c.surfaceVariant, borderColor: on ? c.primary : c.border }]}
                    >
                      <Text style={{ color: on ? c.textInverse : c.textPrimary, fontSize: 13, fontWeight: '600' }}>{cat.name}</Text>
                    </Pressable>
                  );
                })}
              </View>
            )}
            <View style={styles.switchRow}>
              <View style={{ flex: 1 }}>
                <Text style={{ color: c.textPrimary, fontWeight: '600' }}>{t('stock.count.blind')}</Text>
                <Text style={{ color: c.textSecondary, fontSize: 12 }}>{t('stock.count.blindHint')}</Text>
              </View>
              <Switch value={blind} onValueChange={setBlind} accessibilityLabel={t('stock.count.blind')} />
            </View>
            <Text style={[styles.label, { color: c.textSecondary }]}>{t('stock.count.uncounted')}</Text>
            <ChipRow
              c={c}
              value={policy}
              options={[{ key: 'IGNORE', label: t('stock.count.uncountedIgnore') }, { key: 'ZERO', label: t('stock.count.uncountedZero') }]}
              onChange={setPolicy}
            />
            <Text style={{ color: c.textSecondary, fontSize: 12 }}>
              {policy === 'ZERO' ? t('stock.count.uncountedZeroHint') : t('stock.count.uncountedIgnoreHint')}
            </Text>
          </ScrollView>
        </Dialog.ScrollArea>
        <Dialog.Actions>
          <Button onPress={onCancel} disabled={submitting}>{t('common.cancel')}</Button>
          <Button
            onPress={() => onSubmit({
              name: name.trim() || undefined,
              scope: { all, categoryIds: all ? [] : picked, productIds: [] },
              blind,
              uncountedPolicy: policy,
            })}
            disabled={!valid || submitting}
            loading={submitting}
          >
            {t('stock.count.start')}
          </Button>
        </Dialog.Actions>
      </Dialog>
    </Portal>
  );
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: 24, paddingVertical: 8, gap: 10 },
  label: { fontSize: 12, fontWeight: '600', marginTop: 4 },
  cats: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  cat: { borderRadius: radii.pill, borderWidth: 1, paddingHorizontal: 14, minHeight: 40, justifyContent: 'center' },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
});
