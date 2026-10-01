import React from 'react';

import { P2Gate } from '../../../src/features/p2/ui';

/** APPOINTMENTS (P2): BOOKINGS on, the business-type module effective, BOOKINGS_VIEW held. */
export default function AppointmentsLayout() {
  return <P2Gate module="APPOINTMENTS" base={['BOOKINGS']} anyOf={[['BOOKINGS_VIEW', 'READ']]} />;
}
