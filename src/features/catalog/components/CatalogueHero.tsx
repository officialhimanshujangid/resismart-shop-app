import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import { useAppTheme } from '../../../theme/useAppTheme';
import { PressableScale, Rise, useCountUp } from '../../../theme/motion';
import { fontFamily, radius } from '../../../theme/tokens';
import { ProductArt } from '../../../components/illustrations/ProductArt';

/**
 * M20 — the catalogue list's hero, DS v1 (green; replaces the legacy `Hero` +
 * `GlassStat`, which carried fixed hex/rgba and were not dark-correct).
 *
 *  • Ground: the DS sky. In light the text band is the button fill `#1F7F55`
 *    (white 4.97:1, 12 px captions included) fading to the accent green behind
 *    the tiles; in dark it is the DS navy night sky.
 *  • Motion: the block rises in, the count counts up, the stat tiles rise on a
 *    stagger and press like tiles (0.93 + light haptic), the packs bob gently.
 *    Everything is transform/opacity on the UI thread and stops under reduce-motion.
 *  • The two tiles are glass cards (DS glass + ink text: ≥ 4.5:1 in both modes).
 *    "Running low" toggles the list's low-stock filter, so the number is a door.
 *  • Under the stack header (no top inset of its own) and 360 px safe: the words
 *    keep clear of the art, and Hindi wraps.
 */
export function CatalogueHero({
  eyebrow, total, totalLabel, subtitle, lowLabel, lowCount, lowActive, onLowPress, categoriesLabel, categoryCount,
}: {
  eyebrow: string;
  total: number;
  totalLabel: string;
  subtitle: string;
  lowLabel: string;
  lowCount: number;
  lowActive: boolean;
  onLowPress: () => void;
  categoriesLabel: string;
  categoryCount: number;
}) {
  const { ds, sky, isDark, status, shadow } = useAppTheme();
  const shown = useCountUp(total);
  // On the sky: white on the light fill (4.97:1), the DS near-white ink on the dark night sky.
  const onSky = { color: isDark ? ds.ink : ds.onPrimary };
  const colors = (isDark ? sky : [ds.primaryFill, ds.primaryFill, sky[0]]) as unknown as readonly [string, string, string];

  return (
    <View style={styles.hero} testID="catalog-hero">
      <LinearGradient colors={colors} locations={[0, 0.55, 1]} style={StyleSheet.absoluteFill} />

      {/* Decorative shelf: three packs that bob (hidden from screen readers). */}
      <View style={styles.art} pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <Rise index={1} style={styles.artBack}><ProductArt kind="flour" size={58} bob /></Rise>
        <Rise index={2} style={styles.artFront}><ProductArt kind="milk" size={66} bob /></Rise>
        <Rise index={3} style={styles.artSide}><ProductArt kind="chips" size={48} bob /></Rise>
      </View>

      <Rise index={0} style={styles.text}>
        <Text style={[styles.eyebrow, onSky]}>{eyebrow}</Text>
        <View style={styles.headline} accessible accessibilityLabel={`${total} ${totalLabel}`}>
          <Text style={[styles.count, onSky]}>{String(Math.round(shown))}</Text>
          <Text style={[styles.countLabel, onSky]}>{totalLabel}</Text>
        </View>
        <Text style={[styles.subtitle, onSky]}>{subtitle}</Text>
      </Rise>

      <View style={styles.tiles}>
        <Rise index={1} style={styles.tileCell}>
          <PressableScale
            onPress={onLowPress}
            scaleTo={0.93}
            haptic
            accessibilityRole="button"
            accessibilityState={{ selected: lowActive }}
            accessibilityLabel={`${lowLabel}: ${lowCount}`}
            style={[styles.tile, { backgroundColor: ds.glass, borderColor: lowActive ? status.warn.fg : ds.glassBorder }, shadow('glass')]}
            testID="catalog-hero-low"
          >
            <MaterialCommunityIcons name="alert-octagon-outline" size={18} color={lowCount > 0 ? status.warn.fg : ds.muted} />
            <Stat value={lowCount} color={lowCount > 0 ? status.warn.fg : ds.ink} />
            <Text style={[styles.tileLabel, { color: ds.muted }]}>{lowLabel}</Text>
          </PressableScale>
        </Rise>
        <Rise index={2} style={styles.tileCell}>
          <View
            accessible
            accessibilityLabel={`${categoriesLabel}: ${categoryCount}`}
            style={[styles.tile, { backgroundColor: ds.glass, borderColor: ds.glassBorder }, shadow('glass')]}
          >
            <MaterialCommunityIcons name="tag-outline" size={18} color={ds.muted} />
            <Stat value={categoryCount} color={ds.ink} />
            <Text style={[styles.tileLabel, { color: ds.muted }]}>{categoriesLabel}</Text>
          </View>
        </Rise>
      </View>
    </View>
  );
}

function Stat({ value, color }: { value: number; color: string }) {
  const n = useCountUp(value);
  return <Text style={[styles.stat, { color }]}>{String(Math.round(n))}</Text>;
}

const styles = StyleSheet.create({
  hero: {
    overflow: 'hidden',
    borderBottomLeftRadius: radius.hero,
    borderBottomRightRadius: radius.hero,
    paddingHorizontal: 18,
    paddingTop: 16,
    paddingBottom: 18,
    gap: 14,
  },
  art: { position: 'absolute', right: 8, top: 10, width: 128, height: 104 },
  artBack: { position: 'absolute', right: 52, top: 4 },
  artFront: { position: 'absolute', right: 6, top: 18 },
  artSide: { position: 'absolute', right: 78, top: 50 },
  text: { paddingRight: 120, gap: 2, minHeight: 96 },
  eyebrow: { fontSize: 12, fontWeight: '600', letterSpacing: 0.3, opacity: 0.95 },
  headline: { flexDirection: 'row', alignItems: 'baseline', flexWrap: 'wrap', columnGap: 8 },
  count: { fontFamily: fontFamily.sora700, fontSize: 36, lineHeight: 44 },
  countLabel: { fontSize: 15, fontWeight: '600' },
  subtitle: { fontSize: 13, lineHeight: 18 },
  tiles: { flexDirection: 'row', gap: 10 },
  tileCell: { flex: 1, minWidth: 0 },
  tile: { borderRadius: radius.tile, borderWidth: 1, padding: 12, gap: 2, minHeight: 92 },
  stat: { fontFamily: fontFamily.sora600, fontSize: 22, lineHeight: 28 },
  tileLabel: { fontSize: 12, fontWeight: '600', lineHeight: 16 },
});
