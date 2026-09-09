import React from 'react';
import { StyleSheet, useColorScheme, View } from 'react-native';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { themeColors } from '../../../src/constants/colors';
import { usePartnerEntitlements } from '../../../src/hooks';
import { toHref } from '../../../src/features/billing/routeHref';
import { Card, ChipRow, Row, Screen, SectionLabel } from '../../../src/features/more/ui';
import { LANGUAGE_NATIVE_NAME, Language, SUPPORTED } from '../../../src/i18n';
import { useLanguage } from '../../../src/i18n/useLanguage';

export default function SettingsHubScreen() {
  const { t } = useTranslation();
  const c = themeColors(useColorScheme() === 'dark');
  const { can, entitlements, moduleState } = usePartnerEntitlements();
  const { language, setLanguage } = useLanguage();
  const level = can('SETTINGS', 'FULL') ? t('settings.hub.levelManage') : t('settings.hub.levelViewOnly');

  /**
   * Invoice settings belongs to the INVOICING module, and this row used to
   * ignore that entirely.
   *
   * `partner-billing-settings.routes.ts` sits behind `requirePartnerModule('INVOICING')`,
   * so a partner whose plan does not sell invoicing tapped "Invoice settings",
   * watched a screen open, and got `404 MODULE_NOT_AVAILABLE` from its very
   * first request. That is the error the owner actually hit.
   *
   * The three states are handled the way the rest of the app handles them —
   * `moduleStateOf`, not a second rule invented here:
   *
   *   ON      open the screen.
   *   OFF     drop the row silently. The partner switched invoicing off
   *           themselves and it is one tap away under Modules, two rows down.
   *           A settings screen that keeps arguing with a setting is one people
   *           stop trusting.
   *   LOCKED  KEEP the row, say plainly that the plan does not include it, and
   *           send the tap to the plan screen instead of into a 404. Hiding it
   *           is the wrong answer for LOCKED for the same reason it is wrong in
   *           the More menu: a partner who never learns invoicing exists never
   *           buys it.
   */
  const invoicingState = moduleState('INVOICING');

  /**
   * The row's own subtitle carries the state, so a partner who is invisible
   * learns it from the menu rather than by opening every screen looking for the
   * reason nobody is booking them.
   *
   * THREE states, not two, because the server reports two booleans and they come
   * apart. `discoverable` false is "nobody can find you". `transactable` false
   * with `discoverable` true is the ordinary state of a partner who has just
   * submitted — findable, callable, and not yet bookable — and reading only the
   * first boolean sent every one of them to a row that said "Documents and
   * approval status", which is a filing cabinet rather than an answer to the
   * question they have. `=== false` so an older response, which carries neither
   * field, still falls through to the verification status below.
   */
  const verificationSubtitle = entitlements.visibility?.discoverable === false
    ? t('settings.hub.verificationNotDiscoverable')
    : entitlements.visibility?.transactable === false
      ? t('settings.hub.verificationNotTransactable')
      : entitlements.business?.verificationStatus === 'VERIFIED'
        ? t('settings.hub.verificationVerified')
        : t('settings.hub.verificationPending');

  const Divider = () => <View style={[styles.divider, { backgroundColor: c.divider }]} />;

  return (
    <Screen c={c} title={t('settings.hub.title')} subtitle={level} back={false}>
      <SectionLabel c={c}>{t('settings.hub.businessSection')}</SectionLabel>
      <Card c={c} style={{ padding: 0, overflow: 'hidden' }}>
        {/* "for your bills" is doing real work in that subtitle. This screen and
            "Address & map pin" below both show City / State / Pincode and they
            write DIFFERENT documents — this one the invoicing identity, that one
            the listing residents search. Somebody who fills in the wrong pair
            gets a success toast and an unchanged checklist. */}
        <Row
          c={c}
          icon="office-building-outline"
          title={t('settings.hub.businessDetails')}
          subtitle={t('settings.hub.businessDetailsSub')}
          onPress={() => router.push('/settings/business')}
        />
        {invoicingState !== 'OFF' && (
          <>
            <Divider />
            <Row
              c={c}
              icon="receipt-text-outline"
              title={t('settings.hub.invoice')}
              subtitle={
                invoicingState === 'LOCKED'
                  ? t('settings.hub.invoiceLocked')
                  : t('settings.hub.invoiceSub')
              }
              onPress={
                invoicingState === 'LOCKED'
                  ? () => router.push(toHref('/settings/plan'))
                  : () => router.push('/settings/invoice')
              }
            />
          </>
        )}
      </Card>

      {/* The plan itself — what it is, what it costs, when it renews, and every
          receipt ResiSmart has issued. Reachable at SETTINGS READ like the rest
          of this hub; the screen withholds the money from anyone the
          `/billing/**` routes will not authorise, rather than hiding itself. */}
      <SectionLabel c={c}>{t('settings.hub.planSection')}</SectionLabel>
      <Card c={c} style={{ padding: 0, overflow: 'hidden' }}>
        <Row
          c={c}
          icon="card-account-details-outline"
          title={t('settings.hub.plan')}
          subtitle={
            entitlements.plan.isTrial
              ? t('settings.hub.planTrialSub')
              // `plan.name` is empty when the server named no plan — the
              // sentinel `usePartnerEntitlements#normalise` sets. Named here
              // rather than in the hook, because this is where it is read.
              : t('settings.hub.planSub', { plan: entitlements.plan.name || t('settings.plan.unknownName') })
          }
          onPress={() => router.push(toHref('/settings/plan'))}
        />
      </Card>

      <SectionLabel c={c}>{t('settings.hub.foundSection')}</SectionLabel>
      <Card c={c} style={{ padding: 0, overflow: 'hidden' }}>
        {/* The map pin had no editor after registration either, and it is the
            field discovery actually measures: `expo-location` and every
            coordinate in this app lived in the signup wizard, which refuses an
            ACTIVE partner. A business with no pin was invisible at every
            distance with nothing on any screen able to change it. */}
        <Row
          c={c}
          icon="map-marker-outline"
          title={t('settings.hub.address')}
          subtitle={t('settings.hub.addressSub')}
          onPress={() => router.push('/settings/address')}
        />
        <Divider />
        {/* `serviceModes` had no editor after registration — see the screen's
            own note. It is the field discovery tests, so a partner without it
            is one no resident can be matched to. */}
        <Row
          c={c}
          icon="map-marker-radius-outline"
          title={t('settings.hub.whereYouWork')}
          subtitle={t('settings.hub.whereYouWorkSub')}
          onPress={() => router.push('/settings/where-you-work')}
        />
        <Divider />
        {/* Where the proprietor sends documents in and reads what ResiSmart
            decided. It had no entry anywhere: documents could only be attached
            inside the signup wizard, which a signed-in partner cannot get back
            to — so a partner who skipped step 5, or who was added by the owner
            console, could not become verified and therefore could never be
            found by a resident. */}
        <Row
          c={c}
          icon="shield-check-outline"
          title={t('settings.hub.verification')}
          subtitle={verificationSubtitle}
          onPress={() => router.push('/settings/verification')}
        />
      </Card>

      <SectionLabel c={c}>{t('settings.hub.alertsSection')}</SectionLabel>
      <Card c={c} style={{ padding: 0, overflow: 'hidden' }}>
        <Row
          c={c}
          icon="whatsapp"
          title={t('settings.hub.whatsapp')}
          subtitle={t('settings.hub.whatsappSub')}
          onPress={() => router.push('/settings/notifications')}
        />
        <Divider />
        {/* C7 — see what this business uses and switch it off/on, matching
            web `settings/modules`. Reachable at READ (this hub's own gate),
            the screen itself requires SETTINGS FULL to change anything. */}
        <Row
          c={c}
          icon="view-grid-outline"
          title={t('settings.hub.modules')}
          subtitle={t('settings.hub.modulesSub')}
          onPress={() => router.push('/settings/modules')}
        />
      </Card>

      {/*
        The language, and it belongs to the PHONE rather than to the account —
        `DEVICE_KEYS.LANGUAGE`, so it survives a sign-out and a business switch
        (`constants/app.ts:32-48`). A counter phone is shared; the person holding
        it reads what they read whoever is signed in.

        Reachable at SETTINGS READ, unlike every other row in this hub that
        writes something: this writes nothing on the server that a member of
        staff is not already entitled to change about themselves, and gating the
        language behind a permission would leave a Hindi-reading assistant
        working in English because the proprietor holds the FULL grant.

        The hint is not decoration. Picking Hindi here also changes what the
        SERVER sends — `syncLanguage()` mirrors it to `User.language`, which is
        the only field `messaging.service.ts:808` reads when it chooses which
        half of `notification-copy.ts` to send — and a partner who is not told
        that has no way to discover it.
      */}
      <SectionLabel c={c}>{t('settings.language.section')}</SectionLabel>
      <Card c={c}>
        <Row c={c} icon="translate" title={t('settings.language.title')} subtitle={t('settings.language.hint')} />
        <ChipRow
          c={c}
          value={language}
          options={SUPPORTED.map((l) => ({ key: l as Language, label: LANGUAGE_NATIVE_NAME[l] }))}
          onChange={setLanguage}
        />
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  divider: { height: StyleSheet.hairlineWidth, marginLeft: 62 },
});
