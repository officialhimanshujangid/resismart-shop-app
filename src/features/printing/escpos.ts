/**
 * Pure ESC/POS byte formatting for a receipt-style print of a bill.
 *
 * "Worth having regardless" (spec §4): nothing in this build sends these
 * bytes to a Bluetooth socket yet — see `ThermalPrinter.ts` for exactly why —
 * but the formatting itself needs no transport and no native module, so it is
 * written and tested against the command set now. The day a Bluetooth
 * adapter exists, it calls `buildEscPosReceipt()` and writes the result; none
 * of the layout logic below has to change.
 *
 * Commands are the standard ESC/POS set shared by the Epson-compatible
 * controllers almost every 58/80mm receipt printer sold in India implements.
 * Text is encoded as UTF-8 bytes via `TextEncoder`. That is a real
 * limitation, named rather than hidden: most ESC/POS controllers default to
 * a single-byte code page (commonly CP437 or PC850) and will print any byte
 * above 0x7F as whatever glyph that code page maps it to, not as UTF-8 — a
 * ₹ sign or a name with a diacritic can print as mojibake on hardware that
 * has not been told to switch code pages first (`ESC t n`). Getting that
 * right needs the specific printer model's supported code-page table, which
 * is not knowable in the abstract; ASCII content (numbers, plain English/
 * transliterated names) prints correctly on every ESC/POS device with no
 * further work.
 */

const ESC = 0x1b;
const GS = 0x1d;

const CMD = {
  INIT: [ESC, 0x40],
  ALIGN_LEFT: [ESC, 0x61, 0x00],
  ALIGN_CENTER: [ESC, 0x61, 0x01],
  BOLD_ON: [ESC, 0x45, 0x01],
  BOLD_OFF: [ESC, 0x45, 0x00],
  DOUBLE_ON: [GS, 0x21, 0x11],
  DOUBLE_OFF: [GS, 0x21, 0x00],
  FEED_LINE: [0x0a],
  /** Partial cut, leaving a tab — the common default so a torn strip does not need a full-cut mechanism. */
  CUT_PARTIAL: [GS, 0x56, 0x42, 0x00],
} as const;

export interface EscPosLineItem {
  name: string;
  /** Pre-formatted, e.g. "2 x ₹45.00". Money is formatted by `formatPaise` before it reaches here — this file has no opinion on currency. */
  qtyAndRate: string;
  /** Pre-formatted line total, e.g. "₹90.00". */
  amount: string;
}

export interface EscPosReceiptModel {
  businessName: string;
  businessAddress?: string;
  gstin?: string;
  /** e.g. "Tax Invoice". */
  documentLabel: string;
  /** e.g. "INV/2026-27/0042", or "DRAFT — not yet issued" for a preview print. */
  number: string;
  /** Already formatted for display, e.g. "3 Aug 2026, 4:12 pm". */
  documentDateLabel: string;
  partyName: string;
  partyPhone?: string;
  items: EscPosLineItem[];
  subtotalLabel: string;
  taxLabel: string;
  grandTotalLabel: string;
  footerNote?: string;
  /** Characters per line at normal font — 32 for 58mm paper, 48 for 80mm. */
  columns: 32 | 48;
}

class ByteWriter {
  private chunks: number[][] = [];

  cmd(bytes: readonly number[]): this {
    this.chunks.push([...bytes]);
    return this;
  }

  text(s: string): this {
    this.chunks.push(Array.from(new TextEncoder().encode(s)));
    return this;
  }

  line(s = ''): this {
    return this.text(s).cmd(CMD.FEED_LINE);
  }

  toBytes(): Uint8Array {
    const total = this.chunks.reduce((n, c) => n + c.length, 0);
    const out = new Uint8Array(total);
    let offset = 0;
    for (const chunk of this.chunks) {
      out.set(chunk, offset);
      offset += chunk.length;
    }
    return out;
  }
}

/** A single divider line filling the paper width — used above/below totals. */
function rule(columns: number): string {
  return '-'.repeat(columns);
}

/**
 * Left text and right text on one line, padded to fill `columns` — the
 * standard receipt two-column layout ("Subtotal ......... ₹123.00"). Text
 * that would overflow is truncated with a mid-line ellipsis on the LEFT
 * field, never the right — a garbled item name is a legibility problem, a
 * truncated amount is a legal one.
 */
function twoColumn(left: string, right: string, columns: number): string {
  const maxLeft = Math.max(1, columns - right.length - 1);
  const clippedLeft = left.length > maxLeft ? `${left.slice(0, Math.max(0, maxLeft - 1))}…` : left;
  const gap = Math.max(1, columns - clippedLeft.length - right.length);
  return clippedLeft + ' '.repeat(gap) + right;
}

export function buildEscPosReceipt(model: EscPosReceiptModel): Uint8Array {
  const { columns } = model;
  const w = new ByteWriter();

  w.cmd(CMD.INIT).cmd(CMD.ALIGN_CENTER).cmd(CMD.BOLD_ON).cmd(CMD.DOUBLE_ON);
  w.line(model.businessName);
  w.cmd(CMD.DOUBLE_OFF).cmd(CMD.BOLD_OFF);
  if (model.businessAddress) w.line(model.businessAddress);
  if (model.gstin) w.line(`GSTIN: ${model.gstin}`);

  w.line();
  w.cmd(CMD.BOLD_ON).line(model.documentLabel).cmd(CMD.BOLD_OFF);
  w.line(model.number);
  w.line(model.documentDateLabel);

  w.cmd(CMD.ALIGN_LEFT);
  w.line(rule(columns));
  w.line(`To: ${model.partyName}`);
  if (model.partyPhone) w.line(model.partyPhone);
  w.line(rule(columns));

  for (const item of model.items) {
    w.line(item.name);
    w.line(twoColumn(item.qtyAndRate, item.amount, columns));
  }

  w.line(rule(columns));
  w.line(twoColumn('Subtotal', model.subtotalLabel, columns));
  w.line(twoColumn('Tax', model.taxLabel, columns));
  w.cmd(CMD.BOLD_ON);
  w.line(twoColumn('TOTAL', model.grandTotalLabel, columns));
  w.cmd(CMD.BOLD_OFF);
  w.line(rule(columns));

  if (model.footerNote) {
    w.cmd(CMD.ALIGN_CENTER);
    w.line(model.footerNote);
  }

  w.line().line();
  w.cmd(CMD.CUT_PARTIAL);
  return w.toBytes();
}
