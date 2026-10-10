import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, StyleSheet, useColorScheme, Linking, Platform } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Button, IconButton, Text, TextInput, ActivityIndicator } from 'react-native-paper';
import { useTranslation } from 'react-i18next';

import { useProductScanner } from './useProductScanner';
import { useRememberedScanMethod } from './scanMethod';
import {
  RETAIL_BARCODE_TYPES, EXTENDED_BARCODE_TYPES, CARTON_BARCODE_TYPES, ProductScanOutcome, ProductScanRejection,
} from './types';
import { themeColors, radii } from '../../constants/colors';
// M20 — the result strip shakes on a code that is not a product / a refused read
// (the beep + buzz already fire); nothing moves under reduce-motion.
import Animated from 'react-native-reanimated';
import { SuccessCheck, useShake } from '../../components/ui/Feedback';
import { ScanLine } from '../../components/ui/ScanLine';

/**
 * THE ready-made scanning surface (PARTNERS_PLAN §12.1). Drop it into any
 * screen that needs to turn a barcode into a product: the catalog's own
 * `catalog/scan.tsx` uses it as-is, and it is exported for the billing agent
 * to do the same rather than rebuild camera + permissions + manual entry a
 * second time. If a screen needs a custom layout around the camera (e.g. a
 * running bill list beside it), use `useProductScanner` directly instead —
 * see the header on that file.
 *
 * Four things this owns and a caller should not reimplement:
 *  - camera permission, requested once and re-offered with a clear reason if
 *    refused, WITHOUT ever blocking manual entry;
 *  - the torch toggle, tap target large enough for a one-handed counter;
 *  - manual entry, which is ALWAYS reachable — collapsed to one line when the
 *    remembered method is "camera", expanded when it is "manual" or when the
 *    camera has no permission, but never removed from the screen;
 *  - the scan latch and the symbology set, both from `useProductScanner` /
 *    `RETAIL_BARCODE_TYPES`. ONE physical scan is one beep and one `onResult`,
 *    however long the item is held in frame; the next one needs the item to
 *    leave the frame first. A caller's `onResult` therefore never has to
 *    de-duplicate, and must not try to — see the latch note on the hook for
 *    why the second tin of the same paint depends on it not trying.
 */
export interface BarcodeScannerViewProps {
  /** Pauses scanning without unmounting the camera — e.g. a result sheet from `onResult` is open on top. */
  active: boolean;
  onResult: (outcome: ProductScanOutcome) => void;
  /** Shown above the manual-entry row. Defaults to a generic instruction. */
  hint?: string;
  /**
   * Also decode QR, DataMatrix, PDF417, Aztec, Code 93 and Codabar. OFF by
   * default and it should stay off on a retail counter — see the reasoning on
   * `RETAIL_BARCODE_TYPES`. A screen that turns this on is accepting that when
   * a pack carries several codes, whichever one the decoder resolves first is
   * the one that gets scanned. None of this app's three scanning screens sets
   * it; it exists so a future screen with a real reason has one instead of
   * reaching back into the constant.
   */
  extendedSymbologies?: boolean;
  // >>> SCANNER
  /**
   * When given, a code the catalogue does not know shows ONE "Add new product
   * with this barcode" button on the result strip (instead of the screen
   * jumping to a form on every unknown read). The caller navigates.
   */
  onAddNew?: (barcode: string) => void;
  /**
   * Also read a carton's ITF-14 (full 14 digits + valid check digit only).
   * Receiving screens — catalogue, product create/edit, stock count, stock in —
   * NOT the billing counter.
   */
  cartonCodes?: boolean;
  /** Camera: how long the SAME code waits after its add before it counts again. 2 s; the stock count uses 1 s. */
  sameCodeWaitMs?: number;
  // <<< SCANNER
}

// >>> SCANNER — the strip under the camera: what was read, and what it was.
type ScanStatus =
  | { tone: 'ok' | 'warn'; text: string; addBarcode?: string }
  | null;
// <<< SCANNER

export function BarcodeScannerView({
  active, onResult, hint, extendedSymbologies = false, onAddNew, cartonCodes = false, sameCodeWaitMs,
}: BarcodeScannerViewProps) {
  // `hint` has NO `t(…)` default parameter — a translator called in a default
  // would resolve once at module load and freeze the language. The fallback is
  // applied with `??` inside the render below instead.
  const { t } = useTranslation();
  const c = themeColors(useColorScheme() === 'dark');
  const [permission, requestPermission] = useCameraPermissions();
  const [torch, setTorch] = useState(false);
  const [manualCode, setManualCode] = useState('');
  const { method, setMethod, loaded: methodLoaded } = useRememberedScanMethod('camera');

  // >>> SCANNER — "Scanned: 8901234567890 — Milk 1L", a green frame flash on
  // accept, and a clear sentence for a code that is not a product.
  const [status, setStatus] = useState<ScanStatus>(null);
  const [flash, setFlash] = useState(false);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (flashTimer.current) clearTimeout(flashTimer.current); }, []);

  const { style: stripShake, shake: shakeStrip } = useShake();
  const handleResult = useCallback((outcome: ProductScanOutcome) => {
    if (outcome.status === 'found') {
      setStatus({ tone: 'ok', text: t('components.scanner.scannedFound', { code: outcome.hit.code, name: outcome.product.name }) });
    } else if (outcome.status === 'unknown') {
      setStatus({ tone: 'warn', text: t('components.scanner.scannedUnknown', { code: outcome.barcode }), addBarcode: outcome.barcode });
      shakeStrip();
    } else {
      setStatus(null); // the caller shows the network error
    }
    onResult(outcome);
  }, [onResult, t, shakeStrip]);

  const { handleBarcodeScanned, submitManualCode, looking } = useProductScanner({
    enabled: active,
    allowTwoD: extendedSymbologies,
    allowItf: cartonCodes || extendedSymbologies,
    gate: sameCodeWaitMs ? { cooldownMs: sameCodeWaitMs } : undefined,
    onResult: handleResult,
    onRejected: (r: ProductScanRejection) => { setStatus({ tone: 'warn', text: t(`components.scanner.reject.${r.reason}`) }); shakeStrip(); },
    onAccepted: () => {
      setFlash(true);
      if (flashTimer.current) clearTimeout(flashTimer.current);
      flashTimer.current = setTimeout(() => setFlash(false), 600);
    },
  });
  // <<< SCANNER

  // Memoised because `barcodeScannerSettings` is a new object on every render
  // otherwise, and this component re-renders on the torch toggle, on `looking`
  // and on every keystroke in the manual field — handing the native camera a
  // fresh settings object each time is work for nothing on the one screen that
  // is already busy decoding frames.
  // >>> SCANNER — + ITF-14 on receiving screens (`cartonCodes`), never on billing.
  const barcodeTypes = useMemo(
    () => (extendedSymbologies
      ? [...RETAIL_BARCODE_TYPES, ...EXTENDED_BARCODE_TYPES]
      : cartonCodes
        ? [...RETAIL_BARCODE_TYPES, ...CARTON_BARCODE_TYPES]
        : [...RETAIL_BARCODE_TYPES]),
    [extendedSymbologies, cartonCodes],
  );
  // <<< SCANNER

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
            barcodeScannerSettings={{ barcodeTypes }}
            onBarcodeScanned={active ? handleBarcodeScanned : undefined}
          />
        ) : (
          <View style={styles.permissionCard}>
            <Text style={styles.permissionTitle}>{t('components.scanner.cameraUnavailable')}</Text>
            <Text style={styles.permissionBody}>
              {t(permission?.canAskAgain === false
                ? 'components.scanner.permissionRefused'
                : 'components.scanner.permissionAsk')}
            </Text>
            {permission?.canAskAgain === false ? (
              <IconButton
                icon="cog-outline"
                mode="contained"
                onPress={() => void Linking.openSettings()}
                accessibilityLabel={t('components.scanner.openSettings')}
              />
            ) : (
              <IconButton
                icon="camera-outline"
                mode="contained"
                onPress={() => void requestPermission()}
                accessibilityLabel={t('components.scanner.allowCamera')}
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
              accessibilityLabel={t(torch ? 'components.scanner.torchOff' : 'components.scanner.torchOn')}
            />
            {looking && (
              <View style={styles.lookingPill}>
                <ActivityIndicator size={14} color="#fff" />
                <Text style={[styles.lookingText, { flexShrink: 1 }]}>{t('components.scanner.lookingUp')}</Text>
              </View>
            )}
          </View>
        )}

        {cameraGranted && (
          // UX-P (C10): the frame's sweeping line while it is looking; a springing
          // tick on an accepted read (the beep + buzz were already there).
          <View pointerEvents="none" style={[styles.frameGuide, flash && styles.frameGuideHit]}>
            <ScanLine active={active && !looking && !flash} />
            {flash ? <View style={styles.frameTick}><SuccessCheck size={48} /></View> : null}
          </View>
        )}

        {/* >>> SCANNER — what was read; one Add button for an unknown code. */}
        {status && (
          <Animated.View style={[styles.statusStrip, status.tone === 'ok' ? styles.statusOk : styles.statusWarn, stripShake]} accessibilityLiveRegion="polite">
            <Text style={styles.statusText} numberOfLines={2}>{status.text}</Text>
            {status.addBarcode && onAddNew && (
              <Button
                mode="contained"
                compact
                icon="plus"
                buttonColor="#fff"
                textColor="#1F2937"
                onPress={() => { const b = status.addBarcode!; setStatus(null); onAddNew(b); }}
                accessibilityLabel={t('components.scanner.addNew')}
              >
                {t('components.scanner.addNewShort')}
              </Button>
            )}
          </Animated.View>
        )}
        {/* <<< SCANNER */}
      </View>

      <View style={[styles.manualArea, { backgroundColor: c.surface, borderTopColor: c.divider }]}>
        {manualExpanded ? (
          <>
            <Text style={[styles.hint, { color: c.textSecondary }]}>
              {hint ?? t('components.scanner.manualHint')}
            </Text>
            <View style={styles.manualRow}>
              <TextInput
                mode="outlined"
                value={manualCode}
                onChangeText={setManualCode}
                placeholder={t('components.scanner.manualPlaceholder')}
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
                  accessibilityLabel={t('components.scanner.switchToCamera')}
                />
              )}
            </View>
          </>
        ) : (
          <IconButton
            icon="keyboard-outline"
            mode="outlined"
            onPress={() => setManualExpanded(true)}
            accessibilityLabel={t('components.scanner.enterManually')}
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
  // >>> SCANNER
  frameGuideHit: { borderColor: '#22C55E', borderWidth: 4 },
  frameTick: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
  statusStrip: {
    position: 'absolute', left: 12, right: 12, bottom: 12,
    flexDirection: 'row', alignItems: 'center', gap: 8,
    borderRadius: radii.md, paddingHorizontal: 12, paddingVertical: 8,
  },
  statusOk: { backgroundColor: 'rgba(21,128,61,0.92)' },
  statusWarn: { backgroundColor: 'rgba(180,83,9,0.94)' },
  statusText: { flex: 1, color: '#fff', fontSize: 13, fontWeight: '600', lineHeight: 18 },
  // <<< SCANNER
  permissionCard: {
    flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, padding: 24,
  },
  permissionTitle: { color: '#fff', fontSize: 16, fontWeight: '600' },
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
