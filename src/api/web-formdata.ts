/**
 * Phones: React Native's FormData already understands `{ uri, name, type }`
 * file parts, so there is nothing to do. The web build lives in
 * `web-formdata.web.ts` (Metro picks it only when bundling for web).
 */
export async function resolveWebFormData(_data: unknown): Promise<void> {
  // no-op on iOS / Android
}
