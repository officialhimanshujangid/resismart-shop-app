import { useEffect, useState } from 'react';
import { useFonts, Sora_500Medium, Sora_600SemiBold, Sora_700Bold } from '@expo-google-fonts/sora';

import { fontFamily } from './tokens';

/**
 * Sora (DS v1 §2) for money, big numbers, screen titles and the hero greeting.
 * Three weights only — each one is a file in the bundle.
 * The family names match `fontFamily` in `./tokens.ts`.
 */
export const SORA_FONTS = { Sora_500Medium, Sora_600SemiBold, Sora_700Bold };

/**
 * Noto Sans Devanagari (OFL), copied from the backend's font folder into
 * `assets/fonts` (D0 final, same as the guard app; nothing installed). Sora has
 * no Devanagari glyphs, so Hindi titles use this face.
 */
export const DEVANAGARI_FONTS = {
  [fontFamily.hindi]: require('../../assets/fonts/NotoSansDevanagari-Regular.ttf'),
  [fontFamily.hindiBold]: require('../../assets/fonts/NotoSansDevanagari-Bold.ttf'),
};

const APP_FONTS = { ...SORA_FONTS, ...DEVANAGARI_FONTS };

/**
 * True once the fonts have loaded, failed, or taken longer than `timeoutMs`.
 *
 * The app must never hang on a font: a failed or slow load falls back to the
 * system face, which every Sora style tolerates (they set no `fontWeight`).
 */
export function useAppFonts(timeoutMs = 2500): boolean {
  const [loaded, error] = useFonts(APP_FONTS);
  const [timedOut, setTimedOut] = useState(false);
  useEffect(() => {
    if (loaded || error) return;
    const id = setTimeout(() => setTimedOut(true), timeoutMs);
    return () => clearTimeout(id);
  }, [loaded, error, timeoutMs]);
  return loaded || !!error || timedOut;
}

/** Hindi title face: see `./hindiFace.ts` (kept free of the Sora import). */
export { useHindiTitleFace } from './hindiFace';
