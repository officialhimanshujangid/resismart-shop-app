import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Text, TextInput } from 'react-native-paper';
import { useTranslation } from 'react-i18next';

import { ColorScheme, radii } from '../../../constants/colors';
import { DateField } from '../../../components/DateField';
import { Card } from '../../more/ui';
import { Pill } from '../../p2/ui';
import type { RxDetails } from '../types';

export type { RxDetails } from '../types';

/**
 * The prescription block of a Schedule H / H1 sale (bill or accepted order):
 * which medicines need it, then patient name*, patient phone, doctor name*,
 * doctor reg. no., prescription no. and date. Only what the register needs —
 * no clinical fields (Owner rule 10). Validate with `rxProblem`, send with
 * `rxBody` (both in `../logic`).
 */
export function RxDetailsForm({
  c, value, onChange, drugs, testID,
}: {
  c: ColorScheme;
  value: RxDetails;
  onChange: (v: RxDetails) => void;
  drugs: { name: string; schedule: 'H' | 'H1' }[];
  testID?: string;
}) {
  const { t } = useTranslation();
  const set = (patch: Partial<RxDetails>) => onChange({ ...value, ...patch });
  const field = (key: keyof RxDetails, label: string, max: number, extra: object = {}) => (
    <TextInput
      mode="outlined"
      label={label}
      value={(value[key] as string | undefined) ?? ''}
      onChangeText={(s) => set({ [key]: s.slice(0, max) } as Partial<RxDetails>)}
      outlineStyle={{ borderRadius: radii.field }}
      style={styles.field}
      testID={testID ? `${testID}-${key}` : undefined}
      {...extra}
    />
  );
  return (
    <Card c={c}>
      <View testID={testID} style={{ gap: 8 }}>
        <Text style={[styles.title, { color: c.textPrimary }]}>{t('p2.pharmacy.rx.title')}</Text>
        {drugs.length ? (
          <>
            <Text style={{ color: c.textSecondary, fontSize: 12 }}>{t('p2.pharmacy.rx.neededFor')}</Text>
            {drugs.map((d, i) => (
              <View key={`${d.name}-${i}`} style={styles.drug}>
                <Text style={{ flex: 1, minWidth: 0, color: c.textPrimary }} numberOfLines={2}>{d.name}</Text>
                <Pill c={c} label={t('p2.pharmacy.rx.schedule', { schedule: d.schedule })} tone="warn" />
              </View>
            ))}
          </>
        ) : null}
        {field('patientName', t('p2.pharmacy.rx.patientName'), 80, { autoCapitalize: 'words' })}
        {field('patientPhone', t('p2.pharmacy.rx.patientPhone'), 20, { keyboardType: 'phone-pad' })}
        {field('doctorName', t('p2.pharmacy.rx.doctorName'), 80, { autoCapitalize: 'words' })}
        {field('doctorRegNo', t('p2.pharmacy.rx.doctorRegNo'), 40)}
        {field('rxNo', t('p2.pharmacy.rx.rxNo'), 40)}
        <DateField
          label={t('p2.pharmacy.rx.rxDate')}
          value={value.rxDate ?? ''}
          onChangeText={(s) => set({ rxDate: s })}
          maximumDate={new Date()}
        />
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 15, fontWeight: '700' },
  drug: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 32 },
  field: { backgroundColor: 'transparent' },
});
