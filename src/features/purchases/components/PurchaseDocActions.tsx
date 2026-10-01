import React from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { ColorScheme } from '../../../constants/colors';
import type { PartnerDocumentRecord } from '../../billing/types';
import { ActionRow, PillButton } from '../../p1/ui';

/**
 * The P1 next step on a purchase document's own page (screens S4–S6):
 *  - an issued purchase order still open → Receive goods (the GRN);
 *  - a goods-received note not yet on a bill → Make the supplier bill;
 *  - an issued purchase bill → Return goods (a debit note).
 * Nothing for anyone without PURCHASES_MANAGE, or for any other document.
 */
export function PurchaseDocActions({
  c, doc, canManage, busy,
}: { c: ColorScheme; doc: PartnerDocumentRecord; canManage: boolean; busy: boolean }) {
  const { t } = useTranslation();
  if (!canManage) return null;
  const live = doc.status !== 'DRAFT' && doc.status !== 'CANCELLED';
  const poOpen = doc.type === 'PURCHASE_ORDER' && live && doc.status !== 'CONVERTED'
    && (doc.fulfilment === undefined || doc.fulfilment === 'OPEN' || doc.fulfilment === 'PARTIAL');
  const grnUnbilled = doc.type === 'GOODS_RECEIPT' && live && !doc.billedById;
  const billLive = doc.type === 'PURCHASE_INVOICE' && live;
  if (!poOpen && !grnUnbilled && !billLive) return null;

  return (
    <View style={{ marginTop: 8 }}>
      <ActionRow>
        {poOpen && (
          <PillButton
            c={c}
            icon="truck-check-outline"
            label={t('purchases.receive.action')}
            disabled={busy}
            onPress={() => router.push({ pathname: '/purchases/receive/[poId]', params: { poId: doc._id } })}
            testID="doc-receive"
          />
        )}
        {grnUnbilled && (
          <PillButton
            c={c}
            icon="file-document-multiple-outline"
            label={t('purchases.receive.billNow')}
            disabled={busy}
            onPress={() => router.push({ pathname: '/purchases/bill-from-grns', params: { grnId: doc._id, ...(doc.partyId ? { partyId: doc.partyId } : {}) } })}
            testID="doc-bill-grn"
          />
        )}
        {billLive && (
          <PillButton
            c={c}
            tone="outline"
            icon="keyboard-return"
            label={t('purchases.return.action')}
            disabled={busy}
            onPress={() => router.push({ pathname: '/purchases/return/[billId]', params: { billId: doc._id } })}
            testID="doc-return"
          />
        )}
      </ActionRow>
    </View>
  );
}
