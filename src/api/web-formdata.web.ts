/**
 * 11-06 overnight fix — every photo / file upload failed in the web build.
 *
 * The app appends files the React Native way: `form.append('image', { uri, name, type })`.
 * Phones turn that into a real file part. A browser's FormData does not: it
 * stores the text "[object Object]", so the server answered 400 ("no file") for
 * Bazaar photos, complaint photos, documents, receipts — about 30 upload spots.
 *
 * Rather than touch each one, the web build sets such parts aside when they are
 * appended, and `resolveWebFormData` (called by the api client just before the
 * request goes out) reads each `uri` (blob: / data: URL) and attaches a real File.
 * Phones never load this file.
 */
type RnFilePart = { uri: string; name?: string; type?: string };
const PENDING = '__rsPendingFiles';
const nativeAppend = FormData.prototype.append;

const isRnFilePart = (v: unknown): v is RnFilePart =>
  !!v && typeof v === 'object' && !(v instanceof Blob) && typeof (v as RnFilePart).uri === 'string';

if (!(FormData.prototype as any).__rsPatched) {
  (FormData.prototype as any).__rsPatched = true;
  FormData.prototype.append = function append(this: FormData, name: string, value: any, fileName?: string) {
    if (isRnFilePart(value)) {
      const self = this as any;
      (self[PENDING] ||= []).push({ name, part: value });
      return;
    }
    return fileName === undefined ? nativeAppend.call(this, name, value) : nativeAppend.call(this, name, value, fileName);
  } as typeof FormData.prototype.append;
}

export async function resolveWebFormData(data: unknown): Promise<void> {
  if (!(data instanceof FormData)) return;
  const self = data as any;
  const list: { name: string; part: RnFilePart }[] = self[PENDING] || [];
  if (!list.length) return;
  self[PENDING] = [];
  for (const { name, part } of list) {
    const blob = await (await fetch(part.uri)).blob();
    const type = part.type || blob.type || 'application/octet-stream';
    nativeAppend.call(data, name, new File([blob], part.name || 'file', { type }));
  }
}
