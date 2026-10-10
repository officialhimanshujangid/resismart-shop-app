import React, { useCallback, useEffect, useState } from 'react';
import { Alert, useColorScheme, View } from 'react-native';
import { ActivityIndicator, Text } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';

import { themeColors } from '../../../src/constants/colors';
import { qk } from '../../../src/lib/queryKeys';
import { apiErrorCode, apiErrorMessage } from '../../../src/api/axios';
import { usePartnerEntitlements } from '../../../src/hooks';
import { partnerApi, uploadKycFile, blockerFix, splitBlockers, PartnerKycDoc } from '../../../src/api/partner.api';
// The enum comes from the generated contract, not from a list typed out here —
// the same rule the rest of this app follows, and what stops a document type the
// server has retired from still being offered.
import { PARTNER_DOC_TYPES, PartnerDocType } from '../../../src/types/api-contract.generated';
// M19 redesign: kit buttons (haptic primary), grouped document rows with a visible remove hint, rise, skeleton.
import { Button, GroupRow } from '../../../src/components/ui';
import { Card, ChipRow, ErrorBlock, Loading, Screen, SectionLabel } from '../../../src/features/more/ui';

/**
 * The partner's own half of KYC, which this app did not have.
 *
 * Documents could only ever be attached inside the SIGNUP wizard — an `(auth)`
 * route a signed-in proprietor has no way back to. So a partner who skipped step
 * 5, or who was created from the owner console and never saw a wizard, had no
 * way to send anything in, and no screen anywhere told them that being
 * unverified is why no resident can find them.
 *
 * The web panel grew the same screen in this pass; this is its counterpart, on
 * the same endpoints (`/partners/me/kyc-docs`, `/me/submit-for-review`,
 * `/me/onboarding-status`). None of the rules are re-implemented: `canSubmit`
 * and `missing` come from the server, so the button cannot disagree with what
 * submitting would actually do.
 *
 * When the owner has switched KYC off, the upload half is not rendered. The
 * screen still exists, because the partner still needs somewhere that says
 * whether they have been approved and what else is in their way.
 */

export default function VerificationScreen() {
  const { t } = useTranslation();
  /**
   * The document TYPE is the enum `partner.model.ts` stores and the reviewer
   * filters on; only its label is translated. An unknown type — one a newer
   * server has added — still prints its own code rather than a blank row.
   */
  const docLabel = useCallback(
    (type: string) => (PARTNER_DOC_TYPES as readonly string[]).includes(type)
      ? t(`settings.verification.doc.${type}`)
      : type,
    [t],
  );
  const isDark = useColorScheme() === 'dark';
  const c = themeColors(isDark);
  const queryClient = useQueryClient();
  const { entitlements, refresh } = usePartnerEntitlements();

  const [docs, setDocs] = useState<PartnerKycDoc[]>([]);
  const [docType, setDocType] = useState<PartnerDocType>('GST');
  const [uploading, setUploading] = useState(false);
  const [removing, setRemoving] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const statusQuery = useQuery({
    queryKey: qk.onboarding.status(),
    queryFn: partnerApi.onboardingStatus,
  });
  const meQuery = useQuery({ queryKey: qk.partner.me(), queryFn: partnerApi.me });

  useEffect(() => {
    const attached = meQuery.data?.partner?.verification?.docs;
    if (attached) setDocs(attached);
  }, [meQuery.data]);

  const onboarding = statusQuery.data;
  // `!== false` everywhere, so a server that predates the switch still asks for
  // documents. Fail-closed, matching `isPartnerKycRequired` on the other end.
  const kycRequired = (onboarding?.kycRequired ?? entitlements.kycRequired) !== false;
  const vStatus = String(onboarding?.verificationStatus || 'UNSUBMITTED');
  const isVerified = vStatus === 'VERIFIED';
  // Documents are the reviewer's evidence while a review is open. The server
  // refuses the change too; this is so the buttons do not offer it.
  const docsLocked = vStatus === 'PENDING' || isVerified;

  const attach = useCallback(async () => {
    setUploading(true);
    try {
      const picked = await ImagePicker.launchImageLibraryAsync({
        // The string-array form. `MediaTypeOptions` is deprecated in this SDK
        // and reads as an object at runtime — same note as the wizard.
        mediaTypes: ['images'],
        quality: 0.7,
      });
      if (picked.canceled || !picked.assets.length) return;
      const asset = picked.assets[0];
      const uploaded = await uploadKycFile({
        uri: asset.uri,
        name: asset.fileName ?? `${docType.toLowerCase()}-${Date.now()}.jpg`,
        mimeType: asset.mimeType ?? 'image/jpeg',
      });
      const res = await partnerApi.addKycDoc({
        type: docType,
        url: uploaded.url,
        fileName: asset.fileName ?? undefined,
      });
      setDocs((d) => [...d, res.doc]);
      queryClient.setQueryData(qk.onboarding.status(), res.onboarding);
    } catch (e) {
      /**
       * Coded refusals are said in our words by `apiErrorMessage`:
       * 409 `KYC_DOCS_LOCKED_VERIFIED` (verified meanwhile — documents are
       * locked), 400 `KYC_DOC_NOT_YOURS`, 500 `UPLOAD_FAILED`. On the first,
       * the screen was stale: re-read it so the add button goes away.
       */
      if (apiErrorCode(e) === 'KYC_DOCS_LOCKED_VERIFIED') {
        void statusQuery.refetch();
        void meQuery.refetch();
      }
      Alert.alert(t('settings.verification.uploadFailed'), apiErrorMessage(e));
    } finally {
      setUploading(false);
    }
  }, [docType, queryClient, t, statusQuery, meQuery]);

  const removeDoc = useCallback((doc: PartnerKycDoc) => {
    Alert.alert(
      t('settings.verification.removeTitle', { document: docLabel(doc.type) }),
      t('settings.verification.removeBody'),
      [
        { text: t('settings.verification.removeKeep'), style: 'cancel' },
        {
          text: t('settings.verification.removeConfirm'),
          style: 'destructive',
          onPress: async () => {
            setRemoving(doc._id);
            try {
              const res = await partnerApi.removeKycDoc(doc._id);
              setDocs((d) => d.filter((x) => x._id !== doc._id));
              queryClient.setQueryData(qk.onboarding.status(), res.onboarding);
            } catch (e) {
              Alert.alert(t('settings.verification.removeFailed'), apiErrorMessage(e));
            } finally {
              setRemoving('');
            }
          },
        },
      ],
    );
  }, [queryClient, docLabel, t]);

  const submit = useCallback(async () => {
    setSubmitting(true);
    try {
      const res = await partnerApi.submitForReview();
      queryClient.setQueryData(qk.onboarding.status(), res.onboarding);
      await statusQuery.refetch();
      refresh();
      Alert.alert(t('settings.verification.sentTitle'), t('settings.verification.sentBody'));
    } catch (e) {
      Alert.alert(t('settings.verification.sendFailed'), apiErrorMessage(e));
    } finally {
      setSubmitting(false);
    }
  }, [queryClient, statusQuery, refresh, t]);

  /**
   * `isPending`, NOT `isLoading`, and the difference is a whole screen.
   *
   * In react-query v5 `isLoading` is `isPending && isFetching`, and `isFetching`
   * is `fetchStatus === 'fetching'` — a query the offline manager has PAUSED has
   * `fetchStatus === 'paused'`, so `isLoading` is false for it while `isPending`
   * stays true. Phase 3 wired `onlineManager` (`lib/queryClient.ts`), so from
   * that day a partner opening this screen with no signal fell straight past
   * this branch into the error branch below and read "We could not load your
   * verification just now" — a failure sentence for a request that was never
   * sent. `Loading` reads the same `onlineManager` and says "No connection"
   * instead.
   */
  if (statusQuery.isPending) return <Screen c={c} title={t('settings.verification.title')}><Loading c={c} skeleton={4} /></Screen>;
  if (statusQuery.isError || !onboarding) {
    return (
      <Screen c={c} title={t('settings.verification.title')}>
        <ErrorBlock
          c={c}
          message={t('settings.verification.couldNotLoad')}
          onRetry={() => void statusQuery.refetch()}
        />
      </Screen>
    );
  }

  /**
   * The two lists, split by the SERVER's `blocksDiscovery` — see `splitBlockers`.
   *
   * This screen kept its own `b.code !== 'NO_CATEGORY'`, which is the hard-coded
   * list the field was added to delete, and it was already wrong twice over:
   * under the heading "Residents cannot find you yet" it printed
   * `NO_AVAILABILITY`'s "Residents can find you, but nobody can book you…" and
   * `NOT_VERIFIED`'s "Residents can find you and call you…" — each sentence
   * contradicting the heading above it.
   */
  const { blocking, alsoCosting } = splitBlockers(entitlements.visibility);
  const visibility = entitlements.visibility;
  /** The blocker that carries the "we are still checking you" sentence, when that is the state. */
  const awaitingReview = visibility?.transactable === false
    ? alsoCosting.find((b) => b.code === 'NOT_VERIFIED')
    : undefined;

  /**
   * What the reviewer asked for — the "below" that `STATUS_LINE.REJECTED`
   * promises. It was promising nothing: the note was in the type and on the
   * wire and never on the screen, so a turned-down partner read "fix what is
   * noted below" over a page with no note on it.
   *
   * SAME fallback chain the signup wizard established (`(auth)/register.tsx`)
   * rather than a second one: the verification note first, then the older
   * top-level `rejectionReason` some rejection paths still write, then a
   * sentence — because "REJECTED" with nothing beside it is exactly the state
   * this screen exists to get somebody out of.
   *
   * Keyed off BOTH statuses. `verificationStatus` is what this screen reads
   * everywhere else, but a partner record can be REJECTED with its note under
   * the older field, and either one leaves somebody needing to know why.
   */
  const partnerRow = meQuery.data?.partner;
  const rejected = vStatus === 'REJECTED' || partnerRow?.status === 'REJECTED';
  const rejectionNote = rejected
    ? partnerRow?.verification?.note
      || partnerRow?.rejectionReason
      || t('settings.verification.defaultRejection')
    : '';

  return (
    <Screen
      c={c}
      title={t('settings.verification.title')}
      subtitle={t(`settings.verification.status${vStatus}`, { defaultValue: vStatus })}
      rise
    >
      {/* --------------------------------------------------- what our team said */}
      {!!rejectionNote && (
        <Card c={c}>
          <SectionLabel c={c}>{t('settings.verification.whatTeamSaid')}</SectionLabel>
          <Text style={{ color: c.textPrimary, marginTop: 6, lineHeight: 20 }}>{rejectionNote}</Text>
        </Card>
      )}

      {/* ------------------------------------------ live, waiting on a reviewer */}
      {/*
        THE UNIVERSAL POST-SUBMISSION STATE, and this screen was silent in it.

        A partner submits, is told bookings switch on after review, opens the
        app — and the card below never drew, because `discoverable` is TRUE for
        them: they are `ACTIVE`, they are in every resident's list, and only the
        trading gate is still shut. The one sentence explaining why no bookings
        arrive was on the wire the whole time and rendered on the web panel
        (`PartnerVisibilityAlert.tsx`), invisible in the app the proprietor
        actually uses. `transactable` is the field that says it; the message is
        `NOT_VERIFIED`'s own. No action — there is genuinely nothing to do.
      */}
      {awaitingReview && (
        <Card c={c} style={{ borderLeftWidth: 3, borderLeftColor: c.primary }}>
          <SectionLabel c={c}>{t('settings.verification.awaitingHeading')}</SectionLabel>
          {/* `message` is the SERVER's sentence and is English today — see the
              note in this phase's report about `ERROR_CATALOGUE`. The frame
              around it is ours and is translated. */}
          <Text style={{ color: c.textSecondary, marginTop: 6, lineHeight: 20 }}>
            {t('settings.verification.awaitingBody', { message: awaitingReview.message })}
          </Text>
        </Card>
      )}

      {/* ------------------------------------------------------- why it matters */}
      {visibility && !visibility.discoverable && (
        <Card c={c}>
          <SectionLabel c={c}>{t('settings.verification.cannotFindHeading')}</SectionLabel>
          {/*
            Each sentence is the server's, and each one that CAN be acted on in
            this app now carries the way to do it.

            The `href` the server sends with these is a web route
            (`/dashboard/partner-settings`) and was being ignored, which left the
            list naming problems with nothing to tap — including the map pin,
            whose only editor at the time was inside the signup wizard. The
            mapping is keyed off `code`, the stable half of the payload; the
            codes with no destination print as they always did. See `blockerFix`.
          */}
          {blocking.map((b) => {
            // NOT_VERIFIED's destination is this screen, and a button that opens
            // the screen it is drawn on is worse than no button. It no longer
            // reaches this list at all — it does not block discovery — but the
            // guard stays: `blocksDiscovery` is the server's to change back.
            const fix = b.code === 'NOT_VERIFIED' ? undefined : blockerFix(b.code);
            return (
              <View key={b.code} style={{ marginTop: 8 }}>
                <Text style={{ color: c.textSecondary }}>• {b.message}</Text>
                {fix && (
                  <Button variant="ghost" size="sm" icon="arrow-right" label={t(fix.labelKey)} onPress={() => router.push(fix.href)} />
                )}
              </View>
            );
          })}
        </Card>
      )}

      {/* ------------------------------------------- findable, still losing work */}
      {/*
        The quieter half of the same report, under a heading that is TRUE of it.
        These do not hide the business; they cost it customers — no category, or
        services with no working hours behind them. `NOT_VERIFIED` is excluded
        because it has its own card above, which says considerably more than a
        bullet would.
      */}
      {alsoCosting.some((b) => b.code !== 'NOT_VERIFIED') && (
        <Card c={c}>
          <SectionLabel c={c}>{t('settings.verification.stillCostingHeading')}</SectionLabel>
          {alsoCosting.filter((b) => b.code !== 'NOT_VERIFIED').map((b) => {
            const fix = blockerFix(b.code);
            return (
              <View key={b.code} style={{ marginTop: 8 }}>
                <Text style={{ color: c.textSecondary }}>• {b.message}</Text>
                {fix && (
                  <Button variant="ghost" size="sm" icon="arrow-right" label={t(fix.labelKey)} onPress={() => router.push(fix.href)} />
                )}
              </View>
            );
          })}
        </Card>
      )}

      {/* ------------------------------------------------------------- what is left */}
      {onboarding.missing.length > 0 && !isVerified && (
        <Card c={c}>
          <SectionLabel c={c}>{t('settings.verification.stillToDoHeading')}</SectionLabel>
          {onboarding.missing.map((m) => (
            <Text key={`${m.step}-${m.field}`} style={{ color: c.textSecondary, marginTop: 6 }}>
              • {m.message}
            </Text>
          ))}
        </Card>
      )}

      {/* ---------------------------------------------------------- documents */}
      {kycRequired ? (
        <Card c={c} style={{ padding: 0, overflow: 'hidden' }}>
          <View style={{ padding: 16, paddingBottom: 8 }}>
            <SectionLabel c={c}>{t('settings.verification.docsHeading', { count: docs.length })}</SectionLabel>
          </View>

          {docs.length === 0 ? (
            <Text style={{ color: c.textSecondary, paddingHorizontal: 16, paddingBottom: 16 }}>
              {t('settings.verification.docsEmpty')}
            </Text>
          ) : (
            docs.map((d) => (
              <GroupRow
                key={d._id}
                icon="file-document-outline"
                title={docLabel(d.type)}
                detail={d.fileName || t('settings.verification.attachedFile')}
                onPress={docsLocked ? undefined : () => removeDoc(d)}
                accessibilityHint={docsLocked ? undefined : t('settings.verification.removeConfirm')}
                trailing={
                  removing === d._id
                    ? <ActivityIndicator size="small" color={c.primary} />
                    : docsLocked ? undefined : <MaterialCommunityIcons name="trash-can-outline" size={20} color={c.error} />
                }
              />
            ))
          )}

          <View style={{ padding: 16, paddingTop: 8 }}>
            {docsLocked ? (
              <Text style={{ color: c.textSecondary }}>
                {isVerified
                  ? t('settings.verification.lockedVerified')
                  : t('settings.verification.lockedPending')}
              </Text>
            ) : (
              <>
                <ChipRow<PartnerDocType>
                  c={c}
                  options={PARTNER_DOC_TYPES.map((k) => ({ key: k, label: docLabel(k) }))}
                  value={docType}
                  onChange={setDocType}
                />
                <Button
                  fullWidth
                  icon="paperclip"
                  label={t('settings.verification.attach')}
                  onPress={attach}
                  loading={uploading}
                  disabled={uploading}
                  style={{ marginTop: 12 }}
                />
              </>
            )}
          </View>
        </Card>
      ) : (
        <Card c={c}>
          <Text style={{ color: c.textSecondary }}>
            {t('settings.verification.kycNotRequired')}
          </Text>
        </Card>
      )}

      {/* ------------------------------------------------------------- submit */}
      {!isVerified && vStatus !== 'PENDING' && (
        <Card c={c}>
          <Text style={{ color: c.textSecondary, marginBottom: 12 }}>
            {onboarding.canSubmit
              ? t('settings.verification.canSubmit')
              : t('settings.verification.cannotSubmit')}
          </Text>
          <Button
            fullWidth
            label={t('settings.verification.submit')}
            onPress={submit}
            loading={submitting}
            disabled={!onboarding.canSubmit || submitting}
          />
        </Card>
      )}
    </Screen>
  );
}
