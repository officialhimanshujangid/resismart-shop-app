import React, { useState } from 'react';
import { Linking, Pressable, StyleSheet, View } from 'react-native';
import { ActivityIndicator, Text } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { useTranslation } from 'react-i18next';

import { ColorScheme, radii } from '../constants/colors';

/**
 * MP1-QA: the WEB build of `MapPicker`.
 *
 * `react-native-maps` is native-only — importing it on web pulls in
 * `react-native/Libraries/...` internals and the whole web bundle fails with a
 * 500 before the first screen (signup imports this component). Metro picks this
 * `.web.tsx` file on web and `MapPicker.tsx` on Android/iOS, so the phone keeps
 * its real map unchanged.
 *
 * Same props and the same rule as the native picker: it never invents a
 * coordinate. On web the pin comes from the GPS button (browser location) or
 * from the latitude/longitude boxes the screens already show; "Check on map"
 * opens the pin in Google Maps in a new tab. No map tiles, no key.
 */

type PermissionState = 'unasked' | 'granted' | 'denied' | 'unavailable';

interface MapPickerProps {
  c: ColorScheme;
  point: { lat: number; lng: number } | null;
  onPick: (lat: number, lng: number) => void;
  onGpsFix?: (coords: { latitude: number; longitude: number }) => void;
  disabled?: boolean;
}

const round6 = (n: number): number => Math.round(n * 1e6) / 1e6;

export function MapPicker({ c, point, onPick, onGpsFix, disabled = false }: MapPickerProps) {
  const { t } = useTranslation();
  const [permission, setPermission] = useState<PermissionState>('unasked');
  const [locating, setLocating] = useState(false);

  const takeGpsFix = async () => {
    setLocating(true);
    try {
      const granted = await Location.requestForegroundPermissionsAsync();
      setPermission(granted.granted ? 'granted' : 'denied');
      if (!granted.granted) return;
      const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      onPick(round6(position.coords.latitude), round6(position.coords.longitude));
      onGpsFix?.({ latitude: position.coords.latitude, longitude: position.coords.longitude });
    } catch {
      setPermission('unavailable');
    } finally {
      setLocating(false);
    }
  };

  const hint = !point
    ? t(disabled ? 'components.map.noPinReadOnly' : 'components.map.noPin')
    : t('components.map.coords', { lat: point.lat.toFixed(5), lng: point.lng.toFixed(5) });

  return (
    <View>
      <View
        accessibilityLabel={t('components.map.mapLabel')}
        style={[styles.frame, { borderColor: point ? c.primary : c.border, backgroundColor: c.surfaceVariant }]}
      >
        <MaterialCommunityIcons name={point ? 'map-marker' : 'crosshairs'} size={30} color={point ? c.primary : c.textSecondary} />
        <View style={styles.actions}>
          {!disabled && (
            <Pressable
              onPress={() => void takeGpsFix()}
              disabled={locating}
              accessibilityRole="button"
              accessibilityLabel={t('components.map.gpsButton')}
              style={({ pressed }) => [
                styles.btn,
                { backgroundColor: c.surface, borderColor: c.primary, opacity: locating ? 0.7 : pressed ? 0.85 : 1 },
              ]}
            >
              {locating ? (
                <ActivityIndicator size={16} color={c.primary} />
              ) : (
                <MaterialCommunityIcons name="crosshairs-gps" size={17} color={c.primary} />
              )}
              <Text style={[styles.btnLabel, { color: c.primary }]}>
                {t(locating ? 'components.map.locating' : 'components.map.myLocation')}
              </Text>
            </Pressable>
          )}
          {point && (
            <Pressable
              onPress={() => void Linking.openURL(`https://www.google.com/maps?q=${point.lat},${point.lng}`)}
              accessibilityRole="link"
              style={({ pressed }) => [styles.btn, { backgroundColor: c.surface, borderColor: c.border, opacity: pressed ? 0.85 : 1 }]}
            >
              <MaterialCommunityIcons name="open-in-new" size={16} color={c.textSecondary} />
              <Text style={[styles.btnLabel, { color: c.textSecondary }]}>Google Maps</Text>
            </Pressable>
          )}
        </View>
      </View>

      <Text style={[styles.hint, { color: c.textSecondary }]}>{hint}</Text>
      {permission === 'denied' && (
        <Text style={[styles.hint, { color: c.warning }]}>{t('components.map.permissionDenied')}</Text>
      )}
      {permission === 'unavailable' && (
        <Text style={[styles.hint, { color: c.warning }]}>{t('components.map.permissionUnavailable')}</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    borderRadius: radii.card,
    borderWidth: 1.5,
    marginTop: 4,
    paddingVertical: 16,
    paddingHorizontal: 12,
    alignItems: 'center',
    gap: 10,
  },
  actions: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 8 },
  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radii.pill,
    borderWidth: 1.5,
  },
  btnLabel: { fontSize: 13, fontWeight: '600' },
  hint: { fontSize: 12.5, lineHeight: 17, marginTop: 6 },
});
