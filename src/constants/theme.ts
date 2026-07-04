import { MD3LightTheme, MD3DarkTheme, configureFonts } from 'react-native-paper';
import { Colors } from './colors';

const fontConfig = {
  displayLarge: { fontFamily: 'System', fontSize: 57, fontWeight: '400' as const },
  displayMedium: { fontFamily: 'System', fontSize: 45, fontWeight: '400' as const },
  displaySmall: { fontFamily: 'System', fontSize: 36, fontWeight: '400' as const },
  headlineLarge: { fontFamily: 'System', fontSize: 32, fontWeight: '700' as const },
  headlineMedium: { fontFamily: 'System', fontSize: 28, fontWeight: '700' as const },
  headlineSmall: { fontFamily: 'System', fontSize: 24, fontWeight: '600' as const },
  titleLarge: { fontFamily: 'System', fontSize: 22, fontWeight: '600' as const },
  titleMedium: { fontFamily: 'System', fontSize: 16, fontWeight: '600' as const },
  titleSmall: { fontFamily: 'System', fontSize: 14, fontWeight: '500' as const },
  bodyLarge: { fontFamily: 'System', fontSize: 16, fontWeight: '400' as const },
  bodyMedium: { fontFamily: 'System', fontSize: 14, fontWeight: '400' as const },
  bodySmall: { fontFamily: 'System', fontSize: 12, fontWeight: '400' as const },
  labelLarge: { fontFamily: 'System', fontSize: 14, fontWeight: '500' as const },
  labelMedium: { fontFamily: 'System', fontSize: 12, fontWeight: '500' as const },
  labelSmall: { fontFamily: 'System', fontSize: 11, fontWeight: '500' as const },
};

export const AppLightTheme = {
  ...MD3LightTheme,
  fonts: configureFonts({ config: fontConfig }),
  colors: {
    ...MD3LightTheme.colors,
    primary: Colors.primary,
    primaryContainer: Colors.primaryLight,
    secondary: Colors.secondary,
    secondaryContainer: Colors.secondaryLight,
    background: Colors.background,
    surface: Colors.surface,
    surfaceVariant: Colors.surfaceVariant,
    error: Colors.error,
    onPrimary: Colors.textInverse,
    onSecondary: Colors.textInverse,
    onBackground: Colors.textPrimary,
    onSurface: Colors.textPrimary,
    onSurfaceVariant: Colors.textSecondary,
    outline: Colors.border,
  },
};

export const AppDarkTheme = {
  ...MD3DarkTheme,
  fonts: configureFonts({ config: fontConfig }),
  colors: {
    ...MD3DarkTheme.colors,
    primary: Colors.primaryLight,
    primaryContainer: Colors.primary,
    secondary: Colors.secondaryLight,
    secondaryContainer: Colors.secondary,
    background: '#0D1117',
    surface: '#161B22',
    surfaceVariant: '#1C2A3D',
    error: '#F87171',
    onPrimary: Colors.textInverse,
    onSecondary: Colors.textInverse,
    onBackground: '#E2E8F0',
    onSurface: '#E2E8F0',
    onSurfaceVariant: '#94A3B8',
    outline: '#334155',
  },
};
