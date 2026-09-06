import React, { useCallback, useState } from 'react';
import { Alert, Image, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { ActivityIndicator, Text } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';

import { ColorScheme, radii } from '../../../constants/colors';
import { apiErrorMessage } from '../../../api/axios';
import { uploadPublicImage } from '../../../api/partner.api';

/**
 * Photographs for a product — the thing residents actually look at.
 *
 * `Product.images` has been in the type since the catalogue was built, and both
 * the list card and the detail screen render `images[0]`. Nothing ever put a URL
 * in it: `catalog/create.tsx` sent a hardcoded `images: []` and the edit screen
 * omitted the key entirely. So every item in every partner's catalogue was a
 * line of text, and residents were being asked to shop from a spreadsheet.
 *
 * ── The upload contract, which is not optional ────────────────────────────
 *
 * Phase 0 constrained `images[]` server-side to URLs from OUR OWN BUCKET —
 * `createProductSchema` runs each entry through `uploadedUrl()`, which parses
 * the URL and compares its HOST, so a hand-built path is refused with "Attach a
 * file uploaded through ResiSmart". The only URL that can pass is the one
 * `POST /upload` returns, which is what `uploadPublicImage` hands back and what
 * is stored verbatim. There is deliberately no string-building anywhere here.
 *
 * `/upload`, not `/upload/document`: the second writes to a PRIVATE prefix and
 * a product photo has to be fetchable by a resident's phone. See
 * `uploadPublicImage`'s header.
 *
 * ── Failure, and what it must not cost ────────────────────────────────────
 *
 * Uploads happen one at a time as they are picked, NOT batched at save. A shop
 * photographing five items on a 3G connection must not lose four uploads
 * because the fifth failed, and a create form that only discovers a rejected
 * image after every other field has been typed is the "402 after the form"
 * failure this codebase already has a rule against. Each success appends
 * immediately; each failure says so and leaves everything already uploaded
 * alone.
 */

/** `createProductSchema`'s own ceiling — `.max(8, 'Eight images is plenty.')`. */
export const MAX_PRODUCT_IMAGES = 8;

interface ProductImagesProps {
  value: string[];
  onChange: (next: string[]) => void;
  c: ColorScheme;
  /** CATALOG_MANAGE at FULL. READ opens the screen and is not permission to change anything. */
  canManage: boolean;
}

export function ProductImages({ value, onChange, c, canManage }: ProductImagesProps) {
  const [uploading, setUploading] = useState(false);
  const full = value.length >= MAX_PRODUCT_IMAGES;

  const pick = useCallback(
    async (from: 'camera' | 'library') => {
      if (full) return;
      setUploading(true);
      try {
        /**
         * `mediaTypes: ['images']` — the STRING-ARRAY form.
         * `ImagePicker.MediaTypeOptions` is deprecated in this SDK and reads as
         * an object at runtime, which silently picks nothing. Same note as
         * `settings/verification.tsx` and the signup wizard, kept identical so
         * all three cannot drift.
         *
         * `quality: 0.6` rather than verification's 0.7: this is a shelf photo
         * that will be shown at card size in another app, and the bucket bill
         * and the shop's data plan are both real. `allowsMultipleSelection` is
         * on for the library so a whole shelf is one trip through the picker.
         */
        const picked =
          from === 'camera'
            ? await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.6 })
            : await ImagePicker.launchImageLibraryAsync({
                mediaTypes: ['images'],
                quality: 0.6,
                allowsMultipleSelection: true,
                selectionLimit: MAX_PRODUCT_IMAGES - value.length,
              });
        if (picked.canceled || picked.assets.length === 0) return;

        const uploaded: string[] = [];
        const failures: string[] = [];
        for (const asset of picked.assets) {
          if (value.length + uploaded.length >= MAX_PRODUCT_IMAGES) break;
          try {
            // Sequential on purpose (no `Promise.all`). A shop's uplink is the
            // bottleneck, and firing five multipart POSTs at once over 3G makes
            // all five slower and all five likelier to time out. `no-await-in-loop`
            // is not enabled in this project's config, so there is deliberately
            // no disable directive here — an unused one is itself a lint warning.
            const url = await uploadPublicImage({
              uri: asset.uri,
              name: asset.fileName ?? `product-${Date.now()}.jpg`,
              mimeType: asset.mimeType ?? 'image/jpeg',
            });
            uploaded.push(url);
          } catch (e: unknown) {
            failures.push(apiErrorMessage(e, 'That photo did not upload.'));
          }
        }

        // Everything that DID upload is kept, whatever else failed.
        if (uploaded.length > 0) onChange([...value, ...uploaded]);
        if (failures.length > 0) {
          Alert.alert(
            uploaded.length > 0 ? 'Some photos did not upload' : 'That upload did not go through',
            failures[0],
          );
        }
      } catch (e: unknown) {
        Alert.alert('Could not open your photos', apiErrorMessage(e));
      } finally {
        setUploading(false);
      }
    },
    [full, onChange, value],
  );

  /**
   * Remove one.
   *
   * The object is deliberately NOT deleted from the bucket. There is no
   * per-object ownership on `/upload` (see `uploaded-url.validator.ts`'s own
   * "deliberate limits" note) and therefore no scoped delete endpoint to call;
   * dropping the reference is the whole of what this app can honestly do. An
   * orphaned object costs storage, which is the cheaper of the two failures.
   */
  const remove = useCallback(
    (url: string) => onChange(value.filter((u) => u !== url)),
    [onChange, value],
  );

  return (
    <View style={styles.root}>
      {value.length === 0 && !canManage ? (
        <Text style={{ color: c.textDisabled, fontSize: 12.5 }}>No photos.</Text>
      ) : null}

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.strip}>
        {value.map((url, i) => (
          <View key={url} style={[styles.thumbBox, { borderColor: c.divider, backgroundColor: c.surfaceVariant }]}>
            <Image source={{ uri: url }} style={styles.thumb} resizeMode="cover" />
            {/* The first image is what the list card and the resident's
                catalogue both render, so it is worth saying which one that is —
                otherwise "reorder" looks like a missing feature rather than a
                deliberate one (drag-to-reorder is not built; removing and
                re-adding is the whole of it today). */}
            {i === 0 && (
              <View style={[styles.mainTag, { backgroundColor: c.primary }]}>
                <Text style={[styles.mainTagText, { color: c.textInverse }]}>Main</Text>
              </View>
            )}
            {canManage && (
              <Pressable
                onPress={() => remove(url)}
                style={[styles.removeBtn, { backgroundColor: c.surface }]}
                accessibilityLabel="Remove this photo"
              >
                <MaterialCommunityIcons name="close" size={14} color={c.error} />
              </Pressable>
            )}
          </View>
        ))}

        {canManage && !full && (
          <>
            <Pressable
              onPress={() => void pick('camera')}
              disabled={uploading}
              style={[styles.addBox, { borderColor: c.border }]}
              accessibilityLabel="Take a photo"
            >
              {uploading ? (
                <ActivityIndicator color={c.primary} />
              ) : (
                <>
                  <MaterialCommunityIcons name="camera-outline" size={22} color={c.primary} />
                  <Text style={[styles.addLabel, { color: c.primary }]}>Camera</Text>
                </>
              )}
            </Pressable>
            <Pressable
              onPress={() => void pick('library')}
              disabled={uploading}
              style={[styles.addBox, { borderColor: c.border }]}
              accessibilityLabel="Choose photos"
            >
              <MaterialCommunityIcons name="image-multiple-outline" size={22} color={c.primary} />
              <Text style={[styles.addLabel, { color: c.primary }]}>Gallery</Text>
            </Pressable>
          </>
        )}
      </ScrollView>

      {canManage && (
        <Text style={{ color: c.textDisabled, fontSize: 11 }}>
          {full
            ? `${MAX_PRODUCT_IMAGES} photos is the most a product can carry.`
            : 'The first photo is the one residents see in your catalogue.'}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: 6 },
  strip: { gap: 8, paddingVertical: 2 },
  thumbBox: {
    width: 82, height: 82, borderRadius: radii.sm, borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  thumb: { width: '100%', height: '100%' },
  removeBtn: {
    position: 'absolute', top: 3, right: 3, width: 20, height: 20, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center',
  },
  mainTag: { position: 'absolute', left: 0, bottom: 0, paddingHorizontal: 6, paddingVertical: 2, borderTopRightRadius: radii.xs },
  mainTagText: { fontSize: 9, fontWeight: '700', letterSpacing: 0.3 },
  addBox: {
    width: 82, height: 82, borderRadius: radii.sm, borderWidth: 1.5, borderStyle: 'dashed',
    alignItems: 'center', justifyContent: 'center', gap: 2,
  },
  addLabel: { fontSize: 11, fontWeight: '600' },
});
