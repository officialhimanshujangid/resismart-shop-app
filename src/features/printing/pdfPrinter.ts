import * as Print from 'expo-print';
import { downloadDocumentPdf } from '../billing/pdf';
import { PrintJob, ThermalPrinter } from './ThermalPrinter';

/**
 * The WORKING fallback (spec §4): print the server's PDF through the OS print
 * dialog. `expo-print` needs no config plugin and no dev build — it is a
 * managed-workflow, Expo-Go-compatible module, confirmed against
 * `node_modules/expo-print/build/Print.d.ts` (SDK 54.0.35's actual API, not
 * assumed from memory — see `mobile-shop/AGENTS.md`).
 *
 * `Print.printAsync({ uri })` opens the native print sheet with the PDF
 * loaded. On iOS that is AirPrint; on Android it is the system Print
 * framework, which is also where a thermal printer's own Android
 * print-service app registers itself — so on a shop's phone that already has
 * their printer's app installed, this genuinely reaches the hardware, not
 * just "prints to a PDF app". Where no printer is registered, the same
 * dialog's own "Save as PDF" is a real result too, not a dead end.
 */
export const pdfPrinter: ThermalPrinter = {
  kind: 'SYSTEM_PRINT',
  label: 'Print',

  // Always true: `expo-print` has no availability gate to check up front —
  // unlike a Bluetooth adapter, there is no "device not paired" state, only
  // the print dialog opening with or without a printer already registered.
  async isAvailable(): Promise<boolean> {
    return true;
  },

  async print({ documentId, label }: PrintJob): Promise<void> {
    const uri = await downloadDocumentPdf(documentId, label);
    await Print.printAsync({ uri });
  },
};
