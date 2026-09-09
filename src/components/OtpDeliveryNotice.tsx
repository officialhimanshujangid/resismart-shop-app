import React from 'react';
import { ActivityIndicator, StyleSheet, TouchableOpacity, View } from 'react-native';
import { Text } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';

import { AppButton } from './AppButton';
import { ColorScheme, radii } from '../constants/colors';
import { OtpAltVia, OtpDeliveredVia, OtpVia } from '../api/auth.api';

/**
 * "Where did the code go, and how do I get it somewhere else."
 *
 * ── The bug this exists to close ──────────────────────────────────────────
 *
 * A phone code walks a WhatsApp → SMS ladder for cost reasons, and until now the
 * UI never said which rung carried it. A user whose WhatsApp send quietly fell
 * through to SMS went on watching WhatsApp; a user whose send failed on BOTH
 * rungs was sent to a code box for a message that was never going to arrive,
 * because the endpoint answered 200 regardless. Both are fixed by SAYING THE
 * TRUE THING — which is why every sentence this renders comes off the wire and
 * none of them is composed here.
 *
 * ── What it renders, in order ─────────────────────────────────────────────
 *
 *   1. `sending` — the in-flight line, named where the transport is known.
 *   2. `failure` — the server's 502 sentence, plus the instruction to pick
 *      another route. The caller must NOT have advanced to a code box.
 *   3. `message` — the server's own success sentence, which already names the
 *      transport ("We sent a verification code by SMS.").
 *   4. the WhatsApp-unavailable note, when the platform says so.
 *   5. `alternatives` as real buttons, one per rung the server will accept.
 *
 * Exactly one of 1–3 is showing whenever anything has been attempted, so the
 * rung the code took — or the fact that nothing took it — is on screen at the
 * same time as the buttons that move it, never instead of them.
 *
 * ── Two rules that are easy to get wrong ──────────────────────────────────
 *
 * NO COOLDOWN PROP, deliberately. The resend countdown belongs to the plain
 * "send another code" control; the server WAIVES that cooldown after a failed
 * delivery and on a transport switch, so wiring the countdown in here would
 * disable the one control that is guaranteed to work at the exact moment the
 * user needs it. The only thing that greys these buttons is a request already in
 * flight.
 *
 * `alternatives` is rendered VERBATIM. The server's `alternativeRoutes` offers
 * every transport that is CAPABLE except the one that just carried this code —
 * so a delivery yields ONE rung, and a 502 (nothing carried it) yields BOTH.
 * It has already dropped whatever is not configured, which is why an empty array
 * means there is genuinely nowhere else to send this. Filtering, reordering or
 * capping it here would only let the client disagree with the server about what
 * is possible.
 */

/**
 * Only `whatsapp` and `sms` are ever offered; an inbox is not a rung.
 *
 * Catalogue KEYS, not sentences: the rung name is the server's enum and is what
 * `onRetry` posts back, so only the wording moves between languages.
 */
const ALT_LABEL_KEY: Record<OtpAltVia, string> = {
  whatsapp: 'auth.otpNotice.altWhatsapp',
  sms: 'auth.otpNotice.altSms',
};

type IconName = React.ComponentProps<typeof MaterialCommunityIcons>['name'];

const ALT_ICON: Record<OtpAltVia, IconName> = {
  whatsapp: 'whatsapp',
  sms: 'message-text-outline',
};

/**
 * The in-flight line.
 *
 * Named only where the transport is actually known: a pinned `via` names itself,
 * and an `auto` send can be named once a previous response has told us whether
 * WhatsApp is up. On the very first `auto` send it is not known, and guessing
 * would reintroduce exactly the kind of client-side fiction this screen exists
 * to remove — so it stays honest and vague for that one case.
 */
function sendingLineKey(via: OtpVia, whatsappAvailable: boolean | null): string {
  if (via === 'whatsapp') return 'auth.otpNotice.sendingWhatsapp';
  if (via === 'sms') return 'auth.otpNotice.sendingSms';
  if (whatsappAvailable === true) return 'auth.otpNotice.sendingWhatsapp';
  if (whatsappAvailable === false) return 'auth.otpNotice.sendingSms';
  return 'auth.otpNotice.sendingUnknown';
}

/**
 * One rung, as a full-width outlined row — NOT an `AppButton`.
 *
 * `AppButton` wraps react-native-paper's `Button`, whose label is hardcoded to
 * `numberOfLines={1}` and cannot be talked out of it by any `labelStyle`. "Send
 * it on WhatsApp instead" is roughly 235dp at this app's 16dp button label, and
 * a 360dp screen leaves about 248dp once the page padding, Paper's own 24dp
 * label margins and the icon are taken out — so the label already clips at
 * Android's "Large" font setting, and it clips from the RIGHT, eating the word
 * "instead". That word is the whole control: it is what says this REPLACES the
 * channel the code just went out on rather than adding to it. So the label wraps
 * here and the row grows with it, which is what the rest of the auth screens do
 * (none of them sets a fixed height either).
 *
 * Left-aligned rather than centred for the same reason — a centred second line
 * reads as a caption, and these are sentences.
 */
function AltRoute({
  c,
  via,
  busy,
  disabled,
  onPress,
}: {
  c: ColorScheme;
  via: OtpAltVia;
  busy: boolean;
  disabled: boolean;
  onPress: () => void;
}) {
  const { t } = useTranslation();
  const label = t(ALT_LABEL_KEY[via]);
  const tint = disabled ? c.textDisabled : c.primary;
  return (
    <TouchableOpacity
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled, busy }}
      activeOpacity={0.7}
      disabled={disabled}
      onPress={onPress}
      style={[styles.alt, { borderColor: disabled ? c.border : c.primary, backgroundColor: c.surface }]}
    >
      {busy ? (
        <ActivityIndicator size={18} color={tint} />
      ) : (
        <MaterialCommunityIcons name={ALT_ICON[via]} size={18} color={tint} />
      )}
      <Text style={[styles.altLabel, { color: tint }]}>{label}</Text>
    </TouchableOpacity>
  );
}

interface OtpDeliveryNoticeProps {
  c: ColorScheme;
  /** The server's success sentence. It already names the transport — print it. */
  message?: string | null;
  /** The server's 502 sentence. Mutually exclusive with `message` in practice. */
  failure?: string | null;
  /** What the last response reported. `null` before anything has been sent. */
  deliveredVia?: OtpDeliveredVia | null;
  alternatives: OtpAltVia[];
  /** `null` until a response has said. Drives the honest note and the in-flight line. */
  whatsappAvailable: boolean | null;
  /** The transport currently being requested, or `null` when nothing is in flight. */
  sending: OtpVia | null;
  onRetry: (via: OtpAltVia) => void;
  /**
   * "Use email instead", where the surrounding flow actually has a verified
   * email identity to fall back to. Omitted — not disabled — where it does not:
   * a step that verifies a PHONE has no business offering an inbox.
   */
  onUseEmail?: () => void;
}

export function OtpDeliveryNotice({
  c,
  message,
  failure,
  deliveredVia,
  alternatives,
  whatsappAvailable,
  sending,
  onRetry,
  onUseEmail,
}: OtpDeliveryNoticeProps) {
  const { t } = useTranslation();
  // The note is worth printing only where WhatsApp was the rung we would have
  // preferred — on an emailed code nobody was expecting WhatsApp in the first
  // place, and saying so there is noise.
  const showWhatsappNote = whatsappAvailable === false && deliveredVia !== 'email';
  const failed = !sending && !!failure;

  return (
    <View style={styles.wrap}>
      {sending ? (
        <Text style={[styles.line, { color: c.textSecondary }]}>
          {t(sendingLineKey(sending, whatsappAvailable))}
        </Text>
      ) : null}

      {failed ? (
        // `error` carries the BORDER, not the sentence. `danger` (#F43F5E) is
        // 3.66:1 on white and 3.36:1 on `surfaceVariant` — fine for a 3:1
        // non-text boundary, under AA as body text. `constants/colors.ts` is
        // explicit that this ramp is measured rather than eyeballed, so the
        // words take `textPrimary` and the red does the job it passes.
        // `surface` rather than `surfaceVariant` for the ground, too: the light
        // scheme's variant is `brand[50]`, a GREEN tint, and a failure notice
        // should not sit on the success hue.
        <View style={[styles.alert, { backgroundColor: c.surface, borderColor: c.error }]}>
          <Text style={[styles.alertTitle, { color: c.textPrimary }]}>{failure}</Text>
          <Text style={[styles.line, { color: c.textSecondary }]}>
            {t('auth.otpNotice.failureHint')}
          </Text>
        </View>
      ) : null}

      {!sending && !failure && message ? (
        <Text style={[styles.line, { color: c.textSecondary }]}>{message}</Text>
      ) : null}

      {showWhatsappNote ? (
        <Text style={[styles.line, { color: c.textSecondary }]}>
          {/* "we are using SMS" is a claim about a send, and on a 502 there was
              no send to claim. That pairing only became reachable when the
              server widened `alternatives` to hand both rungs back after a
              total failure: WhatsApp muted platform-wide plus a 502 leaves
              `['sms']`, which is exactly the case this sentence explains. */}
          {failed
            ? t('auth.otpNotice.whatsappDownOnlySms')
            : t('auth.otpNotice.whatsappDownUsingSms')}
        </Text>
      ) : null}

      {alternatives.map((via) => (
        <AltRoute
          key={via}
          c={c}
          via={via}
          // Only an in-flight request greys these. See the header: the resend
          // cooldown must never reach this control.
          busy={sending === via}
          disabled={!!sending}
          onPress={() => onRetry(via)}
        />
      ))}

      {onUseEmail ? (
        <AppButton
          label={t('auth.otpNotice.useEmail')}
          icon="email-outline"
          mode="text"
          disabled={!!sending}
          onPress={onUseEmail}
        />
      ) : null}
    </View>
  );
}

/** LAYOUT ONLY — every colour is applied at render from the caller's `c`. */
const styles = StyleSheet.create({
  wrap: { gap: 4, marginTop: 4 },
  line: { fontSize: 13, lineHeight: 19 },
  alert: {
    borderWidth: 1,
    borderRadius: radii.sm,
    padding: 12,
    gap: 4,
    marginBottom: 4,
  },
  alertTitle: { fontSize: 13, fontWeight: '600', lineHeight: 19 },
  // `marginVertical` matches `AppButton`'s, so two rungs stacked above "Use
  // email instead" keep the same rhythm as the rest of the button column. No
  // fixed height: the row is sized by its label, which is the point.
  alt: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderRadius: radii.field,
    paddingVertical: 12,
    paddingHorizontal: 16,
    marginVertical: 4,
  },
  // `flex: 1` is what makes the label wrap inside the row instead of stretching
  // it, and there is no `numberOfLines` — two rungs at a 1.3× font scale on a
  // 360dp screen each take two lines and both stay fully readable.
  altLabel: { flex: 1, fontSize: 15, fontWeight: '600', lineHeight: 21 },
});
