import { useCallback, useEffect, useRef } from 'react';
import { useAudioPlayer, setAudioModeAsync, AudioPlayer } from 'expo-audio';
import * as Haptics from 'expo-haptics';

/**
 * "Audible beep + haptic on hit, distinct error tone on an unknown code" —
 * PARTNERS_PLAN §12.1. The cashier is looking at the customer, not the screen,
 * so both tones have to be tellable apart BY EAR: `scan-hit.wav` is one short
 * high beep, `scan-unknown.wav` is two short LOW beeps — opposite shape on
 * purpose (see `scripts/gen-beeps.js`... generated once, not shipped — the two
 * WAVs in `assets/sounds/` are the committed output).
 *
 * `setAudioModeAsync({ playsInSilentMode: true })` is called once on mount and
 * is not a stylistic choice: a POS scan tone silenced by the iPhone's physical
 * ring switch is a scanner that looks broken at the one moment — a busy
 * counter — where the cashier has no attention left to check the screen for a
 * silent confirmation.
 */
export interface ScanFeedback {
  /** A barcode was successfully DECODED — fires before the network lookup even starts. */
  hit: () => void;
  /** The decoded code is not in the catalog. */
  unknown: () => void;
}

async function playFromStart(player: AudioPlayer): Promise<void> {
  try {
    // `seekTo(0)`: after a sound finishes, expo-audio leaves the player parked
    // at the end — replaying without rewinding first is a coin flip between a
    // second beep and silence, on the one screen where "did that register?" is
    // the whole question the sound exists to answer.
    await player.seekTo(0);
    player.play();
  } catch {
    // A beep that fails to play is a missing convenience, not a failed scan —
    // the haptic pulse still fired, and the lookup result still reaches the
    // caller. Never let audio plumbing block or throw through a scan handler.
  }
}

export function useScanFeedback(): ScanFeedback {
  const hitPlayer = useAudioPlayer(require('../../../assets/sounds/scan-hit.wav'));
  const unknownPlayer = useAudioPlayer(require('../../../assets/sounds/scan-unknown.wav'));
  const modeSet = useRef(false);

  useEffect(() => {
    if (modeSet.current) return;
    modeSet.current = true;
    void setAudioModeAsync({ playsInSilentMode: true }).catch(() => undefined);
  }, []);

  const hit = useCallback(() => {
    void playFromStart(hitPlayer);
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  }, [hitPlayer]);

  const unknown = useCallback(() => {
    void playFromStart(unknownPlayer);
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
  }, [unknownPlayer]);

  return { hit, unknown };
}
