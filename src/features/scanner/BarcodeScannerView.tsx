import React, { useCallback, useEffect, useState } from 'react';
import { View, StyleSheet, useColorScheme, Linking, Platform } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { IconButton, Text, TextInput, ActivityIndicator } from 'react-native-paper';

import { useProductScanner } from './useProductScanner';
import { useRememberedScanMethod } from './scanMethod';
import { SUPPORTED_BARCODE_TYPES, ProductScanOutcome } from './types';
import { themeColors, radii } from '../../constants/colors';

/**
 * THE ready-made scanning surface (PARTNERS_PLAN §12.1). Drop it into any
 * screen that needs to turn a barcode into a product: the catalog's own
 * `catalog/scan.tsx` uses it as-is, and it is exported for the billing agent
 * to do the same rather than rebuild camera + permissions + manual entry a
 * second time. If a screen needs a custom layout around the camera (e.g. a
 * running bill list beside it), use `useProductScanner` directly instead —
 * see the header on that file.
 *
 * Three things this owns and a caller should not reimplement:
 *  - camera permission, requested once and re-offered with a clear reason if
 *    refused, WITHOUT ever blocking manual entry;
 *  - the torch toggle, tap target large enough for a one-handed counter;
 *  - manual entry, which is ALWAYS reachable — collapsed to one line when the
 *    remembered method is "camera", expanded when it is "manual" or when the
 *    camera has no permission, but never removed from the screen.
 */
export interface BarcodeScannerViewProps {
  /** Pauses scanning without unmounting the camera — e.g. a result sheet from `onResult` is open on top. */
  active: boolean;
  onResult: (outcome: ProductScanOutcome) => void;
  /** Shown above the manual-entry row. Defaults to a generic instruction. */
  hint?: string;
}

export function BarcodeScannerView({ active, onResult, hint }: BarcodeScannerViewProps) {
  const c = themeColors(useColorScheme() === 'dark');
  const [permission, requestPermission] = useCameraPermissions();
  const [torch, setTorch] = useState(false);
  const [manualCode, setManualCode] = useState('');
  const { method, setMethod, loaded: methodLoaded } = useRememberedScanMethod('camera');

  const { handleBarcodeScanned, submitManualCode, looking } = useProductScanner({
    enabled: active,
    onResult,
  });

  // Ask once on mount. `permission === null` is "we haven't asked yet" — a
  // camera screen that never asks is a camera screen that never works, and the
  // manual-entry row below stays usable the whole time this is in flight.
  useEffect(() => {
    if (permission && !permission.granted && permission.canAskAgain) {
      void requestPermission();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [permission?.status]);

  const submitManual = useCallback(() => {
    const code = manualCode.trim();
    if (!code) return;
    submitManualCode(code);
    setManualCode('');
    // A submission IS the user choosing manual for this session — remembered
    // for next time even if they arrived here via the camera.
    setMethod('manual');
  }, [manualCode, submitManualCode, setMethod]);

  const cameraGranted = permission?.granted === true;
  // Expanded by default unless the partner's last session ended on "camera"
  // AND the camera is actually usable right now — a phone with no camera
  // permission must not hide the only input path that works.
  //
  // `useRememberedScanMethod` reads AsyncStorage asynchronously, so `method`
  // is still the 'camera' default for the first render or two regardless of
  // what was actually stored — `useState(method !== 'camera')` would only
  // ever capture THAT first value, since `useState`'s argument is read once.
  // This effect applies the stored preference the moment it actually arrives
  // (`methodLoaded` flips exactly once), rather than the render before it.
  const [manualExpanded, setManualExpanded] = useState(false);
  useEffect(() => {
    if (methodLoaded) setManualExpanded(method !== 'camera');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [methodLoaded]);
  useEffect(() => {
    if (!cameraGranted) setManualExpanded(true);
  }, [cameraGranted]);

  return (
    <View style={styles.root}>
      <View style={[styles.cameraArea, { backgroundColor: '#000' }]}>
        {cameraGranted ? (
          <CameraView
            style={StyleSheet.absoluteFill}
            facing="back"
            enableTorch={torch}
            barcodeScannerSettings={{ barcodeTypes: [...SUPPORTED_BARCODE_TYPES] }}
            onBarcodeScanned={active ? handleBarcodeScanned : undefined}
          />
        ) : (
          <View style={styles.permissionCard}>
            <Text style={styles.permissionTitle}>Camera not available</Text>
            <Text style={styles.permissionBody}>
              {permission?.canAskAgain === false
                ? 'Camera access was refused. Turn it on in Settings, or type the code below.'
                : 'Allow camera access to scan, or type the code below.'}
            </Text>
            {permission?.canAskAgain === false ? (
              <IconButton
                icon="cog-outline"
                mode="contained"
                onPress={() => void Linking.openSettings()}
                accessibilityLabel="Open settings"
              />
            ) : (
              <IconButton
                icon="camera-outline"
                mode="contained"
                onPress={() => void requestPermission()}
                accessibilityLabel="Allow camera access"
              />
            )}
          </View>
        )}

        {cameraGranted && (
          <View style={styles.cameraOverlayTop}>
            <IconButton
              icon={torch ? 'flash' : 'flash-off'}
              mode="contained-tonal"
              containerColor="rgba(0,0,0,0.45)"
              iconColor="#fff"
              onPress={() => setTorch((v) => !v)}
              accessibilityLabel={torch ? 'Turn torch off' : 'Turn torch on'}
            />
            {looking && (
              <View style={styles.lookingPill}>
                <ActivityIndicator size={14} color="#fff" />
                <Text style={styles.lookingText}>Looking up…</Text>
              </View>
            )}
          </View>
        )}

        {cameraGranted && (
          <View pointerEvents="none" style={styles.frameGuide} />
        )}
      </View>

      <View style={[styles.manualArea, { backgroundColor: c.surface, borderTopColor: c.divider }]}>
        {manualExpanded ? (
          <>
            <Text style={[styles.hint, { color: c.textSecondary }]}>
              {hint ?? 'Damaged or smudged barcode? Type the code instead.'}
            </Text>
            <View style={styles.manualRow}>
              <TextInput
                mode="outlined"
                value={manualCode}
                onChangeText={setManualCode}
                placeholder="Type a barcode or SKU"
                autoCapitalize="characters"
                autoCorrect={false}
                style={styles.manualInput}
                outlineStyle={{ borderRadius: radii.field }}
                onSubmitEditing={submitManual}
                returnKeyType="done"
                right={<TextInput.Icon icon="check" onPress={submitManual} disabled={!manualCode.trim() || looking} />}
              />
              {cameraGranted && (
                <IconButton
                  icon="camera-outline"
                  mode="outlined"
                  onPress={() => {
                    setManualExpanded(false);
                    setMethod('camera');
                  }}
                  accessibilityLabel="Switch to camera"
                />
              )}
            </View>
          </>
        ) : (
          <IconButton
            icon="keyboard-outline"
            mode="outlined"
            onPress={() => setManualExpanded(true)}
            accessibilityLabel="Enter code manually"
          />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  cameraArea: { flex: 1, overflow: 'hidden' },
  cameraOverlayTop: {
    position: 'absolute', top: 12, left: 12, right: 12,
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
  },
  lookingPill: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: radii.pill,
    paddingHorizontal: 12, paddingVertical: 6,
  },
  lookingText: { color: '#fff', fontSize: 12, fontWeight: '600' },
  frameGuide: {
    position: 'absolute', left: '12%', right: '12%', top: '32%', bottom: '38%',
    borderWidth: 2, borderColor: 'rgba(255,255,255,0.75)', borderRadius: radii.md,
  },
  permissionCard: {
    flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, padding: 24,
  },
  permissionTitle: { color: '#fff', fontSize: 16, fontWeight: '700' },
  permissionBody: { color: '#D7DEEA', fontSize: 13, textAlign: 'center', lineHeight: 18 },
  manualArea: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 14, paddingTop: 10, paddingBottom: Platform.OS === 'ios' ? 20 : 12,
    gap: 6,
  },
  hint: { fontSize: 12 },
  manualRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  manualInput: { flex: 1, backgroundColor: 'transparent' },
});
