import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Switch, Text } from 'react-native-paper';
import { useTranslation } from 'react-i18next';

import { ColorScheme } from '../../constants/colors';
import { AppInput } from '../../components/AppInput';
import { parseRupeesToPaise, paiseToInput } from '../../lib/money';
import { Card } from '../more/ui';
import type { PartnerRoleLimits } from './access';

/**
 * A role's limits (screen S24, owner only — 403 PARTNER_ROLE_LIMITS_OWNER_ONLY
 * for anyone else): the most discount per line and per bill, whether the role
 * may change a catalogue price, how many days back it may date a bill, and
 * whether it may bill past a customer's BLOCK credit limit. An empty field is
 * "no limit".
 */
export interface RoleLimitsForm {
  maxDiscountPercent: string;
  maxDiscountPerBill: string;
  mayEditPrice: boolean;
  mayBackdateDays: string;
  mayOverrideCreditLimit: boolean;
}

export function limitsFormFrom(l?: PartnerRoleLimits): RoleLimitsForm {
  return {
    maxDiscountPercent: l?.maxDiscountPercent !== undefined ? String(l.maxDiscountPercent) : '',
    maxDiscountPerBill: l?.maxDiscountPaisePerBill !== undefined ? paiseToInput(l.maxDiscountPaisePerBill) : '',
    mayEditPrice: l?.mayEditPrice !== false,
    mayBackdateDays: l?.mayBackdateDays !== undefined ? String(l.mayBackdateDays) : '',
    mayOverrideCreditLimit: l?.mayOverrideCreditLimit === true,
  };
}

/** The limits to save, `null` for "no limits at all", or the first bad field. */
export function limitsFromForm(f: RoleLimitsForm): { limits?: PartnerRoleLimits | null; error?: keyof RoleLimitsForm } {
  const out: PartnerRoleLimits = {};
  if (f.maxDiscountPercent.trim()) {
    const n = Number(f.maxDiscountPercent);
    if (!Number.isFinite(n) || n < 0 || n > 100) return { error: 'maxDiscountPercent' };
    out.maxDiscountPercent = n;
  }
  if (f.maxDiscountPerBill.trim()) {
    const p = parseRupeesToPaise(f.maxDiscountPerBill);
    if (p === null) return { error: 'maxDiscountPerBill' };
    out.maxDiscountPaisePerBill = p;
  }
  if (f.mayBackdateDays.trim()) {
    const n = Number(f.mayBackdateDays);
    if (!Number.isInteger(n) || n < 0 || n > 365) return { error: 'mayBackdateDays' };
    out.mayBackdateDays = n;
  }
  if (!f.mayEditPrice) out.mayEditPrice = false;
  if (f.mayOverrideCreditLimit) out.mayOverrideCreditLimit = true;
  return { limits: Object.keys(out).length ? out : null };
}

export function RoleLimitsCard({
  c, value, onChange, error, disabled,
}: { c: ColorScheme; value: RoleLimitsForm; onChange: (v: RoleLimitsForm) => void; error?: keyof RoleLimitsForm; disabled?: boolean }) {
  const { t } = useTranslation();
  const set = (p: Partial<RoleLimitsForm>) => onChange({ ...value, ...p });
  const err = (k: keyof RoleLimitsForm) => (error === k ? t(`staff.limits.error.${k}`) : undefined);
  return (
    <Card c={c}>
      <Text style={{ color: c.textPrimary, fontWeight: '700' }}>{t('staff.limits.title')}</Text>
      <Text style={{ color: c.textSecondary, fontSize: 12 }}>{t('staff.limits.hint')}</Text>
      <View style={styles.row2}>
        <AppInput label={t('staff.limits.maxDiscountPercent')} value={value.maxDiscountPercent} onChangeText={(v) => set({ maxDiscountPercent: v })} keyboardType="numeric" error={err('maxDiscountPercent')} disabled={disabled} style={styles.half} />
        <AppInput label={t('staff.limits.maxDiscountPerBill')} value={value.maxDiscountPerBill} onChangeText={(v) => set({ maxDiscountPerBill: v })} keyboardType="numeric" error={err('maxDiscountPerBill')} disabled={disabled} style={styles.half} />
      </View>
      <AppInput label={t('staff.limits.mayBackdateDays')} value={value.mayBackdateDays} onChangeText={(v) => set({ mayBackdateDays: v })} keyboardType="numeric" error={err('mayBackdateDays')} disabled={disabled} />
      <View style={styles.switchRow}>
        <Text style={{ color: c.textPrimary, flex: 1 }}>{t('staff.limits.mayEditPrice')}</Text>
        <Switch value={value.mayEditPrice} onValueChange={(v) => set({ mayEditPrice: v })} disabled={disabled} accessibilityLabel={t('staff.limits.mayEditPrice')} />
      </View>
      <View style={styles.switchRow}>
        <Text style={{ color: c.textPrimary, flex: 1 }}>{t('staff.limits.mayOverrideCredit')}</Text>
        <Switch value={value.mayOverrideCreditLimit} onValueChange={(v) => set({ mayOverrideCreditLimit: v })} disabled={disabled} accessibilityLabel={t('staff.limits.mayOverrideCredit')} />
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  row2: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  half: { flexGrow: 1, flexBasis: 140 },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 48 },
});
