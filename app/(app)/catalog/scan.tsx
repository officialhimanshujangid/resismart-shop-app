import React, { useCallback, useState } from 'react';
import { View, StyleSheet } from 'react-native';
import Animated, { FadeInDown, ReduceMotion } from 'react-native-reanimated';
import { Text, Snackbar } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

import { BarcodeScannerView } from '../../../src/features/scanner';
import type { ProductScanOutcome } from '../../../src/features/scanner';
import { PressableScale } from '../../../src/theme';

/**
 * Camera chrome (M09): this screen is always a live camera feed, whatever the
 * theme, so its overlay is white-on-black by design rather than a theme token —
 * the one deliberate exception, named once here.
 */
const CAMERA = { ground: '#000000', ink: '#FFFFFF', glass: 'rgba(0,0,0,0.45)' } as const;

/**
 * Look a product up (or start creating it) by camera or manual entry —
 * PARTNERS_PLAN §12.1's "unknown code → instant create". `found` pushes to
 * the product (not `replace`) and `unknown` pushes to the create form with
 * `returnTo=/catalog/scan`, so the back arrow on EITHER destination lands the
 * cashier straight back on a live camera to scan the next item — "continuous
 * multi-scan... do not dismiss the camera between items", applied across a
 * navigation instead of within one screen, which is what a real create form
 * (not a lightweight bottom sheet) requires.
 */
export default function CatalogScanScreen() {
  const { t } = useTranslation();
  const [snackbar, setSnackbar] = useState<string | null>(null);
  const [suppressed, setSuppressed] = useState(false);

  // `router.push` to the product/create screen does not unmount this one —
  // coming BACK to it (rather than a fresh mount) is the whole point of
  // pushing instead of replacing. Without this, `suppressed` stays `true`
  // from the scan that navigated away and the camera looks dead on return.
  //
  // Un-suppressing here does NOT risk bouncing the shopkeeper straight back
  // into the product they just came from, even though the phone is usually
  // still hovering over the same pack. `useProductScanner` treats the code it
  // accepted last, seen again in the first moments after being un-paused, as
  // the tail of that same presentation rather than a new scan — it has to
  // leave the frame before it counts again. That is the hook's job precisely
  // because this screen is not the only one that pauses and resumes.
  useFocusEffect(
    useCallback(() => {
      setSuppressed(false);
    }, []),
  );

  const handleResult = (outcome: ProductScanOutcome) => {
    if (outcome.status === 'found') {
      setSuppressed(true);
      router.push({ pathname: '/catalog/[id]', params: { id: outcome.product._id } });
      return;
    }
    if (outcome.status === 'unknown') {
      setSuppressed(true);
      router.push({ pathname: '/catalog/create', params: { barcode: outcome.barcode, returnTo: '/catalog/scan' } });
      return;
    }
    setSnackbar(outcome.message);
  };

  return (
    <View style={styles.root}>
      {/* >>> SCANNER — the catalogue: a carton's full ITF-14 is accepted too. */}
      <BarcodeScannerView active={!suppressed} onResult={handleResult} hint={t('catalog.scan.hint')} cartonCodes />

      <SafeAreaView style={styles.headerOverlay} edges={['top']} pointerEvents="box-none">
        <Animated.View
          entering={FadeInDown.duration(300).reduceMotion(ReduceMotion.System)}
          style={styles.headerRow}
          pointerEvents="box-none"
        >
          {/* A labelled, 44 pt back control with press scale + haptic (M09): it was an
              unlabelled 36 pt icon a screen reader announced as nothing. */}
          <PressableScale
            onPress={() => router.back()}
            style={styles.backBtn}
            hitSlop={10}
            haptic
            accessibilityRole="button"
            accessibilityLabel={t('common.back')}
          >
            <MaterialCommunityIcons name="arrow-left" size={22} color={CAMERA.ink} />
          </PressableScale>
          <Text style={styles.headerTitle}>{t('catalog.scan.title')}</Text>
        </Animated.View>
      </SafeAreaView>

      <Snackbar visible={Boolean(snackbar)} onDismiss={() => setSnackbar(null)} duration={4000}>
        {snackbar}
      </Snackbar>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: CAMERA.ground },
  headerOverlay: {
    position: 'absolute', top: 0, left: 0, right: 0,
    paddingHorizontal: 12, paddingTop: 6,
  },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  backBtn: {
    width: 44, height: 44, borderRadius: 22, backgroundColor: CAMERA.glass,
    alignItems: 'center', justifyContent: 'center',
  },
  headerTitle: { color: CAMERA.ink, fontSize: 15, fontWeight: '600', flexShrink: 1 },
});
