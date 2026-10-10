import React from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, {
  Circle,
  Defs,
  Ellipse,
  G,
  Line,
  LinearGradient,
  Path,
  Pattern,
  RadialGradient,
  Rect,
  Stop,
  Text as SvgText,
} from 'react-native-svg';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';
import { useTranslation } from 'react-i18next';

import { fontFamily, motion } from '../../theme/tokens';
import { useAmbientLoop, useMotionOK } from '../../theme/motion';
import { useAppTheme } from '../../theme/useAppTheme';

/** Drawing space of the ShopHome template hero. */
const VW = 390;
const VH = 312;

interface Scene {
  sun: string;
  cloud: string;
  hill: string;
  sideBuilding: string;
  sideWindow: string;
  wallTop: string;
  wallBottom: string;
  wallSide: string;
  roof: string;
  awningB: string;
  window: string;
  shelf: string;
  door: string;
  ground: string;
  bush: string;
  bush2: string;
  rider: string;
  signText: string;
}

const DAY: Scene = {
  sun: '#FFF6D6',
  cloud: '#FFFFFF',
  hill: '#A6DDBC',
  sideBuilding: '#8ACFA6',
  sideWindow: 'rgba(255,255,255,0.55)',
  wallTop: '#2F8A5E',
  wallBottom: '#3A9A6B',
  wallSide: '#22714C',
  roof: '#5DB487',
  awningB: '#F0907C',
  window: '#DDF3E6',
  shelf: '#B8E2C8',
  door: '#1F6B47',
  ground: '#8FD0A8',
  bush: '#6FC291',
  bush2: '#5BB37F',
  rider: '#16302A',
  signText: '#2E9C68',
};

/** Night: same scene, lights on (DS: "society skyline day + night"). */
const NIGHT: Scene = {
  sun: '#DCE6FF',
  cloud: '#9FB2E8',
  hill: '#1D3B4A',
  sideBuilding: '#22405A',
  sideWindow: '#F2C86E',
  wallTop: '#1F5C41',
  wallBottom: '#24694A',
  wallSide: '#173F30',
  roof: '#2E7A57',
  awningB: '#C8705E',
  window: '#FCE7B0',
  shelf: '#E9C77A',
  door: '#123526',
  ground: '#163246',
  bush: '#1E4A3E',
  bush2: '#1A4136',
  rider: '#DCE6FF',
  signText: '#1F6B47',
};

/**
 * Shop storefront illustration (DS v1 §4 / ShopHome template): a 3D shop with
 * side wall and roof, striped awning, a lit shelf window, the business name on
 * the sign, a swaying OPEN sign, the sun (moon at night), a drifting cloud and a
 * delivery bike riding past.
 *
 * Ambient motion (cloud 9 s, sign 4 s, sun 5 s, bike 9 s) runs on the UI
 * thread and is OFF under reduce-motion or `animate={false}`.
 *
 * Static parts are one SVG; each moving part is its own full-size SVG layer
 * inside an Animated.View, so motion is a View transform — reliable on
 * Android, iOS and web alike.
 */
export function Storefront({
  width,
  height,
  signText,
  animate = true,
}: {
  width: number;
  /** Defaults to the template ratio (312 / 390 of the width). */
  height?: number;
  /** The business name on the fascia (keep it short; it is drawn at 12 px). */
  signText?: string;
  animate?: boolean;
}) {
  const { t } = useTranslation();
  const { isDark } = useAppTheme();
  const s = isDark ? NIGHT : DAY;
  const h = height ?? (width * VH) / VW;
  // xMidYMax slice: the art is scaled to cover and anchored to the bottom, so
  // the shop always sits on the hero's lower edge.
  const scale = Math.max(width / VW, h / VH);
  const offX = (width - VW * scale) / 2;
  const offY = h - VH * scale;

  const moving = useMotionOK() && animate;
  const cloud = useAmbientLoop(motion.ambient.cloud, { enabled: animate });
  const sign = useAmbientLoop(motion.ambient.sign / 2, { enabled: animate });
  const sun = useAmbientLoop(motion.ambient.sun / 2, { enabled: animate });
  const bike = useAmbientLoop(motion.ambient.ride, { enabled: animate, reverse: false });

  const cloudStyle = useAnimatedStyle(() => ({ transform: [{ translateX: (-8 + 20 * cloud.value) * scale }] }));
  const sunStyle = useAnimatedStyle(() => ({ opacity: moving ? 0.55 + 0.3 * sun.value : 0.75 }));
  const signStyle = useAnimatedStyle(() => ({ transform: [{ rotate: `${-3 + 6 * sign.value}deg` }] }));
  const bikeStyle = useAnimatedStyle(() => ({
    // Static position (reduce motion): parked near the left, as in the template's first frame.
    transform: [{ translateX: (moving ? -60 + 480 * bike.value : 70) * scale }],
  }));

  const layer = (children: React.ReactNode) => (
    <Svg width={width} height={h} viewBox={`${-offX / scale} ${-offY / scale} ${width / scale} ${h / scale}`}>
      {children}
    </Svg>
  );

  // Sign pivot (300, 212) in view units → px for transformOrigin.
  const pivotX = offX + 300 * scale;
  const pivotY = offY + 212 * scale;

  return (
    <View
      style={{ width, height: h }}
      accessible
      accessibilityRole="image"
      accessibilityLabel={t('kit.art.storefront')}
    >
      <Animated.View style={[StyleSheet.absoluteFill, sunStyle]} pointerEvents="none">
        {layer(
          <>
            <Defs>
              <RadialGradient id="sf-sun" cx="0.5" cy="0.5" r="0.5">
                <Stop offset="0" stopColor={s.sun} />
                <Stop offset="1" stopColor={s.sun} stopOpacity={0} />
              </RadialGradient>
            </Defs>
            <Circle cx={70} cy={150} r={64} fill="url(#sf-sun)" />
            {isDark ? <Circle cx={70} cy={150} r={16} fill={s.sun} /> : null}
          </>,
        )}
      </Animated.View>

      <Animated.View style={[StyleSheet.absoluteFill, cloudStyle]} pointerEvents="none">
        {layer(
          <G opacity={0.6}>
            <Ellipse cx={300} cy={138} rx={30} ry={9} fill={s.cloud} />
            <Ellipse cx={318} cy={132} rx={17} ry={9} fill={s.cloud} />
          </G>,
        )}
      </Animated.View>

      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        {layer(
          <>
            <Defs>
              <Pattern id="sf-aw" width={26} height={30} patternUnits="userSpaceOnUse">
                <Rect width={13} height={30} fill="#FFFFFF" />
                <Rect x={13} width={13} height={30} fill={s.awningB} />
              </Pattern>
              <LinearGradient id="sf-wall" x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor={s.wallTop} />
                <Stop offset="1" stopColor={s.wallBottom} />
              </LinearGradient>
            </Defs>
            <Path d="M0 250 Q80 218 170 238 T390 232 V312 H0z" fill={s.hill} />
            <Rect x={10} y={200} width={60} height={96} rx={6} fill={s.sideBuilding} />
            <Rect x={22} y={214} width={14} height={14} rx={3} fill={s.sideWindow} />
            <Rect x={44} y={214} width={14} height={14} rx={3} fill={s.sideWindow} />
            <Path d="M346 186 l16 -12 v122 l-16 0z" fill={s.wallSide} />
            <Rect x={146} y={186} width={200} height={110} rx={8} fill="url(#sf-wall)" />
            <Path d="M146 186 l16 -12 h200 l-16 12z" fill={s.roof} />
            <Rect x={168} y={160} width={156} height={24} rx={6} fill="#FFFFFF" />
            {signText ? (
              <SvgText
                x={246}
                y={177}
                textAnchor="middle"
                fontFamily={fontFamily.sora700}
                fontSize={12}
                letterSpacing={1}
                fill={s.signText}
              >
                {signText.length > 20 ? `${signText.slice(0, 19)}…` : signText}
              </SvgText>
            ) : null}
            <Path d="M140 196h212l-10 30H150z" fill="url(#sf-aw)" />
            <Path
              d="M150 226c7 9 19 9 26 0 7 9 19 9 26 0 7 9 19 9 26 0 7 9 19 9 26 0 7 9 19 9 26 0 7 9 19 9 26 0 7 9 19 9 26 0"
              fill="none"
              stroke="#FFFFFF"
              strokeWidth={2.5}
            />
            <Rect x={162} y={240} width={98} height={52} rx={6} fill={s.window} />
            <Rect x={170} y={250} width={14} height={18} rx={3} fill="#F2C86E" />
            <Rect x={188} y={246} width={12} height={22} rx={3} fill="#F0907C" />
            <Rect x={204} y={252} width={14} height={16} rx={3} fill="#8DC2F0" />
            <Rect x={222} y={248} width={12} height={20} rx={3} fill="#B9A6EE" />
            <Rect x={238} y={252} width={14} height={16} rx={3} fill="#F2C86E" />
            <Rect x={166} y={270} width={90} height={3} fill={s.shelf} />
            <Rect x={276} y={238} width={52} height={58} rx={5} fill={s.door} />
            <Circle cx={318} cy={268} r={2.5} fill="#F2C86E" />
            <Rect x={0} y={294} width={390} height={18} fill={s.ground} />
            <Circle cx={132} cy={286} r={12} fill={s.bush} />
            <Circle cx={362} cy={284} r={15} fill={s.bush} />
            <Circle cx={380} cy={291} r={10} fill={s.bush2} />
          </>,
        )}
      </View>

      <Animated.View
        style={[StyleSheet.absoluteFill, { transformOrigin: `${pivotX}px ${pivotY}px` }, signStyle]}
        pointerEvents="none"
      >
        {layer(
          <>
            <Line x1={300} y1={212} x2={300} y2={222} stroke="#FFFFFF" strokeWidth={2} />
            <Rect x={284} y={222} width={32} height={15} rx={4} fill="#FFFFFF" />
            <SvgText x={300} y={233} textAnchor="middle" fontFamily={fontFamily.sora700} fontSize={7.5} fill={DAY.signText}>
              {t('kit.art.open')}
            </SvgText>
          </>,
        )}
      </Animated.View>

      <Animated.View style={[StyleSheet.absoluteFill, bikeStyle]} pointerEvents="none">
        {layer(
          <G>
            <Circle cx={14} cy={300} r={5} fill="none" stroke={s.rider} strokeWidth={2} />
            <Circle cx={34} cy={300} r={5} fill="none" stroke={s.rider} strokeWidth={2} />
            <Path d="M14 300 L22 290 H30 L34 300" fill="none" stroke={s.rider} strokeWidth={2} />
            <Rect x={18} y={280} width={12} height={10} rx={2} fill="#F0907C" />
          </G>,
        )}
      </Animated.View>
    </View>
  );
}
