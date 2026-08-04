import { apiClient } from '../../api/axios';

/**
 * Search-by-name, for the "add from catalog" line-item picker.
 *
 * Barcode lookup deliberately does NOT live here. `src/features/scanner`
 * (PARTNERS_PLAN §12.1, built by the orders agent — see its own header:
 * "reused by the catalog... and by billing") already owns
 * `lookupProductByBarcode()` and `<BarcodeScannerView>`, covering camera, a
 * USB/Bluetooth HID-wedge scanner and manual code entry behind one hook. A
 * second `by-barcode` client in this file would be the exact "second
 * implementation is a second, drifting answer" bug this codebase's own
 * comments warn against elsewhere (`partner-tax.util.ts`,
 * `partner-document.model.ts`) — see `app/(app)/billing/new.tsx` for the
 * integration.
 */

export interface BillableProduct {
  _id: string;
  name: string;
  sku?: string;
  barcode?: string;
  hsnCode?: string;
  unit: string;
  mrpPaise: number;
  sellPaise: number;
  taxRatePercent: number;
  taxInclusive: boolean;
  stockQty: number;
  trackStock: boolean;
  isActive: boolean;
}

export const productsApi = {
  search: (q: string, limit = 20) =>
    apiClient
      .get<{ data: BillableProduct[] }>('/partners/me/products', { params: { q, limit, isActive: 'true' } })
      .then((r) => r.data.data),
};
