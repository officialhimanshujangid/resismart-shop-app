# Expo HAS CHANGED

Read the exact versioned docs at https://docs.expo.dev/versions/v54.0.0/ before writing any code.

This package is on **SDK 54** (`expo: ~54.0.0`). This line used to point at v57, which is
the trap it exists to prevent: v57 docs describe APIs and native modules that are not in
the SDK 54 runtime, and following them produces code that type-checks, bundles, and then
crashes on launch. That has already happened once here — an unpinned `expo-font` pulled an
SDK-56 native module into an SDK-54 APK and crash-looped it before the first screen. Pin
every native dependency exactly (`npx expo install`, never a bare `npm install`), and check
`node_modules/expo/bundledNativeModules.json` for the version Expo Go actually contains.
