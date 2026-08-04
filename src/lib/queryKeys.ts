/**
 * Every react-query key in the app, in one place.
 *
 * Keys are written as functions returning `as const` arrays so a mutation can
 * invalidate a whole branch (`qk.bookings.all`) without knowing how the leaves
 * are shaped. Screens must NOT type their own array literals inline: two files
 * that spell the same key slightly differently are two caches, and the symptom
 * is a list that does not update after the mutation that changed it — a bug that
 * looks like a backend problem and is not.
 *
 * The cache is cleared on every sign-in and context switch (`resetQueryCache`),
 * so keys deliberately do NOT carry a partner id. Adding one would suggest two
 * partners' data may coexist in the cache, which is exactly what must not happen.
 */
export const qk = {
  /** The gate the whole app hangs off. */
  entitlements: () => ['entitlements'] as const,
  usage: () => ['usage'] as const,

  onboarding: {
    status: () => ['onboarding', 'status'] as const,
    categories: () => ['onboarding', 'categories'] as const,
  },

  partner: {
    me: () => ['partner', 'me'] as const,
    modules: () => ['partner', 'modules'] as const,
  },

  today: () => ['today'] as const,

  bookings: {
    all: () => ['bookings'] as const,
    list: (filters?: Record<string, string | number | undefined>) =>
      ['bookings', 'list', filters ?? {}] as const,
    detail: (id: string) => ['bookings', 'detail', id] as const,
  },

  orders: {
    all: () => ['orders'] as const,
    list: (filters?: Record<string, string | number | undefined>) =>
      ['orders', 'list', filters ?? {}] as const,
    detail: (id: string) => ['orders', 'detail', id] as const,
  },

  catalog: {
    all: () => ['catalog'] as const,
    services: (filters?: Record<string, string | number | undefined>) =>
      ['catalog', 'services', filters ?? {}] as const,
    products: (filters?: Record<string, string | number | undefined>) =>
      ['catalog', 'products', filters ?? {}] as const,
    product: (id: string) => ['catalog', 'products', 'detail', id] as const,
    categories: () => ['catalog', 'categories'] as const,
    byBarcode: (code: string) => ['catalog', 'barcode', code] as const,
  },

  billing: {
    all: () => ['billing'] as const,
    documents: (filters?: Record<string, string | number | undefined>) =>
      ['billing', 'documents', filters ?? {}] as const,
    document: (id: string) => ['billing', 'document', id] as const,
    settings: () => ['billing', 'settings'] as const,
  },

  parties: {
    all: () => ['parties'] as const,
    list: (search?: string) => ['parties', 'list', search ?? ''] as const,
    detail: (id: string) => ['parties', 'detail', id] as const,
  },

  reports: (range: string) => ['reports', range] as const,
  staff: () => ['staff'] as const,
  promotion: () => ['promotion'] as const,
  notifications: () => ['notifications'] as const,

  // Added by the More-tab agent (parties/staff/reports/promotion/settings).
  // Kept as new siblings rather than folding into `staff()`/`promotion()`
  // above: those two keys are already read by `src/features/bookings/hooks.ts`
  // and `useLiveEvents.ts` and must keep meaning exactly what they mean today.
  // React Query's default invalidation is a PREFIX match, so invalidating
  // `staff()` (`['staff']`) or `promotion()` (`['promotion']`) still catches
  // `staffRoles()`/`promotionBoosts()` below without either file changing.
  // NOT `staff()` itself — that key already belongs to
  // `features/bookings/hooks.ts`'s `useAssignableStaff` (a differently-shaped,
  // booking-specific projection). This is a sibling so a mutation here can
  // still invalidate both with one `invalidateQueries({ queryKey: qk.staff() })`
  // call, via the same prefix-match rule noted above.
  staffList: () => ['staff', 'list'] as const,
  staffRoles: () => ['staff', 'roles'] as const,
  promotionBoosts: () => ['promotion', 'boosts'] as const,
  businessSettings: () => ['settings', 'business'] as const,
  whatsappSettings: () => ['settings', 'whatsapp'] as const,
} as const;
