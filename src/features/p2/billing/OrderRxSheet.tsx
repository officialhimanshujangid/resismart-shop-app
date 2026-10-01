import React, { useEffect, useState } from 'react';
import { useColorScheme } from 'react-native';
import { useTranslation } from 'react-i18next';

import { themeColors } from '../../../constants/colors';
import { Banner, PillButton } from '../../p1/ui';
import { Sheet } from '../ui';
import { RxDetailsForm, RxDetails } from '../../pharmacy/components/RxDetailsForm';
import { EMPTY_RX, rxBody, rxProblem } from '../../pharmacy/logic';
import type { DocumentRx } from '../../billing/types';

/**
 * P2 PHARMACY — accepting an order that has a Schedule H/H1 medicine
 * (`POST /orders/:id/accept` answered 409 RX_DETAILS_REQUIRED {itemName,
 * schedule}): the prescription is taken here and the accept is sent again with
 * it. One sheet, one button — the partner never leaves the order.
 */
export function OrderRxSheet({
  visible, orderCode, drug, refusal, submitting, onAccept, onDismiss,
}: {
  visible: boolean;
  orderCode: string;
  drug: { name: string; schedule: 'H' | 'H1' } | null;
  /** The server's sentence (already in the reader's language). */
  refusal?: string | null;
  submitting: boolean;
  onAccept: (rx: DocumentRx) => void;
  onDismiss: () => void;
}) {
  const { t } = useTranslation();
  const c = themeColors(useColorScheme() === 'dark');
  const [rx, setRx] = useState<RxDetails>(EMPTY_RX);
  const [problem, setProblem] = useState<string | null>(null);
  useEffect(() => { if (visible) { setRx(EMPTY_RX); setProblem(null); } }, [visible]);

  const accept = () => {
    const p = rxProblem(rx);
    if (p) { setProblem(t(p)); return; }
    onAccept(rxBody(rx));
  };

  return (
    <Sheet
      visible={visible}
      onDismiss={onDismiss}
      title={t('p2.billing.orderRxTitle', { code: orderCode })}
      testID="order-rx-sheet"
      footer={(
        <PillButton c={c} icon="check" label={submitting ? t('common.saving') : t('p2.billing.acceptWithRx')} onPress={accept} disabled={submitting} testID="order-rx-accept" />
      )}
    >
      {refusal ? <Banner c={c} tone="warn" body={refusal} /> : null}
      {problem ? <Banner c={c} tone="error" body={problem} /> : null}
      <RxDetailsForm c={c} value={rx} onChange={setRx} drugs={drug ? [drug] : []} testID="order-rx" />
    </Sheet>
  );
}
