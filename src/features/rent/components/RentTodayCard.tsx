import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';

import type { ColorScheme } from '../../../constants/colors';
import { formatI18nDate } from '../../../i18n';
import { formatPaise } from '../../../lib/money';
import { Card } from '../../../components/ui';
import { radius, tileDepth, typeScale } from '../../../theme/tokens';
import { useAppTheme } from '../../../theme/useAppTheme';
import { Rise } from '../../../theme/motion';
import { rentDueCard } from '../logic';
import type { PartnerRentList } from '../types';

/**
 * Today's rent card (CONTRACT-partner-P4 §12 S): "Rent ₹35,400 due 5 Oct".
 * Drawn only when the shop rents a unit AND something is due; a tap opens the
 * one open bill, or the rent list when there are several.
 *
 * M04-H redesign (DS v1, green): a pressable kit `Card` (scale on press) with a
 * tinted icon tile — amber when due, SOS-red when overdue — DS row type and a
 * chevron. Colours from `useAppTheme()` (light + dark); `c` stays in the
 * signature for the callers and tests.
 */
export function RentTodayCard({ list }: { c: ColorScheme; list: PartnerRentList | undefined }) {
  const { t } = useTranslation();
  const { ds, tints, isDark } = useAppTheme();
  const card = rentDueCard(list);
  if (!card) return null;

  const amount = formatPaise(card.duePaise);
  const title = card.dueDate
    ? t(card.overdue ? 'rent.today.titleOverdue' : 'rent.today.titleDue', { amount, date: formatI18nDate(card.dueDate, t) })
    : t('rent.today.titleNoDate', { amount });
  const tn = tints[card.overdue ? 'sos' : 'amber'];
  const open = () => {
    if (card.onlyBillId) router.push({ pathname: '/rent/[id]', params: { id: card.onlyBillId } });
    else router.push('/rent');
  };

  return (
    // Rise inside: no lease / nothing due draws nothing, and an outside wrapper would leave a gap.
    <Rise index={2}><Card onPress={open} accessibilityLabel={title} testID="rent-today-card">
      <View style={styles.head}>
        <View style={[styles.iconTile, tileDepth(tn, isDark, 'soft')]}>
          <LinearGradient colors={[tn.from, tn.to]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[StyleSheet.absoluteFill, styles.iconFill]} />
          <MaterialCommunityIcons name="storefront-outline" size={22} color={tn.icon} />
        </View>
        <View style={styles.text}>
          <Text style={[typeScale.row, { color: ds.ink }]}>{title}</Text>
          <Text style={[typeScale.detail, { color: ds.muted }]}>
            {card.overdue && card.overduePaise < card.duePaise
              ? t('rent.today.bodyPartOverdue', { overdue: formatPaise(card.overduePaise) })
              : t('rent.today.body')}
          </Text>
        </View>
        <MaterialCommunityIcons name="chevron-right" size={22} color={ds.muted} />
      </View>
    </Card></Rise>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  iconTile: { width: 42, height: 42, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  iconFill: { borderRadius: radius.md },
  text: { flex: 1, minWidth: 0, gap: 3 },
});
