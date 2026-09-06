import React from 'react';
import { StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { Text } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';

import { Colors, DarkColors, radii } from '../constants/colors';
import { AppLogo } from './AppLogo';

/**
 * The partner app's hero — the one gradient/glass surface a screen is allowed,
 * per the "refined premium" agreement (gradient + glass on hero/brand areas
 * ONLY; content on solid AA-contrast surfaces below).
 *
 * Character for the partner surface is a BUSINESS DASHBOARD: confident,
 * data-forward, revenue-first. So the hero leads with the number the proprietor
 * opens the app to see, and the translucent `GlassStat` tiles carry today's
 * supporting figures right on the gradient — the solid `charts/*` cards sit
 * beneath it.
 *
 * Two shapes, one component:
 *   - `dashboard` (default) — eyebrow + business name + a headline metric, with
 *     `GlassStat` tiles passed as `children`.
 *   - `brand` — the `AppLogo` mark plus a "· Partner" sub-name lockup and one
 *     short line, for the auth shell. Keeps the single ResiSmart logo; the app
 *     is distinguished by the lockup, never a new mark or hue. `AppLogo` is the
 *     wordmark ALONE and tints itself white for this gradient — see its header
 *     for why the RS badge cannot sit here, and note that this pill is what
 *     already says which app it is, so the mark must not repeat it.
 *
 * Theme-aware: the gradient ramp is taken from the palette's `gradient*` tokens
 * for the scheme in force, so it reads with contrast in light and dark alike.
 */

type GradientTuple = readonly [string, string, ...string[]];

export interface HeroProps {
  isDark: boolean;
  variant?: 'dashboard' | 'brand';
  /** Small uppercase kicker above the title (dashboard). */
  eyebrow?: string;
  /** The business name (dashboard) — the line that anchors the hero. */
  title?: string;
  /** One short supporting line under the title/lockup. */
  subtitle?: string;
  /** The revenue-first headline the partner opens the app for. */
  headline?: { value: string; label?: string };
  /** Brand mode: the logo size and a one-line tagline. */
  logoSize?: 'small' | 'medium' | 'large';
  /** Round the lower corners as a floating card (default) or run full-bleed. */
  rounded?: boolean;
  /** Override the gradient ramp; defaults to the scheme's `gradient*` tokens. */
  colors?: GradientTuple;
  style?: StyleProp<ViewStyle>;
  /** `GlassStat` tiles, rendered in a wrap row beneath the headline. */
  children?: React.ReactNode;
}

const ON_HERO = 'rgba(255,255,255,0.92)';
const ON_HERO_SOFT = 'rgba(255,255,255,0.72)';

export function Hero({
  isDark,
  variant = 'dashboard',
  eyebrow,
  title,
  subtitle,
  headline,
  logoSize = 'large',
  rounded = true,
  colors,
  style,
  children,
}: HeroProps) {
  const scheme = isDark ? DarkColors : Colors;
  const ramp: GradientTuple = colors ?? [scheme.gradientStart, scheme.gradientEnd, scheme.gradientAccent];
  const brand = variant === 'brand';

  return (
    <LinearGradient
      colors={ramp}
      locations={[0, 0.65, 1]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[styles.hero, rounded ? styles.rounded : null, brand ? styles.brandHero : null, style]}
    >
      {brand ? (
        <View style={styles.brandContent}>
          <AppLogo size={logoSize} showTagline={false} variant="light" />
          <View style={styles.lockup}>
            <View style={styles.lockupDot} />
            <Text style={styles.lockupText}>Partner</Text>
          </View>
          {subtitle ? <Text style={styles.brandLine}>{subtitle}</Text> : null}
        </View>
      ) : (
        <>
          {eyebrow ? <Text style={styles.eyebrow}>{eyebrow}</Text> : null}
          {title ? (
            <Text style={styles.title} numberOfLines={2}>
              {title}
            </Text>
          ) : null}
          {headline ? (
            <View style={styles.headline}>
              {/* The revenue figure is the one thing on this screen that must
                  never be cut off, and it is the thing most likely to be — a
                  long rupee amount at a large system font scale. It shrinks to
                  fit instead of truncating. */}
              <Text
                style={styles.headlineValue}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.6}
              >
                {headline.value}
              </Text>
              {headline.label ? <Text style={styles.headlineLabel}>{headline.label}</Text> : null}
            </View>
          ) : null}
          {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
          {children ? <View style={styles.stats}>{children}</View> : null}
        </>
      )}
    </LinearGradient>
  );
}

/**
 * A translucent "glass" tile for a single figure, sat directly on the hero
 * gradient. White-on-gradient, no blur dependency — a low-alpha fill and a
 * hairline top-light border is what reads as glass here and stays cheap on a
 * mid-range phone.
 */
export function GlassStat({
  label,
  value,
  icon,
  caption,
  style,
}: {
  label: string;
  value: string;
  icon?: string;
  caption?: string;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[styles.glass, style]}>
      <View style={styles.glassHead}>
        {icon ? (
          <View style={styles.glassIcon}>
            <MaterialCommunityIcons name={icon as never} size={14} color={ON_HERO} />
          </View>
        ) : null}
        {/* Two tiles share a row, so an uppercase micro-label has roughly ten
            characters of space. Capped rather than allowed to scale into an
            ellipsis that hides which figure this is. */}
        <Text style={styles.glassLabel} numberOfLines={1} maxFontSizeMultiplier={1.2}>
          {label}
        </Text>
      </View>
      <Text style={styles.glassValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
        {value}
      </Text>
      {caption ? (
        <Text style={styles.glassCaption} numberOfLines={1}>
          {caption}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  hero: {
    paddingHorizontal: 20,
    paddingTop: 22,
    paddingBottom: 22,
    gap: 6,
  },
  rounded: { borderRadius: radii.sheet },
  brandHero: { paddingVertical: 40, alignItems: 'center', justifyContent: 'center' },

  // brand mode
  brandContent: { alignItems: 'center', gap: 12 },
  lockup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: radii.pill,
    backgroundColor: 'rgba(255,255,255,0.14)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.28)',
  },
  lockupDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: ON_HERO },
  lockupText: { color: ON_HERO, fontSize: 13, fontWeight: '600', letterSpacing: 0.4 },
  brandLine: {
    color: ON_HERO_SOFT,
    fontSize: 13.5,
    lineHeight: 19,
    textAlign: 'center',
    paddingHorizontal: 8,
  },

  // dashboard mode
  eyebrow: {
    color: ON_HERO_SOFT,
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  title: { color: '#FFFFFF', fontSize: 24, fontWeight: '600', letterSpacing: 0.2 },
  headline: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, marginTop: 6 },
  headlineValue: { color: '#FFFFFF', fontSize: 34, fontWeight: '600', letterSpacing: 0.2 },
  headlineLabel: { color: ON_HERO_SOFT, fontSize: 13, fontWeight: '600', marginBottom: 6 },
  subtitle: { color: ON_HERO_SOFT, fontSize: 13.5, lineHeight: 19, marginTop: 2 },
  stats: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 14 },

  // glass tile
  glass: {
    flexBasis: '47%',
    flexGrow: 1,
    borderRadius: radii.md,
    paddingHorizontal: 13,
    paddingVertical: 12,
    gap: 6,
    backgroundColor: 'rgba(255,255,255,0.14)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.26)',
  },
  glassHead: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  glassIcon: {
    width: 22,
    height: 22,
    borderRadius: radii.xs,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.16)',
  },
  glassLabel: {
    color: ON_HERO_SOFT,
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.3,
    textTransform: 'uppercase',
    flex: 1,
  },
  glassValue: { color: '#FFFFFF', fontSize: 22, fontWeight: '600' },
  glassCaption: { color: ON_HERO_SOFT, fontSize: 11.5, fontWeight: '600' },
});
