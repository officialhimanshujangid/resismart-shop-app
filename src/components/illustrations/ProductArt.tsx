import React from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Circle, Defs, Ellipse, Path, RadialGradient, Rect, Stop, Text as SvgText } from 'react-native-svg';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';
import { useTranslation } from 'react-i18next';

import { fontFamily, motion } from '../../theme/tokens';
import { useAmbientLoop } from '../../theme/motion';
import { useAppTheme } from '../../theme/useAppTheme';

export type ProductArtKind = 'milk' | 'flour' | 'chips' | 'soap' | 'box';

/**
 * In-house product placeholder art (ShopBilling template): milk packet, atta
 * bag, chips packet, soap bar, plus a neutral box for anything else. Used until
 * a real product photo exists. `bob` adds the template's gentle 3 px float; it
 * stops under reduce-motion.
 *
 * Pack text is translated (MILK → दूध) so a Hindi screen does not show English
 * on its art.
 */
export function ProductArt({
  kind,
  size = 90,
  bob = false,
  style,
}: {
  kind: ProductArtKind;
  /** Height in px; width follows the art's own ratio. */
  size?: number;
  bob?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const { t } = useTranslation();
  const v = useAmbientLoop(motion.ambient.bob / 2, { enabled: bob });
  const float = useAnimatedStyle(() => ({ transform: [{ translateY: -3 * v.value }] }));
  const label = t(`kit.art.${kind === 'box' ? 'product' : kind}A11y`);

  return (
    <Animated.View
      accessible
      accessibilityRole="image"
      accessibilityLabel={label}
      style={[style, bob ? float : null]}
    >
      {renderArt(kind, size, t)}
    </Animated.View>
  );
}

function renderArt(kind: ProductArtKind, size: number, t: (k: string) => string) {
  const font = fontFamily.sora700;
  switch (kind) {
    case 'milk':
      return (
        <Svg width={(size * 70) / 90} height={size} viewBox="0 0 70 90">
          <Path d="M14 6h42l6 16v60a4 4 0 0 1-4 4H12a4 4 0 0 1-4-4V22z" fill="#FFFFFF" stroke="#C9DDF3" strokeWidth={1.5} />
          <Path d="M8 22h54v26H8z" fill="#2F7BD6" />
          <SvgText x={35} y={40} textAnchor="middle" fontFamily={font} fontSize={11} fill="#FFFFFF">{t('kit.art.milk')}</SvgText>
          <Path d="M14 6h42l-4 8H18z" fill="#E1EDFA" />
          <Ellipse cx={35} cy={88} rx={22} ry={3} fill="#2F7BD6" fillOpacity={0.18} />
        </Svg>
      );
    case 'flour':
      return (
        <Svg width={(size * 80) / 90} height={size} viewBox="0 0 80 90">
          <Path d="M14 10c8-6 44-6 52 0l4 72a4 4 0 0 1-4 4H14a4 4 0 0 1-4-4z" fill="#F2D49B" />
          <Path d="M14 10c8-6 44-6 52 0l-2 8c-10-5-38-5-48 0z" fill="#E2BC72" />
          <Rect x={18} y={34} width={44} height={30} rx={8} fill="#B5432C" />
          <SvgText x={40} y={54} textAnchor="middle" fontFamily={font} fontSize={10} fill="#FFF4D6">{t('kit.art.flour')}</SvgText>
          <Ellipse cx={40} cy={88} rx={26} ry={3} fill="#B47828" fillOpacity={0.2} />
        </Svg>
      );
    case 'chips':
      return (
        <Svg width={(size * 70) / 90} height={size} viewBox="0 0 70 90">
          <Path d="M10 8 Q35 2 60 8 L56 80 Q35 86 14 80z" fill="#F25C3B" />
          <Path d="M10 8 Q35 2 60 8 L59 16 Q35 10 11 16z" fill="#C93E22" />
          <Circle cx={35} cy={44} r={16} fill="#FFD25E" />
          <SvgText x={35} y={48} textAnchor="middle" fontFamily={font} fontSize={9} fill="#C93E22">{t('kit.art.chips')}</SvgText>
          <Ellipse cx={35} cy={88} rx={20} ry={3} fill="#C83C1E" fillOpacity={0.18} />
        </Svg>
      );
    case 'soap':
      return (
        <Svg width={(size * 80) / 80} height={size} viewBox="0 0 80 80">
          <Rect x={8} y={26} width={64} height={38} rx={14} fill="#3FCB86" />
          <Rect x={8} y={22} width={64} height={38} rx={14} fill="#6EE7A8" />
          <SvgText x={40} y={46} textAnchor="middle" fontFamily={font} fontSize={10} fill="#0A6E3D">{t('kit.art.soap')}</SvgText>
          <Circle cx={64} cy={16} r={6} fill="none" stroke="#9BE7C0" strokeWidth={2} />
          <Circle cx={54} cy={10} r={3} fill="none" stroke="#9BE7C0" strokeWidth={2} />
          <Ellipse cx={40} cy={74} rx={26} ry={3} fill="#0E9F5B" fillOpacity={0.18} />
        </Svg>
      );
    case 'box':
    default:
      return (
        <Svg width={(size * 80) / 90} height={size} viewBox="0 0 80 90">
          <Path d="M40 10 70 24v40L40 80 10 64V24z" fill="#CFE6D8" />
          <Path d="M40 10 70 24 40 38 10 24z" fill="#E6F3EB" />
          <Path d="M40 38v42L10 64V24z" fill="#B7D9C4" />
          <Ellipse cx={40} cy={86} rx={24} ry={3} fill="#2E9C68" fillOpacity={0.15} />
        </Svg>
      );
  }
}

/** Template backdrop colours for each art kind (radial, centre 50 % 80 %). */
const BACKDROPS: Record<ProductArtKind, { light: [string, string]; dark: [string, string] }> = {
  milk: { light: ['#D7ECFF', '#EEF7FF'], dark: ['#1E3458', '#16213A'] },
  flour: { light: ['#F6E9CF', '#FBF5EA'], dark: ['#3A3122', '#221F22'] },
  chips: { light: ['#FFE0D6', '#FFF3EE'], dark: ['#3D2526', '#241B26'] },
  soap: { light: ['#D6F5E3', '#EEFAF3'], dark: ['#1A3D35', '#15272F'] },
  box: { light: ['#E1F4E8', '#F1F8F4'], dark: ['#1A3D35', '#15272F'] },
};

/** The soft radial "shelf light" a product sits in. Fills its parent. */
export function ArtBackdrop({ kind, radius = 20 }: { kind: ProductArtKind; radius?: number }) {
  const { isDark } = useAppTheme();
  const [inner, outer] = BACKDROPS[kind][isDark ? 'dark' : 'light'];
  const id = `bd-${kind}-${isDark ? 'd' : 'l'}`;
  return (
    <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, borderRadius: radius, overflow: 'hidden' }} pointerEvents="none">
      <Svg width="100%" height="100%" preserveAspectRatio="none" viewBox="0 0 100 100">
        <Defs>
          <RadialGradient id={id} cx="50%" cy="80%" r="70%">
            <Stop offset="0" stopColor={inner} />
            <Stop offset="1" stopColor={outer} />
          </RadialGradient>
        </Defs>
        <Rect x={0} y={0} width={100} height={100} fill={`url(#${id})`} />
      </Svg>
    </View>
  );
}
