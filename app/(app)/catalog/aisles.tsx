import React, { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, View, useColorScheme } from 'react-native';
import { Button, Dialog, Portal, Snackbar, Text, TextInput } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';

import { radii, themeColors } from '../../../src/constants/colors';
import { usePartnerEntitlements } from '../../../src/hooks';
import { qk } from '../../../src/lib/queryKeys';
import { apiErrorMessage } from '../../../src/api/axios';
import { catalogApi } from '../../../src/features/catalog/api';
import { useProductCategories } from '../../../src/features/catalog/hooks';
import type { ProductCategory } from '../../../src/features/catalog/types';
import { EmptyBlock, ErrorBlock, Loading } from '../../../src/features/more/ui';
import { ActionRow, PillButton } from '../../../src/features/p1/ui';

/**
 * FPB P5 (2026-10-31) — Aisles (product categories), managed on the phone as on
 * the web (`partner/catalog/categories`). CATALOG_VIEW reads; CATALOG_MANAGE
 * adds, renames, re-orders (shelf order) and hides / shows an aisle. Hiding is
 * SOFT on the server (products keep pointing at it) and is undone with "Show".
 * Before this the app had only the picker inside the product form.
 */
type Draft = { id?: string; name: string; sortOrder: string; isActive: boolean };

export default function AislesScreen() {
  const { t } = useTranslation();
  const c = themeColors(useColorScheme() === 'dark');
  const queryClient = useQueryClient();
  const { can } = usePartnerEntitlements();
  const mayManage = can('CATALOG_MANAGE', 'FULL');
  const list = useProductCategories();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const refresh = () => void queryClient.invalidateQueries({ queryKey: qk.catalog.all() });
  const fail = (fallback: string) => (e: unknown) => setToast(apiErrorMessage(e, fallback));

  const save = useMutation({
    mutationFn: async (d: Draft) => {
      const sortOrder = Number.parseInt(d.sortOrder, 10);
      const body = { name: d.name.trim(), ...(Number.isFinite(sortOrder) ? { sortOrder } : {}) };
      if (d.id) return catalogApi.updateCategory(d.id, { ...body, isActive: d.isActive });
      const made = await catalogApi.createCategory(body.name);
      if (body.sortOrder !== undefined) await catalogApi.updateCategory(made._id, { sortOrder: body.sortOrder });
      return made;
    },
    onSuccess: () => { setDraft(null); setToast(t('catalog.aisles.saved')); refresh(); },
    onError: fail(t('catalog.aisles.saveFailed')),
  });
  const hide = useMutation({
    mutationFn: (row: ProductCategory) => catalogApi.removeCategory(row._id),
    onSuccess: () => { setToast(t('catalog.aisles.hideDone')); refresh(); },
    onError: fail(t('catalog.aisles.hideFailed')),
  });
  const show = useMutation({
    mutationFn: (row: ProductCategory) => catalogApi.updateCategory(row._id, { isActive: true }),
    onSuccess: (_r, row) => { setToast(t('catalog.aisles.unhidden', { name: row.name })); refresh(); },
    onError: fail(t('catalog.aisles.unhideFailed')),
  });

  const askHide = (row: ProductCategory) => Alert.alert(
    t('catalog.aisles.hideTitle', { name: row.name }),
    t('catalog.aisles.hideMessage'),
    [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('catalog.aisles.hideConfirm'), style: 'destructive', onPress: () => hide.mutate(row) },
    ],
  );

  const rows = [...(list.data ?? [])].sort((a, b) => (Number(b.isActive) - Number(a.isActive)) || (a.sortOrder - b.sortOrder) || a.name.localeCompare(b.name));
  const busy = save.isPending || hide.isPending || show.isPending;

  return (
    <View style={[styles.root, { backgroundColor: c.background }]} testID="catalog-aisles">
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={[styles.intro, { color: c.textSecondary }]}>{t('catalog.aisles.intro')}</Text>
        {mayManage && (
          <ActionRow>
            <PillButton c={c} icon="plus" label={t('catalog.aisles.add')} testID="aisle-add"
              onPress={() => setDraft({ name: '', sortOrder: '', isActive: true })} />
          </ActionRow>
        )}
        {list.isPending ? (
          <Loading c={c} skeleton={4} />
        ) : list.isError ? (
          <ErrorBlock c={c} message={apiErrorMessage(list.error, t('catalog.aisles.loadFailed'))} onRetry={() => list.refetch()} />
        ) : rows.length === 0 ? (
          <EmptyBlock c={c} title={t('catalog.aisles.empty')} />
        ) : (
          rows.map((r) => (
            <View key={r._id} style={[styles.card, { backgroundColor: c.surface, borderColor: c.divider, opacity: r.isActive ? 1 : 0.7 }]} testID={`aisle-${r._id}`}>
              <View style={[styles.icon, { backgroundColor: c.surfaceVariant }]}>
                <MaterialCommunityIcons name="folder-outline" size={20} color={c.primary} />
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={[styles.name, { color: c.textPrimary }]} numberOfLines={2}>{r.name}</Text>
                <Text style={[styles.meta, { color: c.textSecondary }]}>
                  {t('catalog.aisles.order', { n: r.sortOrder })}{r.isActive ? '' : ` · ${t('catalog.aisles.hidden')}`}
                </Text>
              </View>
              {mayManage && (
                <View style={styles.actions}>
                  <Pressable accessibilityRole="button" accessibilityLabel={t('catalog.aisles.edit')} hitSlop={8} disabled={busy}
                    onPress={() => setDraft({ id: r._id, name: r.name, sortOrder: String(r.sortOrder ?? ''), isActive: r.isActive })}
                    style={styles.iconBtn} testID={`aisle-edit-${r._id}`}>
                    <MaterialCommunityIcons name="pencil-outline" size={20} color={c.primary} />
                  </Pressable>
                  <Pressable accessibilityRole="button" accessibilityLabel={r.isActive ? t('catalog.aisles.hide') : t('catalog.aisles.unhide')} hitSlop={8} disabled={busy}
                    onPress={() => (r.isActive ? askHide(r) : show.mutate(r))} style={styles.iconBtn} testID={`aisle-toggle-${r._id}`}>
                    <MaterialCommunityIcons name={r.isActive ? 'eye-off-outline' : 'eye-outline'} size={20} color={r.isActive ? c.textSecondary : c.primary} />
                  </Pressable>
                </View>
              )}
            </View>
          ))
        )}
      </ScrollView>

      <Portal>
        <Dialog visible={!!draft} onDismiss={() => setDraft(null)} style={{ backgroundColor: c.surface }}>
          <Dialog.Title>{draft?.id ? t('catalog.aisles.edit') : t('catalog.aisles.add')}</Dialog.Title>
          <Dialog.Content style={{ gap: 10 }}>
            <TextInput mode="outlined" label={t('catalog.aisles.name')} value={draft?.name ?? ''} testID="aisle-name"
              onChangeText={(v) => setDraft((d) => (d ? { ...d, name: v.slice(0, 60) } : d))} outlineStyle={{ borderRadius: radii.field }} />
            <TextInput mode="outlined" label={t('catalog.aisles.sortOrder')} value={draft?.sortOrder ?? ''} keyboardType="number-pad"
              onChangeText={(v) => setDraft((d) => (d ? { ...d, sortOrder: v.replace(/\D/g, '').slice(0, 4) } : d))} outlineStyle={{ borderRadius: radii.field }} />
            <Text style={{ color: c.textSecondary, fontSize: 12 }}>{t('catalog.aisles.sortHint')}</Text>
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setDraft(null)}>{t('common.cancel')}</Button>
            <Button testID="aisle-save" loading={save.isPending} disabled={!draft?.name.trim() || save.isPending}
              onPress={() => draft && save.mutate(draft)}>
              {t('common.save')}
            </Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>
      <Snackbar visible={!!toast} onDismiss={() => setToast(null)}>{toast}</Snackbar>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { padding: 16, gap: 10, paddingBottom: 48 },
  intro: { fontSize: 12.5, lineHeight: 18 },
  card: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: radii.card, borderWidth: StyleSheet.hairlineWidth, padding: 12, minHeight: 60 },
  icon: { width: 36, height: 36, borderRadius: radii.sm, alignItems: 'center', justifyContent: 'center' },
  name: { fontSize: 15, fontWeight: '600' },
  meta: { fontSize: 12, marginTop: 2 },
  actions: { flexDirection: 'row', gap: 4, flexShrink: 0 },
  iconBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 20 },
});
