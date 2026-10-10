import React from 'react';
import { BookingStatus } from '../booking.types';
import { useTranslation } from 'react-i18next';

import { STATUS_LABEL_KEYS, STATUS_TONE, StatusTone } from '../format';
import { StatusBadge as KitBadge } from '../../../components/ui/StatusBadge';
import type { StatusTone as DsTone } from '../../../theme/tokens';

/**
 * Booking status pill. D0: drawn by the shared kit badge on the DS v1 status
 * pairs, so it now has a real dark-mode version (it used fixed light pills on
 * every background). Same labels, same tone per status.
 */
const TONE: Record<StatusTone, DsTone> = {
  attention: 'warn',
  active: 'brand',
  success: 'success',
  neutral: 'neutral',
  danger: 'danger',
};

export function StatusBadge({ status }: { status: BookingStatus }) {
  const { t } = useTranslation();
  return <KitBadge label={t(STATUS_LABEL_KEYS[status])} tone={TONE[STATUS_TONE[status]]} />;
}
