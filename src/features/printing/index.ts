export type { ThermalPrinter, ThermalPrinterKind, PrintJob } from './ThermalPrinter';
export { buildEscPosReceipt } from './escpos';
export type { EscPosReceiptModel, EscPosLineItem } from './escpos';
export { pdfPrinter } from './pdfPrinter';

import { pdfPrinter } from './pdfPrinter';
import { ThermalPrinter } from './ThermalPrinter';

/**
 * The printer this build hands to a screen. Always the PDF fallback today —
 * see `ThermalPrinter.ts` for why there is no second, Bluetooth, option to
 * choose between yet. A screen should call this rather than importing
 * `pdfPrinter` directly, so the day a real ESC/POS adapter lands, picking
 * between them (a paired-device check, a settings toggle) happens in this one
 * function and every caller stays unchanged.
 */
export function getThermalPrinter(): ThermalPrinter {
  return pdfPrinter;
}
