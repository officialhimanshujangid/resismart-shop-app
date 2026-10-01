import React, { useState } from 'react';
import { Alert, View } from 'react-native';
import { Text } from 'react-native-paper';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';

import { ColorScheme } from '../../../constants/colors';
import { qk } from '../../../lib/queryKeys';
import { formatPaise } from '../../../lib/money';
import { formatI18nDate } from '../../../i18n';
import { apiErrorMessage } from '../../../api/axios';
import type { PartnerParty } from '../../../api/parties.api';
import { Card, SectionLabel } from '../../more/ui';
import { ActionRow, PillButton } from '../../p1/ui';
import { khataApi } from '../api';
import { useKhataActions } from '../useKhataActions';
import { KhataSettingsDialog } from './KhataSettingsDialog';

/**
 * The customer side of a party (screens S14/S15): credit limit and days, the
 * collection plan, and the reminder verbs — Remind (share), app notification
 * (resident-linked only), UPI payment link, statement link / PDF, revoke links.
 * Writing needs CUSTOMERS at FULL; reading at READ shows the summary only.
 */
export function KhataPanel({
  c, party, canManage, onMessage,
}: { c: ColorScheme; party: PartnerParty; canManage: boolean; onMessage: (text: string) => void }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const actions = useKhataActions(onMessage);
  const owes = party.outstandingPaise > 0;

  const save = useMutation({
    mutationFn: (body: Parameters<typeof khataApi.saveSettings>[1]) => khataApi.saveSettings(party._id, body),
    onSuccess: () => {
      setSettingsOpen(false);
      void queryClient.invalidateQueries({ queryKey: qk.parties.all() });
      onMessage(t('khata.settings.saved'));
    },
    onError: (e) => onMessage(apiErrorMessage(e, t('khata.settings.failed'))),
  });

  const credit = party.credit;
  const plan = party.collectionPlan;

  return (
    <View style={{ gap: 10 }} testID="khata-panel">
      <SectionLabel c={c}>{t('khata.panelSection')}</SectionLabel>
      <Card c={c}>
        <Text style={{ color: c.textPrimary, fontSize: 13 }}>
          {typeof credit?.limitPaise === 'number'
            ? t('khata.limitLine', { amount: formatPaise(credit.limitPaise), mode: t(`khata.mode.${credit.mode ?? 'WARN'}`) })
            : t('khata.noLimit')}
        </Text>
        {typeof credit?.days === 'number' ? (
          <Text style={{ color: c.textSecondary, fontSize: 12.5 }}>{t('khata.daysLine', { count: credit.days })}</Text>
        ) : null}
        <Text style={{ color: c.textSecondary, fontSize: 12.5 }}>
          {plan?.cadence && plan.cadence !== 'NONE'
            ? t('khata.planLine', {
              cadence: t(`khata.cadence.${plan.cadence}`),
              date: plan.nextDate ? formatI18nDate(plan.nextDate, t) : '—',
            })
            : t('khata.noPlan')}
          {plan?.autoRemind ? t('khata.autoOnSuffix') : ''}
        </Text>
        {plan?.lastRemindedAt ? (
          <Text style={{ color: c.textSecondary, fontSize: 12 }}>{t('khata.lastReminded', { date: formatI18nDate(plan.lastRemindedAt, t) })}</Text>
        ) : null}
        {plan?.optedOutAt ? <Text style={{ color: c.warning, fontSize: 12 }}>{t('errors.KHATA_REMINDER_OPTED_OUT')}</Text> : null}
      </Card>
      {canManage && (
        <ActionRow>
          {owes && (
            <PillButton c={c} icon="whatsapp" label={t('khata.remind')} disabled={!!actions.busy} onPress={() => void actions.remindShare(party._id)} testID="khata-remind" />
          )}
          {owes && (party.isResidentLinked || !!party.residentUserId) && (
            <PillButton c={c} tone="outline" icon="bell-ring-outline" label={t('khata.remindApp')} disabled={!!actions.busy} onPress={() => void actions.remindPush(party._id)} />
          )}
          {owes && (
            <PillButton c={c} tone="outline" icon="qrcode" label={t('khata.upiLink')} disabled={!!actions.busy} onPress={() => void actions.shareUpi(party._id)} />
          )}
          <PillButton c={c} tone="outline" icon="link-variant" label={t('khata.statementLink')} disabled={!!actions.busy} onPress={() => void actions.shareStatementLink(party._id)} />
          <PillButton c={c} tone="outline" icon="file-pdf-box" label={t('khata.statementPdf')} disabled={!!actions.busy} onPress={() => void actions.shareStatementPdf(party._id, party.name)} />
          <PillButton c={c} tone="outline" icon="cog-outline" label={t('khata.settingsButton')} onPress={() => setSettingsOpen(true)} testID="khata-settings" />
          <PillButton
            c={c}
            tone="danger"
            icon="link-variant-off"
            label={t('khata.revoke')}
            disabled={!!actions.busy}
            onPress={() => Alert.alert(t('khata.revokeTitle'), t('khata.revokeBody'), [
              { text: t('common.cancel'), style: 'cancel' },
              { text: t('khata.revoke'), style: 'destructive', onPress: () => void actions.revokeLinks(party._id) },
            ])}
          />
        </ActionRow>
      )}
      <KhataSettingsDialog
        visible={settingsOpen}
        name={party.name}
        credit={credit}
        plan={plan}
        submitting={save.isPending}
        onCancel={() => setSettingsOpen(false)}
        onSubmit={(body) => save.mutate(body)}
      />
    </View>
  );
}
