/**
 * One tap of a quantity stepper on a bill line.
 *
 * The minus button never takes a line below 1. It used to step to 0 and drop
 * the line — one tap too many at a busy counter deleted an item with no undo.
 * Removing a line is the bin button's job. A quantity typed below 1 in the
 * line editor (0.5 kg) is left alone by minus rather than jumped up to 1.
 *
 * Two decimals, because quantities like 1.25 kg are real and float steps drift.
 */
export const MIN_STEPPER_QTY = 1;

export function stepQty(qty: number, delta: number): number {
  const next = Math.round((qty + delta) * 100) / 100;
  if (delta < 0 && next < MIN_STEPPER_QTY) return qty;
  return next;
}

/** Whether minus can do anything for this quantity. */
export const canStepDown = (qty: number): boolean => qty - 1 >= MIN_STEPPER_QTY;
