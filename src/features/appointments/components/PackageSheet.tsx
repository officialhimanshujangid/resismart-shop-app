import React, { useEffect, useState } from 'react';
import { StyleSheet, Switch, View } from 'react-native';
import { Text, TextInput } from 'react-native-paper';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';

import { ColorScheme, radii } from '../../../constants/colors';
import { apiErrorMessage } from '../../../api/axios';
import { paiseToInput, parseRupeesToPaise } from '../../../lib/money';
import { SectionLabel } from '../../more/ui';
import { Banner, PillButton, Stepper } from '../../p1/ui';
import { ChoiceChips, Sheet } from '../../p2/ui';
import type { PartnerServiceRow } from '../../services/types';
import { appointmentsApi, apptKeys } from '../api';
import { packageBody } from '../logic';
import type { PackageRow } from '../types';

const TAX_RATES = [0, 5, 12, 18, 28, 40];

/** Create or edit a session package (PACKAGES_MANAGE). */
export function PackageSheet({
  c, visible, editing, services, onDismiss, onSaved,
}: {
  c: ColorScheme; visible: boolean; editing: PackageRow | null; services: PartnerServiceRow[];
  onDismiss: () => void; onSaved: () => void;
}) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [name, setName] = useState('');
  const [serviceIds, setServiceIds] = useState<string[]>([]);
  const [sessions, setSessions] = useState(5);
  const [price, setPrice] = useState('');
  const [validity, setValidity] = useState('90');
  const [tax, setTax] = useState(0);
  const [sac, setSac] = useState('');
  const [active, setActive] = useState(true);
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    setName(editing?.name ?? '');
    setServiceIds(editing?.serviceIds ?? []);
    setSessions(editing?.sessions ?? 5);
    setPrice(editing ? paiseToInput(editing.pricePaise) : '');
    setValidity(String(editing?.validityDays ?? 90));
    setTax(editing?.taxRatePercent ?? 0);
    setSac(editing?.sac ?? '');
    setActive(editing?.isActive ?? true);
    setProblem(null);
  }, [visible, editing]);

  const save = useMutation({
    mutationFn: async () => {
      const out = packageBody({
        name, serviceIds, sessions, pricePaise: parseRupeesToPaise(price), validityDays: Math.round(Number(validity)),
        taxRatePercent: tax, sac, isActive: active,
      });
      if ('problem' in out) throw new Error(t(`p2.appointments.packages.problem.${out.problem}`));
      return editing ? appointmentsApi.updatePackage(editing.id, out.body) : appointmentsApi.createPackage(out.body);
    },
    onMutate: () => setProblem(null),
    onSuccess: () => { qc.invalidateQueries({ queryKey: apptKeys.packages() }); onSaved(); },
    onError: (e) => setProblem(apiErrorMessage(e, t('p2.common.saveFailed'))),
  });

  const rates = TAX_RATES.includes(tax) ? TAX_RATES : [...TAX_RATES, tax].sort((a, b) => a - b);
  const known = new Set(services.map((s) => s._id));
  const serviceOptions = [
    ...services.map((s) => ({ key: s._id, label: s.name })),
    // A service that was switched off still shows while the package names it.
    ...serviceIds.filter((id) => !known.has(id)).map((id) => ({ key: id, label: t('p2.appointments.packages.oldService') })),
  ];

  return (
    <Sheet
      visible={visible}
      onDismiss={onDismiss}
      title={editing ? t('p2.appointments.packages.edit') : t('p2.appointments.packages.add')}
      testID="package-sheet"
      footer={<PillButton c={c} label={save.isPending ? t('common.saving') : t('common.save')} onPress={() => save.mutate()} disabled={save.isPending} testID="package-save" />}
    >
      <TextInput mode="outlined" label={t('p2.appointments.packages.name')} value={name} onChangeText={(v) => setName(v.slice(0, 80))} outlineStyle={{ borderRadius: radii.field }} testID="package-name" />
      <SectionLabel c={c}>{t('p2.appointments.packages.services')}</SectionLabel>
      <ChoiceChips c={c} multi options={serviceOptions} value={serviceIds} onChange={(v) => setServiceIds(v.length > 5 ? serviceIds : v)} testID="package-services" />
      <View style={styles.row}>
        <Text style={{ color: c.textPrimary, flex: 1, minWidth: 0 }}>{t('p2.appointments.packages.sessions')}</Text>
        <Stepper c={c} value={sessions} onChange={setSessions} min={2} max={100} label={t('p2.appointments.packages.sessions')} testID="package-sessions" />
      </View>
      <View style={styles.pair}>
        <TextInput mode="outlined" label={t('p2.appointments.packages.price')} value={price} onChangeText={setPrice} keyboardType="decimal-pad" outlineStyle={{ borderRadius: radii.field }} style={styles.half} testID="package-price" />
        <TextInput mode="outlined" label={t('p2.appointments.packages.validity')} value={validity} onChangeText={(v) => setValidity(v.replace(/\D/g, '').slice(0, 3))} keyboardType="number-pad" outlineStyle={{ borderRadius: radii.field }} style={styles.half} testID="package-validity" />
      </View>
      <SectionLabel c={c}>{t('p2.appointments.packages.tax')}</SectionLabel>
      <ChoiceChips c={c} options={rates.map((r) => ({ key: r, label: `${r}%` }))} value={[tax]} onChange={(v) => v.length && setTax(v[0])} />
      <TextInput mode="outlined" label={t('p2.appointments.packages.sac')} value={sac} onChangeText={(v) => setSac(v.replace(/\D/g, '').slice(0, 8))} keyboardType="number-pad" outlineStyle={{ borderRadius: radii.field }} />
      <View style={styles.row}>
        <Text style={{ color: c.textPrimary, flex: 1, minWidth: 0 }}>{t('p2.appointments.packages.active')}</Text>
        <Switch value={active} onValueChange={setActive} accessibilityLabel={t('p2.appointments.packages.active')} />
      </View>
      {problem ? <Banner c={c} tone="error" body={problem} testID="package-problem" /> : null}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap', minHeight: 52 },
  pair: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  half: { flexGrow: 1, flexBasis: 140, minWidth: 0, backgroundColor: 'transparent' },
});
