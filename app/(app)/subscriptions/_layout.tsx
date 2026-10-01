import React from 'react';

import { P2Gate } from '../../../src/features/p2/ui';

/**
 * Subscriptions + tuition (P2): INVOICING on, the SUBSCRIPTIONS module
 * effective, and the person holding any one of view / mark deliveries / mark
 * attendance. Each screen hides what the person may not do; the server decides again.
 */
export default function SubscriptionsLayout() {
  return (
    <P2Gate
      module="SUBSCRIPTIONS"
      base={['INVOICING']}
      anyOf={[['SUBSCRIPTIONS_VIEW', 'READ'], ['DELIVERIES_MARK', 'FULL'], ['ATTENDANCE_MARK', 'FULL']]}
    />
  );
}
