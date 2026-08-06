export { useOrders, useOrder, useOrderTransition, useOrderReturnItems } from './hooks';
export type { OrderReturnInput } from './hooks';
export { ordersApi, filterKnownVerbs, verbNeedsReason, KNOWN_ORDER_VERBS } from './api';
export type { KnownOrderVerb, OrderListPage, OrderReturnLine, OrderReturnPayload, OrderReturnResult } from './api';
export { ORDER_STATUSES, ORDER_STATUS_LABELS, ORDER_VERB_LABELS } from './backend-mirror';
export type { PartnerOrder, OrderListFilters, OrderStatus, OrderVerb } from './types';
export { useOrderReturnEligibility, hasReturnableItems, remainingQty } from './returnEligibility';
export type { OrderReturnEligibility } from './returnEligibility';

export { OrderCard } from './components/OrderCard';
export { OrderDetailModal } from './components/OrderDetailModal';
export { ReasonPromptModal } from './components/ReasonPromptModal';
export type { ReasonPromptTarget } from './components/ReasonPromptModal';
export { OrderStatusChip } from './components/OrderStatusChip';
export { RecordReturnModal } from './components/RecordReturnModal';
