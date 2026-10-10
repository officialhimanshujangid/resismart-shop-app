import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { IconButton, Modal, Portal, Text } from 'react-native-paper';
import { useTranslation } from 'react-i18next';

import { ColorScheme, radii } from '../../../constants/colors';
import { BarcodeScannerView, ProductScanOutcome } from '../../scanner';
import type { QueuedScan } from '../countQueue';
// M20 — a tick springs in beside each counted scan; a code the catalogue does not
// know shakes the list (the scanner already beeps + buzzes). None under reduce-motion.
import Animated from 'react-native-reanimated';
import { SuccessCheck, useShake } from '../../../components/ui/Feedback';

/**
 * Count-by-scan (screen S11, ADD mode): the camera stays open, every scan adds
 * ONE unit of that product to the count, and the last few scans are listed big
 * enough to read at arm's length. Nothing here waits for the network — the
 * scan goes into the on-phone queue (`useCountQueue`) and is sent when it can
 * be. A scan the catalogue does not know, or one scanned with no signal, is
 * queued by its barcode and the server matches it.
 */
export function CountScanner({
  c, visible, onClose, onScan, unsent, online,
}: {
  c: ColorScheme;
  visible: boolean;
  onClose: () => void;
  onScan: (scan: QueuedScan) => void;
  unsent: number;
  online: boolean;
}) {
  const { t } = useTranslation();
  const [recent, setRecent] = useState<{ label: string; n: number }[]>([]);
  const [hits, setHits] = useState(0);
  const { style: shakeStyle, shake } = useShake();

  const onResult = (o: ProductScanOutcome) => {
    let scan: QueuedScan;
    if (o.status === 'found') scan = { productId: o.product._id, label: o.product.name, qty: 1 };
    else if (o.status === 'unknown') scan = { barcode: o.barcode, label: o.barcode, qty: 1 };
    else scan = { barcode: o.hit.code, label: o.hit.code, qty: 1 };
    onScan(scan);
    setHits((h) => h + 1);
    if (o.status === 'unknown') shake();
    setRecent((r) => {
      const [first, ...rest] = r;
      if (first && first.label === scan.label) return [{ label: first.label, n: first.n + 1 }, ...rest];
      return [{ label: scan.label, n: 1 }, ...r].slice(0, 4);
    });
  };

  return (
    <Portal>
      <Modal visible={visible} onDismiss={onClose} contentContainerStyle={[styles.modal, { backgroundColor: c.background }]}>
        <View style={styles.header}>
          <View style={{ flex: 1 }}>
            <Text style={{ color: c.textPrimary, fontSize: 16, fontWeight: '700' }}>{t('stock.count.scanTitle')}</Text>
            <Text style={{ color: online ? c.textSecondary : c.warning, fontSize: 12 }}>
              {online ? t('stock.count.unsent', { count: unsent }) : t('stock.count.offlineQueued', { count: unsent })}
            </Text>
          </View>
          <IconButton icon="check" mode="contained" onPress={onClose} accessibilityLabel={t('stock.count.doneScanning')} size={28} />
        </View>
        <Animated.View style={[styles.recent, { backgroundColor: c.surface }, shakeStyle]} accessibilityLiveRegion="polite">
          {recent.length === 0 ? (
            <Text style={{ color: c.textSecondary }}>{t('stock.count.scanHint')}</Text>
          ) : recent.map((r, i) => (
            <View key={`${r.label}-${i}`} style={styles.recentRow}>
              {i === 0 ? <SuccessCheck key={hits} size={28} /> : null}
              <Text style={{ color: c.textPrimary, fontSize: i === 0 ? 18 : 14, fontWeight: i === 0 ? '700' : '500', flex: 1 }} numberOfLines={1}>{r.label}</Text>
              <Text style={{ color: c.primary, fontSize: i === 0 ? 20 : 14, fontWeight: '700' }}>+{r.n}</Text>
            </View>
          ))}
        </Animated.View>
        {/* >>> SCANNER — counting identical tins: the camera's same-code wait is 1 s
            here (2 s elsewhere), and a carton's full ITF-14 is accepted. */}
        <BarcodeScannerView active={visible} onResult={onResult} hint={t('stock.count.scanHint')} cartonCodes sameCodeWaitMs={1000} />
      </Modal>
    </Portal>
  );
}

const styles = StyleSheet.create({
  modal: { flex: 1, margin: 0 },
  header: { flexDirection: 'row', alignItems: 'center', paddingLeft: 16, paddingRight: 8, paddingTop: 8, gap: 8 },
  recent: { marginHorizontal: 12, marginVertical: 8, borderRadius: radii.card, padding: 12, gap: 4, minHeight: 56 },
  recentRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
});
