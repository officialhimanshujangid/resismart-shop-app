import React, { useCallback, useEffect, useState } from 'react';
import { Alert, useColorScheme, View } from 'react-native';
import { ActivityIndicator, Button, Text } from 'react-native-paper';
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import { themeColors } from '../../../src/constants/colors';
import { qk } from '../../../src/lib/queryKeys';
import { apiErrorMessage } from '../../../src/api/axios';
import { usePartnerEntitlements } from '../../../src/hooks';
import { partnerApi, uploadKycFile, blockerFix, splitBlockers, PartnerKycDoc } from '../../../src/api/partner.api';
// The enum comes from the generated contract, not from a list typed out here —
// the same rule the rest of this app follows, and what stops a document type the
// server has retired from still being offered.
import { PARTNER_DOC_TYPES, PartnerDocType } from '../../../src/types/api-contract.generated';
import { AppButton } from '../../../src/components/AppButton';
import { Card, ChipRow, ErrorBlock, Loading, Row, Screen, SectionLabel } from '../../../src/features/more/ui';

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

const DOC_LABELS: Record<PartnerDocType, string> = {
  GST: 'GST certificate',
  PAN: 'PAN card',
  LICENSE: 'Trade licence',
  SHOP_ACT: 'Shop & Establishment',
  OTHER: 'Other document',
};

const DOC_OPTIONS: { key: PartnerDocType; label: string }[] =
  PARTNER_DOC_TYPES.map((k) => ({ key: k, label: DOC_LABELS[k] }));

const STATUS_LINE: Record<string, string> = {
  VERIFIED: 'Verified — residents can find you.',
  PENDING: 'With our team now. We will let you know when it is decided.',
  REJECTED: 'Turned down. Fix what is noted below and send it again.',
  UNSUBMITTED: 'Not sent yet.',
};

export default function VerificationScreen() {
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
      Alert.alert('That upload did not go through', apiErrorMessage(e));
    } finally {
      setUploading(false);
    }
  }, [docType, queryClient]);

  const removeDoc = useCallback((doc: PartnerKycDoc) => {
    Alert.alert(
      `Remove ${DOC_LABELS[doc.type] ?? doc.type}?`,
      'It is deleted from your profile. You can attach it again before you send your profile in.',
      [
        { text: 'Keep it', style: 'cancel' },
        {
          text: 'Remove it',
          style: 'destructive',
          onPress: async () => {
            setRemoving(doc._id);
            try {
              const res = await partnerApi.removeKycDoc(doc._id);
              setDocs((d) => d.filter((x) => x._id !== doc._id));
              queryClient.setQueryData(qk.onboarding.status(), res.onboarding);
            } catch (e) {
              Alert.alert('Could not remove that', apiErrorMessage(e));
            } finally {
              setRemoving('');
            }
          },
        },
      ],
    );
  }, [queryClient]);

  const submit = useCallback(async () => {
    setSubmitting(true);
    try {
      const res = await partnerApi.submitForReview();
      queryClient.setQueryData(qk.onboarding.status(), res.onboarding);
      await statusQuery.refetch();
      refresh();
      Alert.alert('Sent to ResiSmart', 'We will let you know either way.');
    } catch (e) {
      Alert.alert('Could not send it', apiErrorMessage(e));
    } finally {
      setSubmitting(false);
    }
  }, [queryClient, statusQuery, refresh]);

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
  if (statusQuery.isPending) return <Screen c={c} title="Verification"><Loading c={c} /></Screen>;
  if (statusQuery.isError || !onboarding) {
    return (
      <Screen c={c} title="Verification">
        <ErrorBlock
          c={c}
          message="We could not load your verification just now."
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
      || 'Our team asked for a correction before this can go live.'
    : '';

  return (
    <Screen c={c} title="Verification" subtitle={STATUS_LINE[vStatus] ?? vStatus}>
      {/* --------------------------------------------------- what our team said */}
      {!!rejectionNote && (
        <Card c={c}>
          <SectionLabel c={c}>What our team said</SectionLabel>
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
          <SectionLabel c={c}>You are live — we are still checking your documents</SectionLabel>
          <Text style={{ color: c.textSecondary, marginTop: 6, lineHeight: 20 }}>
            {awaitingReview.message} There is nothing for you to do; we will let you know as soon as it
            is done.
          </Text>
        </Card>
      )}

      {/* ------------------------------------------------------- why it matters */}
      {visibility && !visibility.discoverable && (
        <Card c={c}>
          <SectionLabel c={c}>Residents cannot find you yet</SectionLabel>
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
                  <Button
                    mode="text"
                    compact
                    onPress={() => router.push(fix.href)}
                    contentStyle={{ justifyContent: 'flex-start' }}
                  >
                    {fix.label}
                  </Button>
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
          <SectionLabel c={c}>Still costing you business</SectionLabel>
          {alsoCosting.filter((b) => b.code !== 'NOT_VERIFIED').map((b) => {
            const fix = blockerFix(b.code);
            return (
              <View key={b.code} style={{ marginTop: 8 }}>
                <Text style={{ color: c.textSecondary }}>• {b.message}</Text>
                {fix && (
                  <Button
                    mode="text"
                    compact
                    onPress={() => router.push(fix.href)}
                    contentStyle={{ justifyContent: 'flex-start' }}
                  >
                    {fix.label}
                  </Button>
                )}
              </View>
            );
          })}
        </Card>
      )}

      {/* ------------------------------------------------------------- what is left */}
      {onboarding.missing.length > 0 && !isVerified && (
        <Card c={c}>
          <SectionLabel c={c}>Still to do before you can send this in</SectionLabel>
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
            <SectionLabel c={c}>Your documents ({docs.length})</SectionLabel>
          </View>

          {docs.length === 0 ? (
            <Text style={{ color: c.textSecondary, paddingHorizontal: 16, paddingBottom: 16 }}>
              Nothing attached yet. One of GST, PAN, trade licence or Shop &amp; Establishment is enough.
            </Text>
          ) : (
            docs.map((d) => (
              <Row
                key={d._id}
                c={c}
                icon="file-document-outline"
                title={DOC_LABELS[d.type] ?? d.type}
                subtitle={d.fileName || 'Attached file'}
                onPress={docsLocked ? undefined : () => removeDoc(d)}
                right={removing === d._id ? <ActivityIndicator size="small" /> : undefined}
              />
            ))
          )}

          <View style={{ padding: 16, paddingTop: 8 }}>
            {docsLocked ? (
              <Text style={{ color: c.textSecondary }}>
                {isVerified
                  ? 'Your documents are locked because you are verified.'
                  : 'Locked while our team is looking at them — they are the evidence being reviewed.'}
              </Text>
            ) : (
              <>
                <ChipRow<PartnerDocType>
                  c={c}
                  options={DOC_OPTIONS}
                  value={docType}
                  onChange={setDocType}
                />
                <AppButton
                  label="Attach a photo"
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
            ResiSmart is not asking businesses for identity documents at the moment, so there is nothing to
            upload. Your profile still has to be approved before residents can find you.
          </Text>
        </Card>
      )}

      {/* ------------------------------------------------------------- submit */}
      {!isVerified && vStatus !== 'PENDING' && (
        <Card c={c}>
          <Text style={{ color: c.textSecondary, marginBottom: 12 }}>
            {onboarding.canSubmit
              ? 'Everything we need is here. We will look at it and let you know either way.'
              : 'Clear the list above first — the button turns on when nothing is left.'}
          </Text>
          <Button
            mode="contained"
            onPress={submit}
            loading={submitting}
            disabled={!onboarding.canSubmit || submitting}
          >
            Send for review
          </Button>
        </Card>
      )}
    </Screen>
  );
}
