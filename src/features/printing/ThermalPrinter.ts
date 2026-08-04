/**
 * The seam between "print this bill" and however it actually gets onto
 * paper — spec §4's printer question, kept behind one interface so the
 * screen that calls `print()` never has to know which implementation is
 * behind it.
 *
 * TWO IMPLEMENTATIONS EXIST TODAY. A THIRD DOES NOT, ON PURPOSE.
 * -----------------------------------------------------------------
 *   - `pdfPrinter` (`pdfPrinter.ts`) — WORKS RIGHT NOW, in Expo Go, on both
 *     platforms. Downloads the server's PDF and hands it to the OS print
 *     dialog (`expo-print`), which reaches AirPrint on iOS and Android's
 *     print framework — including a thermal printer that ships its own
 *     Android print-service app, which most 58/80mm receipt printers sold in
 *     India do.
 *   - A direct Bluetooth-serial ESC/POS sender does NOT exist, and this file
 *     is where that decision is recorded rather than silently dropped.
 *     Bluetooth serial (SPP) has no Expo Go / managed-workflow API — it needs
 *     a native module (e.g. `react-native-bluetooth-escpos-printer` or
 *     `tp-react-native-blue-printer`) plus its own permission wiring and,
 *     because it is a native module, a **development build**, not Expo Go.
 *     Installing one and leaving it unwired — the app "detects" a printer
 *     screen that has never been exercised against a real device — is worse
 *     than not having the screen at all: a button that silently never prints
 *     reads as "this app is broken" at the exact moment a shop owner is
 *     standing at the counter. See `ownerDecisionsNeeded` for the concrete
 *     choice (which package, the config plugin, the dev-client commitment)
 *     this needs from the owner before it can be built for real.
 *
 * `buildEscPosReceipt()` in `escpos.ts` is written and ready regardless — it
 * is pure byte formatting with no transport opinion, so the day a Bluetooth
 * adapter is added it has zero new logic to write, only a `write(bytes)` call
 * to wire up.
 */

export type ThermalPrinterKind = 'SYSTEM_PRINT' | 'BLUETOOTH_ESCPOS';

export interface PrintJob {
  documentId: string;
  /** Used as the shared file name and the print-dialog job name — e.g. "INV-2026-27-0042". */
  label: string;
}

export interface ThermalPrinter {
  readonly kind: ThermalPrinterKind;
  /** Shown on the print button so the partner knows what tapping it does — never a silent no-op. */
  readonly label: string;
  isAvailable(): Promise<boolean>;
  print(job: PrintJob): Promise<void>;
}
