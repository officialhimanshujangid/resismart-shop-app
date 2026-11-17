/**
 * PAY-C P1-10 (Owner D7a) — who gets ResiSmart's billing mail: every admin of this
 * business, plus one optional "billing email" (cc). Same endpoint, rule and words as
 * the web card (`GET` / `PUT /billing/contact`, `BILLING_EMAIL_INVALID`). Admins only.
 */
import React, { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { apiClient } from '../../api/axios';
import { Button, Card, TextField } from '../../components/ui';
import { useAppTheme } from '../../theme/useAppTheme';
import { Rise } from '../../theme/motion';

export const BILLING_EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

interface Contact { billingCcEmail: string | null; recipients: string[]; recipientCount: number }

export function BillingContactCard({ index = 4 }: { index?: number }) {
  const { t } = useTranslation();
  const { ds, status } = useAppTheme();
  const [data, setData] = useState<Contact | null>(null);
  const [value, setValue] = useState('');
  const [error, setError] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let live = true;
    apiClient.get('/billing/contact')
      .then((r) => { if (!live) return; const d = r.data?.data as Contact; setData(d); setValue(d?.billingCcEmail || ''); })
      .catch(() => { if (live) setData(null); });
    return () => { live = false; };
  }, []);

  if (!data) return null;
  const trimmed = value.trim().toLowerCase();
  const unchanged = trimmed === (data.billingCcEmail || '');

  const save = async (next: string) => {
    setNote('');
    if (next && !BILLING_EMAIL_RE.test(next)) { setError(t('settings.plan.contact.invalid')); return; }
    setError('');
    setSaving(true);
    try {
      const r = await apiClient.put('/billing/contact', { billingCcEmail: next });
      const cc = (r.data?.data?.billingCcEmail as string | null) ?? null;
      setData({ ...data, billingCcEmail: cc });
      setValue(cc || '');
      setNote(next ? t('settings.plan.contact.saved') : t('settings.plan.contact.cleared'));
    } catch (e: unknown) {
      const code = (e as { response?: { data?: { code?: string } } })?.response?.data?.code;
      setError(code === 'BILLING_EMAIL_INVALID' ? t('settings.plan.contact.invalid') : t('settings.plan.contact.saveFailed'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Rise index={index}>
      <Card style={{ gap: 10 }} testID="billing-contact">
        <View style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start' }}>
          <MaterialCommunityIcons name="email-outline" size={20} color={ds.primary} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={{ color: ds.ink, fontSize: 16, fontWeight: '700' }}>{t('settings.plan.contact.title')}</Text>
            <Text style={{ color: ds.muted, fontSize: 13, marginTop: 2 }}>{t('settings.plan.contact.help')}</Text>
          </View>
        </View>
        <Text style={{ color: ds.ink, fontSize: 13, fontWeight: '600' }}>{t('settings.plan.contact.goesTo', { count: data.recipientCount })}</Text>
        {data.recipients.length > 0 ? (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
            {data.recipients.map((e) => (
              <Text key={e} style={{ color: ds.ink, fontSize: 12, borderWidth: 1, borderColor: ds.line, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3 }}>{e}</Text>
            ))}
          </View>
        ) : null}
        <TextField
          label={t('settings.plan.contact.ccLabel')}
          hint={t('settings.plan.contact.ccHint')}
          error={error || undefined}
          value={value}
          onChangeText={(v) => { setValue(v); if (error) setError(''); }}
          placeholder={t('settings.plan.contact.ccPlaceholder')}
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="email"
          maxLength={254}
        />
        {note ? <Text style={{ color: status.success.fg, fontSize: 12 }} accessibilityLiveRegion="polite">{note}</Text> : null}
        <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
          <Button label={t('settings.plan.contact.save')} size="sm" loading={saving} disabled={saving || unchanged} onPress={() => { void save(trimmed); }} testID="billing-contact-save" />
          {data.billingCcEmail ? (
            <Button label={t('settings.plan.contact.clear')} size="sm" variant="ghost" disabled={saving} onPress={() => { void save(''); }} />
          ) : null}
        </View>
      </Card>
    </Rise>
  );
}
