import React from 'react';

import { P2Gate } from '../../../src/features/p2/ui';

/** Jobs (P2): BOOKINGS + INVOICING on, the JOBS module effective, and at least BOOKINGS_VIEW READ. */
export default function JobsLayout() {
  return <P2Gate module="JOBS" base={['BOOKINGS', 'INVOICING']} anyOf={[['BOOKINGS_VIEW', 'READ']]} />;
}
