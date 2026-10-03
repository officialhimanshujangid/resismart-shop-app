// >>> MP1-COMPLETE — P2: "Refund as" on a credit note / sales return (Commerce C4), as on web.
/**
 * The rules web uses (`frontend/src/components/partners/commerce/wallet/RefundToChoice.tsx`
 * and `partner/documents/[id]/page.tsx`), copied:
 *
 *  - asked only while the shop keeps store credit (feature WALLET), only on a
 *    CREDIT_NOTE / SALES_RETURN, and only when the paper names a customer
 *    (`partyId` — store credit belongs to somebody);
 *  - the default is the shop's own setting (`wallet.refundToCreditDefault`) when this
 *    person can read the commerce settings, else UNSET — and unset sends nothing, so the
 *    server applies the shop's default;
 *  - sent as `refundTo` on `POST /documents/:id/issue` (`issueDocumentSchema` →
 *    `refundToCreditFields`: 'CASH_OR_KHATA' | 'STORE_CREDIT', optional).
 */
export type RefundTo = 'CASH_OR_KHATA' | 'STORE_CREDIT';
export const REFUND_TO_DOC_TYPES: readonly string[] = ['CREDIT_NOTE', 'SALES_RETURN'];

/** Ask "Refund as"? */
export function asksRefundTo(i: { walletOn: boolean; type: string; partyId?: string | null }): boolean {
  return i.walletOn && !!i.partyId && REFUND_TO_DOC_TYPES.includes(i.type);
}

/** The starting choice: the shop's setting when readable, else unset (''). */
export function refundToDefault(wallet: { refundToCreditDefault: boolean } | null | undefined): RefundTo | '' {
  if (!wallet) return '';
  return wallet.refundToCreditDefault ? 'STORE_CREDIT' : 'CASH_OR_KHATA';
}

/** What `issue` carries: `{ refundTo }` only when asked AND chosen; otherwise nothing (the old body). */
export function refundToBody(i: { walletOn: boolean; type: string; partyId?: string | null; refundTo?: RefundTo | '' | null }): { refundTo?: RefundTo } {
  return asksRefundTo(i) && i.refundTo ? { refundTo: i.refundTo } : {};
}
// <<< MP1-COMPLETE
