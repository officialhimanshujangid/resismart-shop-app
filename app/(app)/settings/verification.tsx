import React, { useCallback, useEffect, useState } from 'react';
import { Alert, useColorScheme, View } from 'react-native';
import { ActivityIndicator, Button, Text } from 'react-native-paper';
import * as ImagePicker from 'expo-image-picker';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import { themeColors } from '../../../src/constants/colors';
import { qk } from '../../../src/lib/queryKeys';
import { apiErrorMessage } from '../../../src/api/axios';
import { usePartnerEntitlements } from '../../../src/hooks';
import { partnerApi, uploadKycFile, PartnerKycDoc } from '../../../src/api/partner.api';
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

  if (statusQuery.isLoading) return <Screen c={c} title="Verification"><Loading c={c} /></Screen>;
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

  const blockers = (entitlements.visibility?.blockers ?? []).filter((b) => b.code !== 'NO_CATEGORY');

  return (
    <Screen c={c} title="Verification" subtitle={STATUS_LINE[vStatus] ?? vStatus}>
      {/* ------------------------------------------------------- why it matters */}
      {entitlements.visibility && !entitlements.visibility.discoverable && (
        <Card c={c}>
          <SectionLabel c={c}>Residents cannot find you yet</SectionLabel>
          {blockers.map((b) => (
            <Text key={b.code} style={{ color: c.textSecondary, marginTop: 6 }}>• {b.message}</Text>
          ))}
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
