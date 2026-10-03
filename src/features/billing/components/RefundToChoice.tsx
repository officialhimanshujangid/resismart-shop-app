// >>> MP1-COMPLETE — P2: "Refund as: Cash or khata / Store credit" — the web's RefundToChoice, on the phone.
import React, { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';

import type { ColorScheme } from '../../../constants/colors';
import { radii } from '../../../constants/colors';
import { useCommerceAccess } from '../../commerce/access';
import { useCommerceSettings } from '../../commerce/hooks';
import { refundToDefault, type RefundTo } from '../refundTo';

/**
 * Store credit on? + the current choice. Until the person picks, the choice
 * FOLLOWS the shop's setting (derived, so a late settings answer still lands);
 * the settings are read only while WALLET is on and this login may read them.
 */
export function useRefundTo(): { walletOn: boolean; value: RefundTo | ''; choose: (v: RefundTo) => void } {
  const access = useCommerceAccess();
  const walletOn = access.has('WALLET');
  const settings = useCommerceSettings(walletOn && access.settings.canView);
  const [chosen, setChosen] = useState<RefundTo | null>(null);
  const fallback = refundToDefault(settings.data?.settings?.wallet);
  return { walletOn, value: chosen ?? fallback, choose: setChosen };
}

/**
 * Two choice cards (a radio group). Side by side when the screen is wide enough,
 * one under the other on a narrow phone (`flexBasis` + wrap) — never a card cut
 * off at the edge. `''` = not chosen: nothing is sent and the shop's usual
 * choice applies, which the line under the cards says.
 */
export function RefundToChoice({ c, value, onChange, disabled }: {
  c: ColorScheme;
  value: RefundTo | '';
  onChange: (v: RefundTo) => void;
  disabled?: boolean;
}) {
  const { t } = useTranslation();
  const options: { v: RefundTo; label: string; hint: string; icon: 'cash' | 'wallet-outline' }[] = [
    { v: 'CASH_OR_KHATA', label: t('billing.refundTo.cash'), hint: t('billing.refundTo.cashHint'), icon: 'cash' },
    { v: 'STORE_CREDIT', label: t('billing.refundTo.credit'), hint: t('billing.refundTo.creditHint'), icon: 'wallet-outline' },
  ];
  return (
    <View testID="refund-to">
      <Text style={[styles.label, { color: c.textSecondary }]}>{t('billing.refundTo.label')}</Text>
      <View style={styles.row} accessibilityRole="radiogroup">
        {options.map((o) => {
          const on = value === o.v;
          return (
            <Pressable
              key={o.v}
              onPress={() => onChange(o.v)}
              disabled={disabled}
              accessibilityRole="radio"
              accessibilityState={{ checked: on, disabled: !!disabled }}
              accessibilityLabel={`${o.label}. ${o.hint}`}
              testID={`refund-to-${o.v}`}
              style={[
                styles.card,
                { borderColor: on ? c.primary : c.divider, backgroundColor: on ? `${c.primary}14` : c.surface },
                disabled && { opacity: 0.6 },
              ]}
            >
              <MaterialCommunityIcons name={o.icon} size={20} color={on ? c.primary : c.textSecondary} style={styles.icon} />
              <View style={styles.text}>
                <Text style={[styles.cardLabel, { color: on ? c.primary : c.textPrimary }]}>{o.label}</Text>
                <Text style={[styles.cardHint, { color: c.textSecondary }]}>{o.hint}</Text>
              </View>
              <MaterialCommunityIcons
                name={on ? 'radiobox-marked' : 'radiobox-blank'}
                size={20}
                color={on ? c.primary : c.textDisabled}
              />
            </Pressable>
          );
        })}
      </View>
      {!value ? <Text style={[styles.unset, { color: c.textSecondary }]} testID="refund-to-unset">{t('billing.refundTo.unset')}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  label: { fontSize: 12, fontWeight: '600', marginBottom: 6 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  card: {
    flexGrow: 1, flexBasis: 220, minWidth: 0, minHeight: 56,
    flexDirection: 'row', alignItems: 'flex-start', gap: 10,
    borderWidth: 1.5, borderRadius: radii.card, paddingHorizontal: 12, paddingVertical: 10,
  },
  icon: { marginTop: 1 },
  text: { flex: 1, minWidth: 0 },
  cardLabel: { fontSize: 14, fontWeight: '600' },
  cardHint: { fontSize: 12, lineHeight: 16, marginTop: 2 },
  unset: { fontSize: 11.5, lineHeight: 16, marginTop: 6 },
});
// <<< MP1-COMPLETE
