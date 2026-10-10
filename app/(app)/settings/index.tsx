import React from 'react';
import { useColorScheme } from 'react-native';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { themeColors } from '../../../src/constants/colors';
import { usePartnerEntitlements } from '../../../src/hooks';
import { toHref } from '../../../src/features/billing/routeHref';
import { Screen } from '../../../src/features/more/ui';
import { Segmented } from '../../../src/components/ui';
import { GroupRow, ListGroup } from '../../../src/components/ui/ListGroup';
import { Rise } from '../../../src/theme/motion';
import { LANGUAGE_NATIVE_NAME, Language, SUPPORTED } from '../../../src/i18n';
import { useLanguage } from '../../../src/i18n/useLanguage';
import { useAuth } from '../../../src/context/AuthContext';
import { isOwnerSession } from '../../../src/features/owners/access';
import { useMyReach } from '../../../src/features/society/hooks';
import { isSocietyPartner } from '../../../src/features/society/logic';

/**
 * Settings hub (1R redesign): the same rows, now as grouped lists (one card
 * per section, rows split by hairlines) that rise in with a short stagger.
 * Every row opens the same screen it did before.
 */
export default function SettingsHubScreen() {
  const { t } = useTranslation();
  const c = themeColors(useColorScheme() === 'dark');
  const { can, entitlements, moduleState } = usePartnerEntitlements();
  const { language, setLanguage } = useLanguage();
  const { profile } = useAuth();
  const owner = isOwnerSession(profile);
  /** P3: "Who can find you" exists only for a business that joined through its society. */
  const societyPartner = isSocietyPartner(useMyReach().data);
  const level = can('SETTINGS', 'FULL') ? t('settings.hub.levelManage') : t('settings.hub.levelViewOnly');

  /**
   * Invoice settings belongs to the INVOICING module (`requirePartnerModule`).
   *   ON   open the screen.
   *   OFF  drop the row silently — the partner switched invoicing off themselves
   *        and it is one tap away under Modules.
   *   (X2F: there is no LOCKED state — every partner plan has every module.)
   */
  const invoicingState = moduleState('INVOICING');

  /**
   * The row's own detail carries the state — THREE states, because the server
   * reports two booleans and they come apart: not discoverable, discoverable
   * but not yet bookable, or the verification status. `=== false` so an older
   * response, which carries neither field, falls through to the status.
   */
  const verificationSubtitle = entitlements.visibility?.discoverable === false
    ? t('settings.hub.verificationNotDiscoverable')
    : entitlements.visibility?.transactable === false
      ? t('settings.hub.verificationNotTransactable')
      : entitlements.business?.verificationStatus === 'VERIFIED'
        ? t('settings.hub.verificationVerified')
        : t('settings.hub.verificationPending');

  return (
    <Screen c={c} title={t('settings.hub.title')} subtitle={level} back={false}>
      <Rise index={0}>
        <ListGroup title={t('settings.hub.businessSection')}>
          {/* "for your bills" in the detail is doing real work: this screen and
              "Address & map pin" both show City / State / Pincode and they write
              DIFFERENT documents. */}
          <GroupRow
            icon="office-building-outline"
            title={t('settings.hub.businessDetails')}
            detail={t('settings.hub.businessDetailsSub')}
            onPress={() => router.push('/settings/business')}
          />
          {invoicingState !== 'OFF' ? (
            <GroupRow
              icon="receipt-text-outline"
              tint="teal"
              title={t('settings.hub.invoice')}
              detail={t('settings.hub.invoiceSub') /* X2F: no LOCKED state — every plan has invoicing */}
              onPress={() => router.push('/settings/invoice')}
            />
          ) : null}
        </ListGroup>
      </Rise>

      {/* The plan itself — what it is, what it costs, when it renews, receipts. */}
      <Rise index={1}>
        <ListGroup title={t('settings.hub.planSection')}>
          <GroupRow
            icon="card-account-details-outline"
            tint="violet"
            title={t('settings.hub.plan')}
            detail={
              entitlements.plan.isTrial
                ? t('settings.hub.planTrialSub')
                // `plan.name` is empty when the server named no plan.
                : t('settings.hub.planSub', { plan: entitlements.plan.name || t('settings.plan.unknownName') })
            }
            onPress={() => router.push(toHref('/settings/plan'))}
          />
        </ListGroup>
      </Rise>

      <Rise index={2}>
        <ListGroup title={t('settings.hub.foundSection')}>
          {/* The map pin is the field discovery actually measures. */}
          <GroupRow
            icon="map-marker-outline"
            tint="sky"
            title={t('settings.hub.address')}
            detail={t('settings.hub.addressSub')}
            onPress={() => router.push('/settings/address')}
          />
          {/* `serviceModes` — the field discovery tests. */}
          <GroupRow
            icon="map-marker-radius-outline"
            tint="sky"
            title={t('settings.hub.whereYouWork')}
            detail={t('settings.hub.whereYouWorkSub')}
            onPress={() => router.push('/settings/where-you-work')}
          />
          {/* Documents in, and what ResiSmart decided. */}
          <GroupRow
            icon="shield-check-outline"
            title={t('settings.hub.verification')}
            detail={verificationSubtitle}
            onPress={() => router.push('/settings/verification')}
          />
          {societyPartner ? (
            <GroupRow
              icon="account-search-outline"
              tint="blue"
              title={t('more.rows.reach')}
              detail={t('more.rows.reachBlurb')}
              onPress={() => router.push('/settings/reach')}
            />
          ) : null}
        </ListGroup>
      </Rise>

      <Rise index={3}>
        <ListGroup title={t('settings.hub.alertsSection')}>
          <GroupRow
            icon="whatsapp"
            title={t('settings.hub.whatsapp')}
            detail={t('settings.hub.whatsappSub')}
            onPress={() => router.push('/settings/notifications')}
          />
          {/* C7 — switch modules off/on (web `settings/modules`); the screen
              itself requires SETTINGS FULL to change anything. */}
          <GroupRow
            icon="view-grid-outline"
            tint="amber"
            title={t('settings.hub.modules')}
            detail={t('settings.hub.modulesSub')}
            onPress={() => router.push('/settings/modules')}
          />
          {/* P2 — pharmacy, subscriptions & tuition, appointments, jobs. */}
          <GroupRow
            icon="storefront-edit-outline"
            tint="amber"
            title={t('p2.settings.title')}
            detail={t('p2.settings.hubSub')}
            onPress={() => router.push('/settings/business-types')}
          />
        </ListGroup>
      </Rise>

      {/*
        The language belongs to the PHONE rather than to the account
        (`DEVICE_KEYS.LANGUAGE`), and is reachable at SETTINGS READ: it writes
        nothing a member of staff is not entitled to change about themselves.
        The hint matters — Hindi here also changes what the SERVER sends
        (`syncLanguage()` → `User.language`).
      */}
      <Rise index={4}>
        <ListGroup title={t('settings.language.section')}>
          <GroupRow icon="translate" tint="blue" title={t('settings.language.title')} detail={t('settings.language.hint')} />
          <Segmented<Language>
            value={language}
            options={SUPPORTED.map((l) => ({ key: l as Language, label: LANGUAGE_NATIVE_NAME[l] }))}
            onChange={setLanguage}
            style={{ marginHorizontal: 14, marginBottom: 14 }}
            testID="settings-language"
          />
        </ListGroup>
      </Rise>

      {/* Owners only (CONTRACT-partner-P0 §6.1/§6.3). Staff never see this section. */}
      {owner ? (
        <Rise index={5}>
          <ListGroup title={t('settings.hub.ownershipSection')}>
            <GroupRow
              icon="account-key-outline"
              tint="violet"
              title={t('settings.hub.owners')}
              detail={t('settings.hub.ownersSub')}
              onPress={() => router.push('/owners')}
            />
            <GroupRow
              icon="archive-outline"
              title={t('settings.hub.archive')}
              detail={t('settings.hub.archiveSub')}
              onPress={() => router.push('/settings/archive')}
              danger
            />
          </ListGroup>
        </Rise>
      ) : null}
    </Screen>
  );
}
