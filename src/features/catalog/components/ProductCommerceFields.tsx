// >>> MP1-COMPLETE — P1: the product's online-shop page (description, key points) and quantity rules.
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Divider, Text } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';

import type { ColorScheme } from '../../../constants/colors';
import { radii } from '../../../constants/colors';
import { AppInput } from '../../../components/AppInput';
import { NumberRow } from '../../commerce/components/ui';
import { HIGHLIGHTS_MAX, type ShopFieldKey, type ShopFieldsForm } from '../commerceFields';

/**
 * One card, two short groups: what a customer reads on the item's page, then how
 * much one order may hold. The three numbers are SHORT inputs beside their label
 * (`NumberRow`, which wraps under the label on a narrow phone) — never a
 * full-width box for "0.5". The unit code is the suffix, as on every bill.
 */
export function ProductCommerceFields({
  c, unit, value, onChange, errors, disabled,
}: {
  c: ColorScheme;
  unit: string;
  value: ShopFieldsForm;
  onChange: (patch: Partial<ShopFieldsForm>) => void;
  errors: Partial<Record<ShopFieldKey, string>>;
  disabled?: boolean;
}) {
  const { t } = useTranslation();
  return (
    <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.divider }]} testID="product-shop-fields">
      <View style={styles.head}>
        <MaterialCommunityIcons name="storefront-outline" size={20} color={c.primary} />
        <Text style={[styles.title, { color: c.textPrimary }]}>{t('catalog.shopPage.title')}</Text>
      </View>
      <Text style={[styles.intro, { color: c.textSecondary }]}>{t('catalog.shopPage.intro')}</Text>

      <AppInput
        label={t('catalog.shopPage.description')}
        value={value.description}
        onChangeText={(description) => onChange({ description })}
        multiline
        numberOfLines={3}
        error={errors.description}
        disabled={disabled}
      />
      <AppInput
        label={t('catalog.shopPage.highlights')}
        value={value.highlights}
        onChangeText={(highlights) => onChange({ highlights })}
        multiline
        numberOfLines={3}
        error={errors.highlights}
        disabled={disabled}
      />
      {!errors.highlights ? (
        <Text style={[styles.hint, { color: c.textSecondary }]}>{t('catalog.shopPage.highlightsHint', { max: HIGHLIGHTS_MAX })}</Text>
      ) : null}

      <Divider style={{ marginVertical: 10, backgroundColor: c.divider }} />

      <Text style={[styles.subTitle, { color: c.textPrimary }]}>{t('catalog.shopPage.qtyTitle')}</Text>
      <Text style={[styles.intro, { color: c.textSecondary }]}>{t('catalog.shopPage.qtyIntro')}</Text>
      <NumberRow
        c={c}
        label={t('catalog.shopPage.qtyStep')}
        hint={t('catalog.shopPage.qtyStepHint')}
        value={value.qtyStep}
        onChangeText={(qtyStep) => onChange({ qtyStep })}
        suffix={unit}
        error={errors.qtyStep}
        disabled={disabled}
        width={124}
        testID="shop-qty-step"
      />
      <NumberRow
        c={c}
        label={t('catalog.shopPage.minQty')}
        value={value.minQty}
        onChangeText={(minQty) => onChange({ minQty })}
        suffix={unit}
        error={errors.minQty}
        disabled={disabled}
        width={124}
        testID="shop-min-qty"
      />
      <NumberRow
        c={c}
        label={t('catalog.shopPage.maxQty')}
        value={value.maxQty}
        onChangeText={(maxQty) => onChange({ maxQty })}
        suffix={unit}
        error={errors.maxQty}
        disabled={disabled}
        width={124}
        testID="shop-max-qty"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: radii.card, borderWidth: StyleSheet.hairlineWidth, padding: 14, marginTop: 10, marginBottom: 6, gap: 2 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { fontSize: 15, fontWeight: '600', flexShrink: 1 },
  subTitle: { fontSize: 13.5, fontWeight: '600' },
  intro: { fontSize: 12, lineHeight: 17, marginTop: 2, marginBottom: 4 },
  hint: { fontSize: 11.5, lineHeight: 16, marginTop: -2, marginBottom: 2 },
});
// <<< MP1-COMPLETE
