import { useSyncExternalStore } from 'react';
import { onlineManager } from '@tanstack/react-query';

/**
 * Whether the phone is on the network, as REACT QUERY understands it.
 *
 * Deliberately read off `onlineManager` rather than opening a second NetInfo
 * subscription. The flag has to be the same one the cache is acting on: when it
 * says offline, react-query is holding queries rather than running them (see
 * `lib/queryClient.ts`), so a screen that showed a spinner while a separately
 * measured flag said "online" would be explaining the wrong thing. There is
 * exactly one NetInfo listener behind this, installed there.
 *
 * `features/billing/draftStore.ts` keeps its own — it is a sync engine with a
 * lifetime of its own and no dependency on the cache — but nothing in the UI
 * should add a third.
 */
const subscribe = (onStoreChange: () => void) => onlineManager.subscribe(onStoreChange);
const getSnapshot = () => onlineManager.isOnline();

export function useIsOnline(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot);
}
