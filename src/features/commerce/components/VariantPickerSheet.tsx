import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, useColorScheme, View } from 'react-native';
import { Text } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';

import { radii, themeColors } from '../../../constants/colors';
import { formatPaise } from '../../../lib/money';
import { Sheet } from '../../p2/ui';
import { useVariants } from '../hooks';

/** What the till needs from a size / type to bill it (a product row). */
export interface VariantChoice {
  _id: string;
  name: string;
  variantLabel?: string;
  unit: string;
  sellPaise: number;
  mrpPaise?: number;
  hsnCode?: string;
  taxRatePercent: number;
  taxInclusive: boolean;
  stockQty?: number;
  trackStock?: boolean;
  barcode?: string;
  isActive?: boolean;
}

/**
 * "Which size?" (D-8) — a scanned or searched PARENT is not sellable; the
 * cashier taps the size that is. `variants` comes with a barcode scan
 * (`byBarcode` lists the live ones); from a search only the parent id is known,
 * so the list is fetched (`GET /products/:id/variants`).
 */
export function VariantPickerSheet({
  visible, parentName, parentId, variants, onPick, onDismiss,
}: {
  visible: boolean;
  parentName: string;
  parentId?: string;
  variants?: VariantChoice[];
  onPick: (v: VariantChoice) => void;
  onDismiss: () => void;
}) {
  const { t } = useTranslation();
  const c = themeColors(useColorScheme() === 'dark');
  const fetched = useVariants(parentId, visible && !variants);
  const rows = (variants ?? (fetched.data as VariantChoice[] | undefined) ?? []).filter((v) => v.isActive !== false);
  return (
    <Sheet visible={visible} onDismiss={onDismiss} title={t('commerce.counter.whichOne', { name: parentName })} testID="variant-picker">
      {!variants && fetched.isPending ? <ActivityIndicator color={c.primary} /> : null}
      {rows.map((v) => {
        const out = v.trackStock !== false && v.stockQty !== undefined && v.stockQty <= 0;
        return (
          <Pressable
            key={v._id}
            onPress={() => { onPick(v); onDismiss(); }}
            accessibilityRole="button"
            accessibilityLabel={`${v.variantLabel || v.name} ${formatPaise(v.sellPaise)}`}
            style={[styles.row, { borderColor: c.divider, backgroundColor: c.surface }]}
            testID={`variant-${v._id}`}
          >
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={[styles.label, { color: c.textPrimary }]} numberOfLines={2}>{v.variantLabel || v.name}</Text>
              <Text style={{ color: out ? c.warning : c.textSecondary, fontSize: 12 }} numberOfLines={1}>
                {v.trackStock === false || v.stockQty === undefined
                  ? v.unit
                  : out ? t('commerce.counter.outOfStock') : t('commerce.counter.inStock', { qty: v.stockQty, unit: v.unit })}
              </Text>
            </View>
            <Text style={[styles.price, { color: c.primary }]}>{formatPaise(v.sellPaise)}</Text>
            <MaterialCommunityIcons name="plus-circle" size={26} color={c.primary} />
          </Pressable>
        );
      })}
      {(variants || fetched.isSuccess) && rows.length === 0 ? (
        <Text style={{ color: c.textSecondary }}>{t('commerce.counter.noSizes')}</Text>
      ) : null}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 56, paddingHorizontal: 12, paddingVertical: 8, borderRadius: radii.card, borderWidth: 1 },
  label: { fontSize: 15, fontWeight: '600' },
  price: { fontSize: 14, fontWeight: '700' },
});
