import React, { useCallback, useState } from 'react';
import { View, StyleSheet, Pressable } from 'react-native';
import { Text, Snackbar } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BarcodeScannerView } from '../../../src/features/scanner';
import type { ProductScanOutcome } from '../../../src/features/scanner';

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
  const [snackbar, setSnackbar] = useState<string | null>(null);
  const [suppressed, setSuppressed] = useState(false);

  // `router.push` to the product/create screen does not unmount this one —
  // coming BACK to it (rather than a fresh mount) is the whole point of
  // pushing instead of replacing. Without this, `suppressed` stays `true`
  // from the scan that navigated away and the camera looks dead on return.
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
      <BarcodeScannerView active={!suppressed} onResult={handleResult} hint="Scan a product to look it up or add it." />

      <SafeAreaView style={styles.headerOverlay} edges={['top']} pointerEvents="box-none">
        <Pressable onPress={() => router.back()} style={styles.backBtn} hitSlop={10}>
          <MaterialCommunityIcons name="arrow-left" size={22} color="#fff" />
        </Pressable>
        <Text style={styles.headerTitle}>Scan a product</Text>
      </SafeAreaView>

      <Snackbar visible={Boolean(snackbar)} onDismiss={() => setSnackbar(null)} duration={4000}>
        {snackbar}
      </Snackbar>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },
  headerOverlay: {
    position: 'absolute', top: 0, left: 0, right: 0,
    flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, paddingTop: 6,
  },
  backBtn: {
    width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center', justifyContent: 'center',
  },
  headerTitle: { color: '#fff', fontSize: 15, fontWeight: '700' },
});
