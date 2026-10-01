import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Surface, Text } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { ColorScheme, radii } from '../../../constants/colors';
import { formatI18nDate } from '../../../i18n';
import { formatPaise } from '../../../lib/money';
import { rentDueCard } from '../logic';
import type { PartnerRentList } from '../types';

/**
 * Today's rent card (CONTRACT-partner-P4 §12 S): "Rent ₹35,400 due 5 Oct".
 * Drawn only when the shop rents a unit AND something is due; a tap opens the
 * one open bill, or the rent list when there are several.
 */
export function RentTodayCard({ c, list }: { c: ColorScheme; list: PartnerRentList | undefined }) {
  const { t } = useTranslation();
  const card = rentDueCard(list);
  if (!card) return null;

  const amount = formatPaise(card.duePaise);
  const title = card.dueDate
    ? t(card.overdue ? 'rent.today.titleOverdue' : 'rent.today.titleDue', { amount, date: formatI18nDate(card.dueDate, t) })
    : t('rent.today.titleNoDate', { amount });
  const tone = card.overdue ? c.error : c.warning;
  const open = () => {
    if (card.onlyBillId) router.push({ pathname: '/rent/[id]', params: { id: card.onlyBillId } });
    else router.push('/rent');
  };

  return (
    <Pressable onPress={open} accessibilityRole="button" accessibilityLabel={title} testID="rent-today-card">
      <Surface style={[styles.card, { backgroundColor: c.surface, borderLeftColor: tone }]} elevation={1}>
        <View style={styles.head}>
          <MaterialCommunityIcons name="storefront-outline" size={22} color={tone} />
          <Text style={[styles.title, { color: c.textPrimary }]}>{title}</Text>
          <MaterialCommunityIcons name="chevron-right" size={22} color={c.textDisabled} />
        </View>
        <Text style={[styles.body, { color: c.textSecondary }]}>
          {card.overdue && card.overduePaise < card.duePaise
            ? t('rent.today.bodyPartOverdue', { overdue: formatPaise(card.overduePaise) })
            : t('rent.today.body')}
        </Text>
      </Surface>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: radii.card, padding: 16, gap: 6, borderLeftWidth: 3 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { flex: 1, fontSize: 15.5, fontWeight: '600' },
  body: { fontSize: 13, lineHeight: 18 },
});
