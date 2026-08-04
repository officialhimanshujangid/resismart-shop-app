import axios from 'axios';
import { apiClient, ApiEnvelope } from '../../api/axios';
import { BarcodeLookupResult, ScannedProduct } from './types';

/**
 * `GET /partners/me/products/by-barcode/:code` — one indexed hit
 * (`{partnerId, barcode}`), already built server-side.
 *
 * Deliberately NOT a react-query `useQuery`. Every scan is a fresh code, so
 * there is nothing worth caching, and a continuous multi-scan session can fire
 * this a dozen times a minute — a query key per barcode would fill the cache
 * with one-shot entries `resetQueryCache()` never needed to know about. Callers
 * that want the request lifecycle (loading/error) get it from
 * `useProductScanner`, which wraps this.
 *
 * A 404 with `code: 'PRODUCT_NOT_FOUND'` is the expected "not in the catalog
 * yet" answer and is turned into `{ found: false }`, not thrown — see the
 * controller's own comment on why the echoed barcode matters (the create form
 * pre-fills from it). Any OTHER failure (network, 5xx, a wrong scope) is
 * re-thrown: a partner offline must not have every scan silently read as
 * "unknown, go create it" and end up minting duplicate products the moment
 * their connection comes back and the real lookup would have found the row.
 */
export async function lookupProductByBarcode(code: string): Promise<BarcodeLookupResult> {
  const normalized = code.trim().toUpperCase();
  if (!normalized) return { found: false, barcode: '' };

  try {
    const { data } = await apiClient.get<ApiEnvelope<ScannedProduct>>(
      `/partners/me/products/by-barcode/${encodeURIComponent(normalized)}`,
    );
    if (!data?.data) return { found: false, barcode: normalized };
    return { found: true, product: data.data };
  } catch (e: unknown) {
    if (axios.isAxiosError(e) && e.response?.status === 404) {
      const body = e.response.data as { barcode?: string } | undefined;
      return { found: false, barcode: body?.barcode || normalized };
    }
    throw e;
  }
}
