import React from 'react';
import { View } from 'react-native';
import { Text } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';

import { ColorScheme } from '../../../constants/colors';
import { istDayOf, shortDay } from '../../p2/dates';
import type { CustomerSummary } from '../types';

/** "12 visits · 1 no-show · last visit Tue 3 Oct" under the picked customer. */
export function CustomerSummaryLine({ c, s }: { c: ColorScheme; s: CustomerSummary }) {
  const { t } = useTranslation();
  const parts = [
    t('p2.appointments.new.visits', { count: s.visits }),
    t('p2.appointments.new.noShows', { count: s.noShows }),
    ...(s.lastVisit ? [t('p2.appointments.new.lastVisit', { day: shortDay(istDayOf(s.lastVisit), t) })] : []),
  ];
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }} testID="appt-customer-summary">
      <MaterialCommunityIcons name="history" size={16} color={s.noShows > 0 ? c.warning : c.textSecondary} />
      <Text style={{ color: s.noShows > 0 ? c.warning : c.textSecondary, fontSize: 12.5, flex: 1, minWidth: 0 }} numberOfLines={2}>
        {parts.join(' · ')}
      </Text>
    </View>
  );
}
