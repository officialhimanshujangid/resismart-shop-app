import React from 'react';

import { P2Gate } from '../../../src/features/p2/ui';

/** Pharmacy (P2): CATALOG on, PHARMACY effective, and batches or the register readable. */
export default function PharmacyLayout() {
  return (
    <P2Gate
      module="PHARMACY"
      base={['CATALOG']}
      anyOf={[['PHARMACY_VIEW', 'READ'], ['RX_REGISTER', 'READ']]}
    />
  );
}
