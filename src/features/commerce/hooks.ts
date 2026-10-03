import { useMutation, useQuery, useQueryClient, type QueryKey } from '@tanstack/react-query';

import { qk } from '../../lib/queryKeys';
import { commerceApi } from './api';
import type {
  AdjustBody, BroadcastInput, BroadcastSegment, CommerceSettingsPatch, DeadStockRow, HoldInput, InsightsHeatmap,
  InsightsOverview, InsightsQuery, OfferInput, OfferStatus, StaffSalesRow, TopCustomer, TopUpBody, VariantInput,
  WalletBucket,
} from './types';
import { cleanSegment, segmentKey } from './logic';

/**
 * React-query hooks for the commerce screens. `enabled` is always the
 * permission answer from `useCommerceAccess()`: a person who may not look is
 * never sent to a 403.
 */

function useInvalidate() {
  const client = useQueryClient();
  return (...keys: QueryKey[]) => { for (const queryKey of keys) void client.invalidateQueries({ queryKey }); };
}

// ─────────────────────────────────────────── settings

export function useCommerceSettings(enabled: boolean) {
  return useQuery({ queryKey: qk.commerce.settings(), queryFn: commerceApi.settings.get, enabled, staleTime: 60_000 });
}

export function useSaveCommerceSettings() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (v: { patch: CommerceSettingsPatch; key: string }) => commerceApi.settings.put(v.patch, v.key),
    // A switch changes menus (entitlements carry `commerceFeatures`) and every commerce screen.
    onSuccess: () => invalidate(qk.commerce.all(), qk.entitlements()),
  });
}

// ─────────────────────────────────────────── offers

export function useOffers(filters: { status?: OfferStatus; kind?: string; q?: string; page?: number }, enabled: boolean) {
  return useQuery({
    queryKey: qk.commerce.offers(filters),
    queryFn: () => commerceApi.offers.list({ ...filters, limit: 50 }),
    enabled,
  });
}

export function useOffer(id: string | undefined, enabled = true) {
  return useQuery({ queryKey: qk.commerce.offer(id ?? ''), queryFn: () => commerceApi.offers.get(id!), enabled: enabled && !!id });
}

export function useOfferRedemptions(id: string, page: number, enabled: boolean) {
  return useQuery({
    queryKey: qk.commerce.redemptions(id, page),
    queryFn: () => commerceApi.offers.redemptions(id, page),
    enabled: enabled && !!id,
  });
}

export function useSaveOffer() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (v: { id?: string; body: OfferInput; key: string }) => {
      if (v.id) {
        const { kind: _kind, ...rest } = v.body;
        return commerceApi.offers.update(v.id, rest);
      }
      return commerceApi.offers.create(v.body, v.key);
    },
    onSuccess: () => invalidate(['commerce', 'offers'], ['commerce', 'offer']),
  });
}

export function useOfferStatus() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (v: { id: string; status: OfferStatus }) => commerceApi.offers.setStatus(v.id, v.status),
    onSuccess: () => invalidate(['commerce', 'offers'], ['commerce', 'offer']),
  });
}

// ─────────────────────────────────────────── wallet

export function useWallets(filters: { q?: string; hasCredit?: 'true'; hasPoints?: 'true'; page?: number }, enabled: boolean) {
  return useQuery({
    queryKey: qk.commerce.wallets(filters),
    queryFn: () => commerceApi.wallet.list({ ...filters, limit: 50 }),
    enabled,
  });
}

export function useWallet(partyId: string | undefined, enabled = true) {
  return useQuery({
    queryKey: qk.commerce.wallet(partyId ?? ''),
    queryFn: () => commerceApi.wallet.get(partyId!),
    enabled: enabled && !!partyId,
  });
}

export function useWalletStatement(partyId: string, bucket: WalletBucket | 'ALL', page: number, enabled: boolean) {
  return useQuery({
    queryKey: qk.commerce.statement(partyId, bucket, page),
    queryFn: () => commerceApi.wallet.statement(partyId, { ...(bucket !== 'ALL' ? { bucket } : {}), page, limit: 50 }),
    enabled: enabled && !!partyId,
  });
}

/** Every wallet write refreshes the wallet, the lists, and the money books it may touch. */
function useWalletWrite<V>(fn: (v: V) => Promise<unknown>) {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => invalidate(['commerce', 'wallet'], ['commerce', 'wallets'], qk.billing.all(), qk.payments.all(), qk.money.all(), qk.parties.all()),
  });
}

export const useWalletAdjust = (partyId: string) =>
  useWalletWrite((v: { body: AdjustBody; key: string }) => commerceApi.wallet.adjust(partyId, v.body, v.key));
export function useWalletTopUp(partyId: string) {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (v: { body: TopUpBody; key: string }) => commerceApi.wallet.topUp(partyId, v.body, v.key),
    onSuccess: () => invalidate(['commerce', 'wallet'], ['commerce', 'wallets'], qk.billing.all(), qk.payments.all(), qk.money.all(), qk.parties.all()),
  });
}
export function useWalletRefund(partyId: string) {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (v: { body: TopUpBody; key: string }) => commerceApi.wallet.refund(partyId, v.body, v.key),
    onSuccess: () => invalidate(['commerce', 'wallet'], ['commerce', 'wallets'], qk.billing.all(), qk.payments.all(), qk.money.all(), qk.parties.all()),
  });
}
// >>> GAP-C-SHOP — make the customer's referral code from the shop side (the same code every time after).
export function useWalletReferralCode(partyId: string) {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: () => commerceApi.wallet.referralCode(partyId),
    onSuccess: () => invalidate(['commerce', 'wallet'], ['commerce', 'wallets']),
  });
}
// <<< GAP-C-SHOP
export const useWalletPayBill = (partyId: string) =>
  useWalletWrite((v: { documentId: string; amountPaise: number; key: string }) =>
    commerceApi.wallet.payBill(partyId, { documentId: v.documentId, amountPaise: v.amountPaise }, v.key));

// ─────────────────────────────────────────── broadcasts

export function useBroadcasts(enabled: boolean, status?: string) {
  return useQuery({
    queryKey: qk.commerce.broadcasts(status),
    queryFn: () => commerceApi.broadcasts.list({ ...(status ? { status } : {}), limit: 50 }),
    enabled,
  });
}

/** Live audience count for a segment (counts only). The caller debounces the segment. */
export function useAudience(segment: BroadcastSegment, enabled: boolean) {
  return useQuery({
    queryKey: qk.commerce.audience(segmentKey(segment)),
    queryFn: () => commerceApi.broadcasts.audience(cleanSegment(segment)),
    enabled,
    staleTime: 30_000,
  });
}

export function useSaveBroadcast() {
  const invalidate = useInvalidate();
  return useMutation({
    // GAP-C-SHOP: `clearSchedule` on an edit sends `scheduledAt: null` (the stored time goes; a SCHEDULED one is a DRAFT again).
    mutationFn: (v: { id?: string; body: BroadcastInput; key: string; clearSchedule?: boolean }) =>
      (v.id
        ? commerceApi.broadcasts.update(v.id, v.clearSchedule ? { ...v.body, scheduledAt: null } : v.body)
        : commerceApi.broadcasts.create(v.body, v.key)),
    onSuccess: () => invalidate(['commerce', 'broadcasts']),
  });
}

// >>> GAP-C-SHOP — "Remove schedule": PUT `{ scheduledAt: null }` → the message is a DRAFT again, nothing sent.
export function useUnscheduleBroadcast() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (broadcastId: string) => commerceApi.broadcasts.update(broadcastId, { scheduledAt: null }),
    onSettled: () => invalidate(['commerce', 'broadcasts']),
  });
}
// <<< GAP-C-SHOP

export function useSendBroadcast() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (v: { id: string; key: string }) => commerceApi.broadcasts.send(v.id, v.key),
    onSettled: () => invalidate(['commerce', 'broadcasts']),
  });
}

export function useCancelBroadcast() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (id: string) => commerceApi.broadcasts.cancel(id),
    onSettled: () => invalidate(['commerce', 'broadcasts']),
  });
}

// ─────────────────────────────────────────── insights

interface InsightData {
  overview: InsightsOverview;
  heatmap: InsightsHeatmap;
  topCustomers: TopCustomer[];
  staffSales: StaffSalesRow[];
  deadStock: DeadStockRow[];
}

export function useInsight<P extends keyof InsightData>(part: P, q: InsightsQuery, enabled: boolean) {
  return useQuery<InsightData[P]>({
    queryKey: qk.commerce.insights(part, q as Record<string, string | number | undefined>),
    queryFn: () => (commerceApi.insights[part] as (q: InsightsQuery) => Promise<InsightData[P]>)(q),
    enabled,
    staleTime: 60_000,
  });
}

export function useStockAlertDemand(enabled: boolean) {
  return useQuery({ queryKey: qk.commerce.insights('stockAlerts'), queryFn: commerceApi.insights.stockAlerts, enabled, staleTime: 60_000 });
}

// ─────────────────────────────────────────── counter

export function useHolds(enabled: boolean) {
  return useQuery({ queryKey: qk.commerce.holds(), queryFn: commerceApi.counter.holds, enabled });
}

export function useHoldBill() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (v: { body: HoldInput; key: string }) => commerceApi.counter.hold(v.body, v.key),
    onSuccess: () => invalidate(qk.commerce.holds()),
  });
}

export function useResumeHold() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (id: string) => commerceApi.counter.resume(id),
    onSettled: () => invalidate(qk.commerce.holds()),
  });
}

export function useDiscardHold() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (id: string) => commerceApi.counter.discard(id),
    onSettled: () => invalidate(qk.commerce.holds()),
  });
}

export function useQuickKeys(enabled: boolean) {
  return useQuery({ queryKey: qk.commerce.quickKeys(), queryFn: commerceApi.counter.quickKeys, enabled, staleTime: 5 * 60_000 });
}

export function useSetQuickKeys() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (productIds: string[]) => commerceApi.counter.setQuickKeys(productIds),
    // Setting keys IS switching QUICK_KEYS on (or off, with none) — menus follow.
    onSuccess: () => invalidate(qk.commerce.quickKeys(), qk.commerce.settings(), qk.entitlements()),
  });
}

// ─────────────────────────────────────────── variants

export function useVariants(productId: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: qk.commerce.variants(productId ?? ''),
    queryFn: () => commerceApi.variants.list(productId!),
    enabled: enabled && !!productId,
  });
}

export function useSaveVariant(productId: string) {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async (v: { variantId?: string; body: VariantInput; key: string }): Promise<unknown> => {
      if (v.variantId) {
        const { stockQty: _s, ...rest } = v.body;
        return commerceApi.variants.update(productId, v.variantId, rest);
      }
      return commerceApi.variants.create(productId, v.body, v.key);
    },
    onSuccess: () => invalidate(qk.catalog.all()),
  });
}
