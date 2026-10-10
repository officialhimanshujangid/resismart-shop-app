import { Appearance, Platform } from 'react-native';

/**
 * 1R dark-mode safety (2026-10-06): the shop app opens in LIGHT for now.
 *
 * The redesign has restyled only part of the app. A static scan of the screens
 * not restyled yet found white labels on the dark-mode green fill (#3FB27B,
 * 2.7:1 — catalog "create", services FAB, order card / order detail buttons)
 * and fixed light colour pairs on dark surfaces (plan, promotion, more, staff).
 * The Owner cannot test the apps right now, so the app stays light until every
 * screen is restyled for dark.
 *
 * TODO: remove this import from `app/_layout.tsx` (follow the phone again,
 * `app.json` `userInterfaceStyle: automatic`) once the shop restyle is done.
 *
 * `Appearance.setColorScheme('light')` makes `useColorScheme()` answer 'light'
 * everywhere on Android and iOS. React Native Web has no such override: in a
 * browser the page still follows `prefers-color-scheme` (dev preview only).
 */
if (Platform.OS !== 'web') {
  try {
    Appearance.setColorScheme?.('light');
  } catch {
    /* an older runtime without the override keeps following the phone */
  }
}

export {};
