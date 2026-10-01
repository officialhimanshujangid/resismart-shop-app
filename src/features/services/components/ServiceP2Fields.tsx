import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Switch, Text } from 'react-native-paper';
import { useTranslation } from 'react-i18next';

import { ColorScheme, radii } from '../../../constants/colors';
import { AppInput } from '../../../components/AppInput';
import { Stepper } from '../../p1/ui';
import { MAX_BUFFER_MIN, P2_TAX_RATES, P2ServiceDraft } from '../p2Fields';

/**
 * Buffer, SAC, GST rate and (JOBS) "repair job" — drawn only while
 * APPOINTMENTS or JOBS is on; the caller decides (`useCategoryModules`).
 */
export function ServiceP2Fields({
  c, value, onChange, jobs, disabled,
}: { c: ColorScheme; value: P2ServiceDraft; onChange: (next: P2ServiceDraft) => void; jobs: boolean; disabled: boolean }) {
  const { t } = useTranslation();
  const set = <K extends keyof P2ServiceDraft>(k: K, v: P2ServiceDraft[K]) => onChange({ ...value, [k]: v });
  const rates: (number | null)[] = [null, ...P2_TAX_RATES,
    ...(value.taxRatePercent !== null && !(P2_TAX_RATES as readonly number[]).includes(value.taxRatePercent) ? [value.taxRatePercent] : [])];

  return (
    <View testID="service-p2-fields">
      <Text style={[styles.label, { color: c.textSecondary }]}>{t('services.p2.section')}</Text>
      <View style={styles.row}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={{ color: c.textPrimary, fontSize: 13, fontWeight: '600' }}>{t('services.p2.buffer')}</Text>
          <Text style={[styles.hint, { color: c.textSecondary }]}>{t('services.p2.bufferHint')}</Text>
        </View>
        <Stepper
          c={c}
          value={value.bufferMin}
          onChange={(n) => !disabled && set('bufferMin', Math.round(n))}
          min={0}
          max={MAX_BUFFER_MIN}
          step={5}
          label={t('services.p2.buffer')}
          testID="service-buffer"
        />
      </View>
      <AppInput
        label={t('services.p2.sac')}
        value={value.sac}
        onChangeText={(v) => set('sac', v.replace(/\D/g, '').slice(0, 8))}
        keyboardType="numeric"
        disabled={disabled}
      />
      <Text style={[styles.label, { color: c.textSecondary }]}>{t('services.p2.tax')}</Text>
      <View style={styles.chips}>
        {rates.map((r) => {
          const on = value.taxRatePercent === r;
          const label = r === null ? t('services.p2.taxNotSet') : `${r}%`;
          return (
            <Pressable
              key={String(r)}
              onPress={() => set('taxRatePercent', r)}
              disabled={disabled}
              accessibilityRole="radio"
              accessibilityState={{ selected: on }}
              accessibilityLabel={`${t('services.p2.tax')} ${label}`}
              style={[styles.chip, { backgroundColor: on ? c.primary : c.surfaceVariant, borderColor: on ? c.primary : c.divider }]}
            >
              <Text style={{ color: on ? c.textInverse : c.textSecondary, fontSize: 12.5, fontWeight: '600' }}>{label}</Text>
            </Pressable>
          );
        })}
      </View>
      {jobs ? (
        <View style={styles.row}>
          <Text style={{ color: c.textPrimary, fontSize: 13, fontWeight: '600', flex: 1, minWidth: 0 }}>{t('services.p2.isJob')}</Text>
          <Switch value={value.isJob} onValueChange={(v) => set('isJob', v)} disabled={disabled} testID="service-isjob" accessibilityLabel={t('services.p2.isJob')} />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  label: { fontSize: 11, fontWeight: '600', letterSpacing: 0.6, marginTop: 12, marginBottom: 6 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap', paddingVertical: 8 },
  hint: { fontSize: 11.5, marginTop: 2, lineHeight: 16 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 4 },
  chip: { minHeight: 44, minWidth: 44, paddingHorizontal: 12, borderRadius: radii.pill, borderWidth: StyleSheet.hairlineWidth, alignItems: 'center', justifyContent: 'center' },
});
