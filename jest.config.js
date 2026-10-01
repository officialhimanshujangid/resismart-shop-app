// Test runner for the shop app. Mirrors mobile-guard/jest.config.js:
// jest-expo matches Expo SDK 54; tests live in src/__tests__ and the shared
// harness in src/__tests__/setup. i18next / react-i18next ship ESM builds, so
// they join the transform list like in the guard app.
module.exports = {
  preset: 'jest-expo',
  // 5s is a statement about a busy machine, not about whether the screen is
  // right. A hung test still fails.
  testTimeout: 20_000,
  testMatch: ['<rootDir>/src/__tests__/**/*.test.ts?(x)'],
  setupFilesAfterEnv: ['<rootDir>/src/__tests__/setup/jest.setup.ts'],
  moduleNameMapper: { '^@expo/vector-icons$': '<rootDir>/src/__tests__/setup/icons.mock.js' },
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?|expo(nent)?|@expo(nent)?/.*|react-navigation|@react-navigation/.*|react-native-svg|react-native-paper|@tanstack/.*|react-native-reanimated|react-native-worklets|i18next|react-i18next))',
  ],
};
