import { isLoaded } from 'expo-font';
import { useTranslation } from 'react-i18next';
import type { TextStyle } from 'react-native';

import { fontFamily } from './tokens';

/*
 * Kept apart from `./fonts.ts` on purpose: that file imports the Sora package,
 * which kit components (and their tests) must not pull in just to pick a face.
 */

function devanagariReady(family: string): boolean {
  try {
    return isLoaded(family);
  } catch {
    return false;
  }
}

/**
 * The Hindi face override for a Sora title/greeting style, or `null` in English
 * or when the Devanagari font did not load (the Sora style then stays, and the
 * phone's own Devanagari face draws the glyphs — never a blank or a hang).
 * Hindi gets a taller line for its vowel signs.
 */
export function useHindiTitleFace(fontSize: number): TextStyle | null {
  const { i18n } = useTranslation();
  const lang = i18n?.language ?? 'en';
  if (!lang.startsWith('hi') || !devanagariReady(fontFamily.hindiBold)) return null;
  return { fontFamily: fontFamily.hindiBold, lineHeight: Math.round(fontSize * 1.45), letterSpacing: 0 };
}
