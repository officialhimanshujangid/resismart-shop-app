import React from 'react';
import { View } from 'react-native';
import { Text } from 'react-native-paper';
import { useTranslation } from 'react-i18next';

import { ColorScheme } from '../../../constants/colors';
import { AppInput } from '../../../components/AppInput';
import { ChoiceChips } from '../../p2/ui';
import type { BillingDraft } from '../logic';
import { BILLING_MODES, BillingMode } from '../types';

/** Per delivery (what was delivered, at the line rates) or a fixed monthly fee (tuition). Billed after the month. */
export function BillingEditor({ c, value, onChange }: { c: ColorScheme; value: BillingDraft; onChange: (v: BillingDraft) => void }) {
  const { t } = useTranslation();
  return (
    <View style={{ gap: 8 }}>
      <ChoiceChips<BillingMode>
        c={c}
        testID="billing-mode"
        options={BILLING_MODES.map((m) => ({ key: m, label: t(`p2.subscriptions.billing.${m}`) }))}
        value={[value.mode]}
        onChange={(v) => onChange({ ...value, mode: v[0] ?? 'PER_DELIVERY' })}
      />
      {value.mode === 'FIXED_MONTHLY' ? (
        <AppInput
          label={t('p2.subscriptions.billing.fee')}
          value={value.fee}
          onChangeText={(v) => onChange({ ...value, fee: v.replace(/[^0-9.]/g, '') })}
          keyboardType="numeric"
        />
      ) : null}
      <Text style={{ color: c.textSecondary, fontSize: 12 }}>{t(`p2.subscriptions.billing.help.${value.mode}`)}</Text>
    </View>
  );
}
