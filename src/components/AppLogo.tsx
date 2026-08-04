import React from 'react';
import { View, Image, StyleSheet } from 'react-native';
import { Text } from 'react-native-paper';

interface AppLogoProps {
  size?: 'small' | 'medium' | 'large';
  showTagline?: boolean;
  variant?: 'light' | 'dark';
}

const sizeMap = {
  small:  { logo: { width: 120, height: 30 }, icon: 44, tagline: 11 },
  medium: { logo: { width: 160, height: 40 }, icon: 56, tagline: 13 },
  large:  { logo: { width: 200, height: 50 }, icon: 72, tagline: 15 },
};

export function AppLogo({ size = 'medium', showTagline = true, variant = 'light' }: AppLogoProps) {
  const s = sizeMap[size];
  const subColor = variant === 'light' ? 'rgba(255,255,255,0.85)' : '#475569';

  return (
    <View style={styles.container}>
      {/* App icon (RS badge) */}
      <Image
        source={require('../../assets/appicon.png')}
        style={[styles.icon, { width: s.icon, height: s.icon, borderRadius: s.icon * 0.22 }]}
        resizeMode="contain"
      />

      {/* Resismart wordmark logo */}
      <Image
        source={require('../../assets/resismartlogo.png')}
        style={[styles.logo, { width: s.logo.width, height: s.logo.height }]}
        resizeMode="contain"
      />

      {showTagline && (
        <Text style={[styles.tagline, { fontSize: s.tagline, color: subColor }]}>
          Partner Management Panel
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    gap: 10,
  },
  icon: {
    marginBottom: 2,
  },
  logo: {},
  tagline: {
    fontWeight: '400',
    letterSpacing: 0.3,
    opacity: 0.9,
    textAlign: 'center',
  },
});
