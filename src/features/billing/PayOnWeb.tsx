// >>> PAY-D (P1-22, Owner D4a) — "Pay on web": plans are bought on the website in every
// app (society, shop, corporate), with the same words. Asks the server for the open hosted
// pay link (`GET /billing/pay-on-web`), else opens the web billing page. Only the ResiSmart
// PLAN goes through here; customer payments in the shop are unchanged.
import React, { useCallback, useState } from 'react';
import { Alert, Linking } from 'react-native';
import { useTranslation } from 'react-i18next';
import { apiClient } from '../../api/axios';
import { IN_APP_PLAN_PURCHASES, WEB_BILLING_URL } from '../../constants/app';
import { Row } from '../more/ui';
import type { ColorScheme } from '../../constants/colors';

/** The URL to open: the server's answer when it is an http(s) link, else the web billing page. */
export async function payOnWebUrl(
  get: (url: string) => Promise<{ data?: { url?: unknown } }> = (u) => apiClient.get(u),
): Promise<string> {
  try {
    const res = await get('/billing/pay-on-web');
    const url = res?.data?.url;
    if (typeof url === 'string' && /^https?:\/\//i.test(url)) return url;
  } catch { /* the web billing page then */ }
  return WEB_BILLING_URL;
}

export function PayOnWebRow({ c }: { c: ColorScheme }) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  const open = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    const url = await payOnWebUrl();
    try {
      await Linking.openURL(url);
    } catch {
      Alert.alert(t('settings.plan.browserFailedTitle'), t('settings.plan.browserFailedBody', { url }));
    } finally {
      setBusy(false);
    }
  }, [busy, t]);
  // Play Payments policy: a store build may not point anyone to pay for the plan elsewhere.
  // Hidden until IN_APP_PLAN_PURCHASES (a BUILD constant) is turned on with Play Billing.
  if (!IN_APP_PLAN_PURCHASES) return null;
  return <Row c={c} icon="open-in-new" title={t('billing.payOnWeb')} subtitle={t('billing.payOnWebHelp')} onPress={() => void open()} />;
}
// <<< PAY-D
