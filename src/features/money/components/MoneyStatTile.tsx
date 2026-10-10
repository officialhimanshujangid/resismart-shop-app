import React from 'react';

import type { ColorScheme } from '../../../constants/colors';
import { formatPaise } from '../../../lib/money';
import { useCountUp } from '../../../theme/motion';
import { StatTile } from '../../p1/ui';

/**
 * M21 — a money StatTile whose figure counts up once (DS §5 "count-up
 * balances"; JS rAF, ~0.9 s ease-out). Under reduce-motion — and in tests,
 * which run with it on — the exact amount shows at once. The final frame is
 * always the exact paise figure.
 */
export function MoneyStatTile({
  c, label, paise, tone, testID,
}: {
  c: ColorScheme;
  label: string;
  paise: number;
  tone?: string;
  testID?: string;
}) {
  const shown = useCountUp(paise);
  return <StatTile c={c} label={label} value={formatPaise(Math.round(shown))} tone={tone} testID={testID} />;
}
