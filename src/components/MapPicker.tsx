import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Platform, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import { ActivityIndicator, Text } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import MapView, {
  LatLng,
  MapPressEvent,
  Marker,
  MarkerDragStartEndEvent,
  PROVIDER_GOOGLE,
  Region,
} from 'react-native-maps';
import * as Location from 'expo-location';

import { ColorScheme, radii } from '../constants/colors';

/**
 * The map pin, on an actual map — signup step 2 and Settings → Address share it.
 *
 * ── Why this is `react-native-maps` and not a WebView ──────────────────────
 *
 * The owner runs this app one way: `npx expo start --go`. Expo Go ships a fixed
 * set of native modules and nothing else can be added to it, so the question was
 * never "which map library is nicest" but "which one has native code already
 * inside the Expo Go binary for SDK 54". `react-native-maps` does — the SDK 54
 * docs page for it carries `inExpoGo: true` — so it renders on a phone that has
 * only ever installed Expo Go from the store. A `react-native-webview` map would
 * also have run, and would have meant shipping a Google Maps JS key inside the
 * JS bundle and re-implementing drag, zoom and gesture handling against a
 * WebView; there was no reason to pay that once the native component was known
 * to be there.
 *
 * The version is PINNED EXACTLY (`"react-native-maps": "1.20.1"`, no `^`, no
 * `~`) because it was added with `npx expo install`, which writes the version
 * from `expo/bundledNativeModules.json` — that is, the exact build compiled into
 * Expo Go 54. A range here is not a convenience, it is a crash: this project has
 * already shipped an APK that boot-looped because an unpinned `expo-font` pulled
 * an SDK-56 native module into an SDK-54 binary. A JS bundle asking Expo Go for
 * a MapView it does not contain fails the same way.
 *
 * ── Google, and the key a store build needs ────────────────────────────────
 *
 * `PROVIDER_GOOGLE` on Android only. Expo Go carries Expo's own Maps key, so
 * nothing is needed to develop; a standalone APK carries none and renders grey
 * tiles until `android.config.googleMaps.apiKey` is set in `app.json`. On iOS
 * this deliberately falls through to Apple Maps, which needs no key at all —
 * asking for Google there would add a second credential to obtain and a second
 * way for a release build to come out blank, for a map that looks the same.
 *
 * ── The one thing this component must never do ─────────────────────────────
 *
 * It must never invent a coordinate. `onPick` fires ONLY from a finger on the
 * map, a dragged marker or a GPS fix, and with no pin set there is NO MARKER on
 * screen — a crosshair and a sentence instead. A marker parked on the default
 * centre would be a pin the partner never dropped, which is the precise shape of
 * the bug that once wrote `[0, 0]` and switched off the banner that would have
 * reported it. An empty map here stays empty upstream, so Save stays disabled
 * and the "no pin" warning keeps warning.
 */

/** Where the map opens when there is no pin and no GPS yet. */
const DEFAULT_REGION: Region = {
  // The same fallback centre the web picker uses (`frontend/.../LocationPicker`),
  // so a partner who set their pin on the website sees the map open in the same
  // place on the phone.
  latitude: 28.6273,
  longitude: 77.3649,
  latitudeDelta: 0.08,
  longitudeDelta: 0.08,
};

/** Close enough in, once there IS a pin, to tell one side of a road from the other. */
const PIN_DELTA = 0.004;

/**
 * Six decimals, ~11 cm — past which a phone's digits are noise, not precision.
 *
 * Rounded HERE rather than by each screen so that the value this component
 * emits is byte-identical to the one that comes back down as `point` after the
 * round trip through the text boxes. An unrounded fix would return a hair
 * different and read as "somebody moved the pin", re-centring the camera under
 * the finger that had just placed it. It is also what the web picker sends
 * (`toFixed(6)`), so both clients store the same shape of number.
 */
const round6 = (n: number): number => Math.round(n * 1e6) / 1e6;

/**
 * Whether the partner has been asked for location yet, and what they said.
 *
 * A refusal is a STATE, not an error. Every way of setting the pin except the
 * GPS button still works without permission — tap the map, drag the marker, type
 * the two numbers — so a denial gets a quiet line under the map saying so, and
 * never a red toast that implies the screen is now stuck.
 */
type PermissionState = 'unasked' | 'granted' | 'denied' | 'unavailable';

interface MapPickerProps {
  c: ColorScheme;
  /** The pin as the FORM holds it, or `null` while there is none. */
  point: { lat: number; lng: number } | null;
  /** A pin the partner placed. Never called for anything else. */
  onPick: (lat: number, lng: number) => void;
  /**
   * A GPS fix, in addition to `onPick`, so signup can reverse-geocode the
   * address boxes off it. Only fires for the button — a dragged pin must not
   * rewrite an address somebody typed.
   */
  onGpsFix?: (coords: LatLng) => void;
  /** View-only, for a partner without SETTINGS at FULL. */
  disabled?: boolean;
}

export function MapPicker({ c, point, onPick, onGpsFix, disabled = false }: MapPickerProps) {
  const { height: windowHeight } = useWindowDimensions();
  const mapRef = useRef<MapView>(null);
  const [permission, setPermission] = useState<PermissionState>('unasked');
  const [locating, setLocating] = useState(false);

  /**
   * The zoom the partner last left the map at, so following a typed coordinate
   * does not silently reset it. `animateToRegion` takes deltas, not a zoom
   * level, and passing a fixed pair would yank someone back out every time they
   * corrected a digit.
   */
  const zoom = useRef({ latitudeDelta: PIN_DELTA, longitudeDelta: PIN_DELTA });

  /**
   * The last coordinate this component itself emitted.
   *
   * `point` comes back down as a prop, so without this the map would re-centre
   * on every pin it just placed — fighting the finger mid-drag. Only a value
   * that did NOT come from here (typed into the latitude/longitude boxes) moves
   * the camera.
   */
  const lastEmitted = useRef<{ lat: number; lng: number } | null>(null);

  // Captured once: `initialRegion` is uncontrolled by design, and re-computing
  // it on every render would re-mount the camera under the partner.
  const initialRegion = useRef<Region>(
    point
      ? { latitude: point.lat, longitude: point.lng, latitudeDelta: PIN_DELTA, longitudeDelta: PIN_DELTA }
      : DEFAULT_REGION,
  ).current;

  /**
   * Whether the camera has ever been framed on a real pin.
   *
   * Settings loads the partner over the network, so the FIRST render has no
   * pin and the map opens on `DEFAULT_REGION` — a whole city wide. When the
   * saved pin then arrives, moving to it at that width would show the partner
   * their shop as a dot in nine kilometres of map. The first pin gets street
   * level; every move after that keeps whatever zoom they chose.
   */
  const framedAPin = useRef(Boolean(point));

  const frameOn = (lat: number, lng: number, atPinZoom: boolean, ms: number) => {
    const delta =
      atPinZoom || !framedAPin.current
        ? { latitudeDelta: PIN_DELTA, longitudeDelta: PIN_DELTA }
        : zoom.current;
    framedAPin.current = true;
    mapRef.current?.animateToRegion({ latitude: lat, longitude: lng, ...delta }, ms);
  };

  const emit = useCallback(
    (lat: number, lng: number) => {
      const placed = { lat: round6(lat), lng: round6(lng) };
      lastEmitted.current = placed;
      onPick(placed.lat, placed.lng);
    },
    [onPick],
  );

  useEffect(() => {
    if (!point) return;
    const mine = lastEmitted.current;
    // Sub-`round6` differences cannot survive the round trip through the text
    // boxes, so anything this small is the pin coming back exactly as it left —
    // a pin the map itself placed, already under the finger that placed it.
    if (mine && Math.abs(mine.lat - point.lat) < 1e-7 && Math.abs(mine.lng - point.lng) < 1e-7) return;
    // `frameOn` reads only refs, so it is stable in every way that matters here.
    frameOn(point.lat, point.lng, false, 350);
  }, [point]);

  /**
   * Named WITHOUT a `use` prefix on purpose — the web picker's own note says the
   * same thing, having been bitten by it: `useMyLocation` reads to
   * `react-hooks/rules-of-hooks` as a custom hook, and every call site inside an
   * `onPress` is then an illegal hook call. This is an event handler.
   */
  const takeGpsFix = async () => {
    setLocating(true);
    try {
      const granted = await Location.requestForegroundPermissionsAsync();
      setPermission(granted.granted ? 'granted' : 'denied');
      if (!granted.granted) return;
      const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      emit(position.coords.latitude, position.coords.longitude);
      // Always street level: "my location" is a request to look at where you are
      // standing, not to keep the city-wide view you happened to be on.
      frameOn(position.coords.latitude, position.coords.longitude, true, 400);
      onGpsFix?.(position.coords);
    } catch {
      // No fix — indoors, radio off, emulator with no location set. Same
      // treatment as a refusal: say so under the map and leave every other way
      // of placing the pin working.
      setPermission('unavailable');
    } finally {
      setLocating(false);
    }
  };

  // Roughly a quarter of the screen, clamped: on a small phone the map must not
  // push the address fields off the bottom, and on a tablet it should not stay a
  // letterbox strip.
  const mapHeight = Math.round(Math.min(300, Math.max(180, windowHeight * 0.27)));

  const hint = !point
    ? disabled
      ? 'No pin has been set for this business yet.'
      : 'Tap the map where your shop is, or use the button to take the pin from where you are standing.'
    : disabled
      ? `${point.lat.toFixed(5)}, ${point.lng.toFixed(5)}`
      : 'Drag the pin, or tap somewhere else on the map, to move it.';

  return (
    <View>
      <View style={[styles.frame, { height: mapHeight, borderColor: point ? c.primary : c.border, backgroundColor: c.surfaceVariant }]}>
        <MapView
          ref={mapRef}
          // Google on Android; Apple Maps on iOS, which needs no key. See header.
          provider={Platform.OS === 'android' ? PROVIDER_GOOGLE : undefined}
          style={StyleSheet.absoluteFill}
          initialRegion={initialRegion}
          onRegionChangeComplete={(r) => {
            zoom.current = { latitudeDelta: r.latitudeDelta, longitudeDelta: r.longitudeDelta };
          }}
          onPress={(e: MapPressEvent) => {
            if (disabled) return;
            const { latitude, longitude } = e.nativeEvent.coordinate;
            emit(latitude, longitude);
          }}
          // Only once permission is actually held: asked for it up front,
          // react-native-maps triggers the OS prompt itself, the moment this
          // screen opens and before anybody has said they want to use GPS.
          showsUserLocation={permission === 'granted'}
          showsMyLocationButton={false}
          toolbarEnabled={false}
          scrollEnabled={!disabled}
          zoomEnabled
          accessibilityLabel="Map showing where your business is"
        >
          {point ? (
            <Marker
              coordinate={{ latitude: point.lat, longitude: point.lng }}
              draggable={!disabled}
              onDragEnd={(e: MarkerDragStartEndEvent) => {
                const { latitude, longitude } = e.nativeEvent.coordinate;
                emit(latitude, longitude);
              }}
              pinColor={c.primary}
              title="Your business"
              description="Residents are matched to you by distance from here"
            />
          ) : null}
        </MapView>

        {/* No pin yet: a crosshair at the centre, which is explicitly NOT a
            marker and is not draggable. It marks where the map is looking, not
            where the shop is, and nothing upstream reads it. */}
        {!point && (
          <View pointerEvents="none" style={styles.crosshair}>
            <MaterialCommunityIcons name="crosshairs" size={34} color={c.textSecondary} />
          </View>
        )}

        {!disabled && (
          <Pressable
            onPress={() => void takeGpsFix()}
            disabled={locating}
            accessibilityRole="button"
            accessibilityLabel="Move the pin to where I am now"
            style={({ pressed }) => [
              styles.gpsBtn,
              {
                backgroundColor: c.surface,
                borderColor: c.primary,
                opacity: locating ? 0.7 : pressed ? 0.85 : 1,
              },
            ]}
          >
            {locating ? (
              <ActivityIndicator size={18} color={c.primary} />
            ) : (
              <MaterialCommunityIcons name="crosshairs-gps" size={19} color={c.primary} />
            )}
            <Text style={[styles.gpsLabel, { color: c.primary }]}>
              {locating ? 'Locating…' : 'My location'}
            </Text>
          </Pressable>
        )}
      </View>

      <Text style={[styles.hint, { color: c.textSecondary }]}>{hint}</Text>

      {permission === 'denied' && (
        <Text style={[styles.hint, { color: c.warning }]}>
          Location is off for RS Partner, so the button cannot find you — tapping the map or typing the two
          numbers below still works.
        </Text>
      )}
      {permission === 'unavailable' && (
        <Text style={[styles.hint, { color: c.warning }]}>
          Your phone could not get a fix just now. Indoors this is normal — place the pin on the map instead.
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    borderRadius: radii.card,
    borderWidth: 1.5,
    overflow: 'hidden',
    marginTop: 4,
  },
  crosshair: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  gpsBtn: {
    position: 'absolute',
    right: 10,
    bottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radii.pill,
    borderWidth: 1.5,
    // Android needs elevation for the chip to lift off the tiles; iOS takes the
    // shadow triple.
    elevation: 3,
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
  },
  gpsLabel: {
    fontSize: 13,
    fontWeight: '600',
  },
  hint: {
    fontSize: 12.5,
    lineHeight: 17,
    marginTop: 6,
  },
});
