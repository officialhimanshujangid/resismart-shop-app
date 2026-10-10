import React, { useState } from 'react';
import { StyleSheet, Text, useWindowDimensions, View, type StyleProp, type ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { radius, typeScale } from '../../theme/tokens';
import { useAppTheme } from '../../theme/useAppTheme';
import { Rise } from '../../theme/motion';
import { useHindiTitleFace } from '../../theme/hindiFace';
import { LiveDot } from './StatusBadge';

export interface HeroChipSpec {
  label: string;
  /** Glass chip with a live green dot (e.g. "Open · taking orders"). */
  live?: boolean;
  testID?: string;
}

/** Template height/width of the shop hero (312 / 390). */
export const HERO_RATIO = 312 / 390;

/**
 * The shop hero (DS v1 §4, ShopHome template): sky gradient top band with
 * rounded 38 px lower corners, an illustration slot drawn behind the content,
 * an avatar + date + greeting row, a right-hand action (usually a glass
 * `IconButton`), and a wrap row of live chips.
 *
 * `illustration` is a render function so it can be sized to the hero:
 *   illustration={({ width, height }) => <Storefront width={width} height={height} />}
 *
 * Content that overlaps the bottom edge (the glass sales card) is placed by the
 * caller right after this component with a negative top margin.
 */
export function HeroHeader({
  title,
  eyebrow,
  avatarText,
  right,
  chips,
  illustration,
  height,
  children,
  testID,
  style,
}: {
  title: string;
  eyebrow?: string;
  avatarText?: string;
  right?: React.ReactNode;
  chips?: HeroChipSpec[];
  illustration?: (size: { width: number; height: number }) => React.ReactNode;
  /** Fixed height; defaults to the template ratio of the width (min 260). */
  height?: number;
  children?: React.ReactNode;
  testID?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const { sky, isDark } = useAppTheme();
  const hiFace = useHindiTitleFace(typeScale.greeting.fontSize);
  const insets = useSafeAreaInsets();
  const window = useWindowDimensions();
  const [width, setWidth] = useState(window.width);
  const h = height ?? Math.max(260, Math.round(width * HERO_RATIO)) + insets.top;

  return (
    <View
      testID={testID}
      onLayout={(e) => setWidth(Math.round(e.nativeEvent.layout.width))}
      style={[styles.hero, { height: h }, style]}
    >
      <LinearGradient colors={sky} locations={[0, 0.56, 1]} style={StyleSheet.absoluteFill} />
      {illustration ? (
        <Rise style={[StyleSheet.absoluteFill, { top: insets.top }]} index={0}>
          <View style={StyleSheet.absoluteFill} pointerEvents="none">
            {illustration({ width, height: h - insets.top })}
          </View>
        </Rise>
      ) : null}

      <Rise index={0} style={[styles.header, { paddingTop: 22 + insets.top }]}>
        {avatarText ? (
          <View style={styles.avatar} accessibilityElementsHidden importantForAccessibility="no">
            <Text style={styles.avatarText}>{avatarText}</Text>
          </View>
        ) : null}
        <View style={styles.headText}>
          {eyebrow ? <Text style={styles.eyebrow}>{eyebrow}</Text> : null}
          <Text accessibilityRole="header" style={[styles.title, hiFace]}>{title}</Text>
        </View>
        {right}
      </Rise>

      {chips && chips.length ? (
        <Rise index={1} style={styles.chips}>
          {chips.map((ch, i) => (
            <View
              key={`${ch.label}-${i}`}
              testID={ch.testID}
              style={[
                styles.chip,
                ch.live
                  ? styles.chipGlass
                  : { backgroundColor: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(10,60,35,0.22)' },
              ]}
            >
              {ch.live ? <LiveDot color="#B8F5CF" size={7} /> : null}
              <Text style={styles.chipText}>{ch.label}</Text>
            </View>
          ))}
        </Rise>
      ) : null}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  hero: {
    borderBottomLeftRadius: radius.hero,
    borderBottomRightRadius: radius.hero,
    overflow: 'hidden',
  },
  header: { paddingHorizontal: 20, flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatar: {
    width: 46,
    height: 46,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.22)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  avatarText: { ...typeScale.number, color: '#FFFFFF' },
  headText: { flex: 1, minWidth: 0 },
  eyebrow: { fontSize: 12, fontWeight: '500', color: '#E2F5EA' },
  title: { ...typeScale.greeting, color: '#FFFFFF', lineHeight: 25 },
  chips: { paddingHorizontal: 20, paddingTop: 12, flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: {
    minHeight: 30,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.pill,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  chipGlass: { borderWidth: 1, borderColor: 'rgba(255,255,255,0.4)', backgroundColor: 'rgba(255,255,255,0.2)' },
  chipText: { color: '#FFFFFF', fontWeight: '600', fontSize: 12, lineHeight: 16 },
});
