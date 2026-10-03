// >>> SCANNER — the one barcode brain, in three IDENTICAL copies:
//   backend/src/utils/scan-core.ts · frontend/src/lib/scan-core.ts ·
//   mobile-shop/src/features/scanner/scanCore.ts
// No imports, no platform code, so the file can be copied byte for byte. Change
// one, change all three — the server's lookup, the web till and the phone till
// must agree on what "the same barcode" means, or a product saved on one is
// "not found" on the other.
//
// Three jobs:
//   1. NORMALISE  — one physical label → one string, however it was read
//                   (iOS strips the 0 off a UPC-A, Android reports 12 digits,
//                   a USB reader may send 13, add an AIM prefix, or a GS byte).
//   2. CLASSIFY   — what KIND of code is this? A retail barcode is a product
//                   lookup; a URL / UPI / ResiSmart pass is never a product;
//                   a read that fails its own check digit is a misread.
//   3. GATE       — the camera fires 10–30 times a second. One presentation of
//                   an item is ONE accepted scan, nothing is accepted while the
//                   previous lookup is in flight, and the same code needs a
//                   cooldown before it counts again.

// ------------------------------------------------------------------ symbology

export type Symbology =
  | 'ean13' | 'ean8' | 'upca' | 'upce'
  | 'code128' | 'code39' | 'code93' | 'codabar' | 'itf'
  | 'qr' | 'datamatrix' | 'pdf417' | 'aztec'
  | 'manual' | 'unknown';

const SYMBOLOGY_ALIASES: Record<string, Symbology> = {
  ean13: 'ean13', ean8: 'ean8', upca: 'upca', upce: 'upce',
  code128: 'code128', gs1128: 'code128',
  code39: 'code39', code39mod43: 'code39',
  code93: 'code93', codabar: 'codabar',
  itf: 'itf', itf14: 'itf', interleaved2of5: 'itf', i2of5: 'itf',
  qr: 'qr', qrcode: 'qr', microqr: 'qr',
  datamatrix: 'datamatrix', gs1datamatrix: 'datamatrix',
  pdf417: 'pdf417', micropdf417: 'pdf417',
  aztec: 'aztec',
  manual: 'manual',
};

/**
 * Every decoder spells the symbology differently: expo-camera `upc_a`,
 * BarcodeDetector `upc_a`, zxing `UPC_A`, raw AVFoundation `org.gs1.UPC-E`.
 * One lower-case, punctuation-free spelling for all of them.
 */
export function normaliseSymbology(type?: string | null): Symbology {
  if (!type) return 'unknown';
  const t = String(type).toLowerCase()
    .replace(/^(org\.gs1\.|org\.iso\.|org\.ansi\.|com\.intermec\.)/, '')
    .replace(/[^a-z0-9]/g, '');
  return SYMBOLOGY_ALIASES[t] ?? 'unknown';
}

const GTIN_SYMBOLOGIES: ReadonlySet<Symbology> = new Set<Symbology>(['ean13', 'ean8', 'upca', 'upce']);
const TWO_D_SYMBOLOGIES: ReadonlySet<Symbology> = new Set<Symbology>(['qr', 'datamatrix', 'pdf417', 'aztec']);

// --------------------------------------------------------------- check digits

/** GS1 mod-10 check digit, shared by EAN-8, UPC-A, EAN-13 and GTIN-14 (weights 3,1 from the right). */
export function gtinCheckDigitOk(digits: string): boolean {
  if (!/^\d{8}$|^\d{12,14}$/.test(digits)) return false;
  let sum = 0;
  for (let i = digits.length - 2, w = 3; i >= 0; i -= 1, w = w === 3 ? 1 : 3) {
    sum += Number(digits[i]) * w;
  }
  return (10 - (sum % 10)) % 10 === Number(digits[digits.length - 1]);
}

/** UPC-E (8 digits, number system 0/1) → the 12-digit UPC-A it abbreviates. */
export function expandUpcE(code: string): string | null {
  if (!/^[01]\d{7}$/.test(code)) return null;
  const ns = code[0];
  const d1 = code[1]; const d2 = code[2]; const d3 = code[3]; const d4 = code[4]; const d5 = code[5];
  const x = code[6];
  const c = code[7];
  switch (x) {
    case '0': case '1': case '2': return `${ns}${d1}${d2}${x}0000${d3}${d4}${d5}${c}`;
    case '3': return `${ns}${d1}${d2}${d3}00000${d4}${d5}${c}`;
    case '4': return `${ns}${d1}${d2}${d3}${d4}00000${d5}${c}`;
    default: return `${ns}${d1}${d2}${d3}${d4}${d5}0000${x}${c}`;
  }
}

/** The reverse, when the UPC-A can be abbreviated at all. Verified by round trip. */
export function compressUpcA(a: string): string | null {
  if (!/^[01]\d{11}$/.test(a)) return null;
  const ns = a[0]; const m = a.slice(1, 6); const p = a.slice(6, 11); const c = a[11];
  const candidates = [
    `${ns}${m[0]}${m[1]}${p[2]}${p[3]}${p[4]}${m[2]}${c}`,
    `${ns}${m[0]}${m[1]}${m[2]}${p[3]}${p[4]}3${c}`,
    `${ns}${m[0]}${m[1]}${m[2]}${m[3]}${p[4]}4${c}`,
    `${ns}${m}${p[4]}${c}`,
  ];
  for (const e of candidates) if (expandUpcE(e) === a) return e;
  return null;
}

/**
 * A GTIN in its ONE stored spelling, or `null` when the digits are not a valid
 * GTIN (wrong length or failed check digit).
 *
 *  - EAN-13 stays 13 digits.
 *  - UPC-A (12) → EAN-13 with a leading 0. iOS reports a UPC-A exactly like
 *    that minus the 0, Android reports 12 digits, a USB reader may send either.
 *  - UPC-E → expanded to its UPC-A → EAN-13 (the check digit is over the
 *    expanded form, so the 8 digits alone never validate as EAN-8).
 *  - GTIN-14 with indicator 0 is the same item as its GTIN-13 → 13 digits.
 *    Any other indicator (an outer case) stays 14 — a case is not a unit.
 *  - 8 digits with no symbology: EAN-8 if it checks, else a UPC-E if THAT checks.
 */
export function canonicalGtin(digits: string, sym: Symbology = 'unknown'): string | null {
  if (!/^\d+$/.test(digits)) return null;
  switch (digits.length) {
    case 8: {
      if (sym !== 'upce' && gtinCheckDigitOk(digits)) return digits;
      if (sym === 'ean8') return null;
      const a = expandUpcE(digits);
      return a && gtinCheckDigitOk(a) ? `0${a}` : null;
    }
    case 12: return gtinCheckDigitOk(digits) ? `0${digits}` : null;
    case 13: return gtinCheckDigitOk(digits) ? digits : null;
    case 14:
      if (!gtinCheckDigitOk(digits)) return null;
      return digits.startsWith('0') ? digits.slice(1) : digits;
    default: return null;
  }
}

// ------------------------------------------------------------------ cleaning

/** C0/C1 controls, zero-width characters and the BOM — never part of a printed code. */
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u001F\u007F-\u009F​-‍⁠﻿]/g;
/** AIM symbology identifier a reader may be configured to prefix: `]` + letter + modifier. */
const AIM_PREFIX = /^\][A-Za-z][0-9A-Za-z]/;
/** The AIM identifiers that mean "this is GS1 data" (GS1-128, GS1 DataBar, GS1 DataMatrix, GS1 QR). */
const GS1_AIM_PREFIX = /^\](C1|e0|e1|e2|d2|Q3)/;
/** GS1 application identifiers that commonly follow the GTIN (01) on a batch / expiry label. */
const GS1_FOLLOWING_AIS = /^(10|11|13|15|17|21|30|37)/;

export interface CleanedRead {
  /** Trimmed, controls and AIM prefix gone, case PRESERVED (a URL or pass is case-sensitive). */
  text: string;
  /** The read carried a GS1 marker (AIM `]C1`/`]d2`/…, a leading FNC1 or an embedded GS separator). */
  gs1: boolean;
}

export function cleanRead(raw: unknown): CleanedRead {
  let s = typeof raw === 'string' ? raw : raw === null || raw === undefined ? '' : String(raw);
  // Full-width digits (some Android IMEs / Bluetooth keyboards in Hindi layouts) → ASCII.
  if (typeof s.normalize === 'function') s = s.normalize('NFKC');
  s = s.trim();
  let gs1 = s.includes('\u001D');
  if (AIM_PREFIX.test(s)) {
    if (GS1_AIM_PREFIX.test(s)) gs1 = true;
    s = s.slice(3);
  }
  s = s.replace(CONTROL_CHARS, '').trim();
  // A typed / printed number with grouping ("8901 2345 67890", "890-1234-567890").
  if (/^[\d][\d\s-]*\d$/.test(s) && /[\s-]/.test(s)) s = s.replace(/[\s-]/g, '');
  else s = s.replace(/\s+/g, ' ');
  return { text: s, gs1 };
}

/** The GTIN inside a GS1 element string — `(01)…` typed, or `01…` with a GS1 marker. */
function gs1Gtin(text: string, gs1: boolean, sym: Symbology): string | null {
  const paren = /^\(01\)(\d{14})/.exec(text);
  if (paren) return canonicalGtin(paren[1]);
  const plain = /^01(\d{14})(.*)$/.exec(text);
  if (!plain) return null;
  const rest = plain[2];
  // Without an explicit marker, only a Code 128 / DataMatrix whose shape is
  // unmistakably GS1 (the GTIN alone, or followed by a batch/expiry AI) — a
  // shop's own Code 128 label that happens to start "01" must stay itself.
  const looksGs1 = gs1 || ((sym === 'code128' || sym === 'datamatrix') && (rest === '' || GS1_FOLLOWING_AIS.test(rest)));
  return looksGs1 ? canonicalGtin(plain[1]) : null;
}

/**
 * The ONE spelling a barcode is stored and compared in. Used by the server on
 * save and on lookup, and by both clients before they ask.
 * Never throws; a value it cannot improve on comes back cleaned and upper-cased.
 */
export function canonicalBarcode(raw: unknown, type?: string | null): string {
  const sym = normaliseSymbology(type);
  const { text, gs1 } = cleanRead(raw);
  if (!text) return '';
  const fromGs1 = gs1Gtin(text, gs1, sym);
  if (fromGs1) return fromGs1;
  if (/^\d+$/.test(text)) {
    const g = canonicalGtin(text, sym);
    if (g) return g;
  }
  return text.toUpperCase();
}

/**
 * Every spelling an EXISTING stored barcode could have for the same item — the
 * server looks up `{ barcode: { $in: barcodeLookupKeys(code) } }`, so rows saved
 * before this normaliser existed (a 12-digit UPC-A, a UPC-E, a GTIN-14) still
 * match without a data migration. The exact cleaned input is first, then the
 * canonical form, so a caller can prefer the closest match.
 */
export function barcodeLookupKeys(raw: unknown, type?: string | null): string[] {
  const keys: string[] = [];
  const add = (k: string | null | undefined) => { if (k && !keys.includes(k)) keys.push(k); };
  const cleaned = cleanRead(raw).text.toUpperCase();
  const canon = canonicalBarcode(raw, type);
  add(cleaned);
  add(canon);
  const gtins = [canon];
  // 8 digits are ambiguous (EAN-8 or UPC-E) — keep both readings in play.
  if (/^\d{8}$/.test(cleaned)) {
    const a = expandUpcE(cleaned);
    if (a && gtinCheckDigitOk(a)) gtins.push(`0${a}`);
  }
  for (const g of gtins) {
    if (!/^\d+$/.test(g)) continue;
    if (g.length === 13) {
      add(g);
      add(`0${g}`); // GTIN-14, indicator 0
      if (g.startsWith('0')) {
        const upcA = g.slice(1);
        add(upcA);
        add(compressUpcA(upcA));
      }
    } else if (g.length === 8 && gtinCheckDigitOk(g)) {
      add(g);
      add(`000000${g}`); // GTIN-14 of an EAN-8
    }
  }
  return keys;
}

/** Do two stored / scanned spellings name the same item? */
export function sameBarcode(a: unknown, b: unknown): boolean {
  const ca = canonicalBarcode(a);
  const cb = canonicalBarcode(b);
  if (!ca || !cb) return false;
  if (ca === cb) return true;
  return barcodeLookupKeys(a).includes(cb) || barcodeLookupKeys(b).includes(ca);
}

// ------------------------------------------------------------------ classify

export type ScanKind =
  /** A product code — look it up. `code` is canonical. */
  | 'product'
  /** A web link (http/https/www or any app link) — never a product. */
  | 'url'
  /** A UPI payment QR (`upi://pay…`) — never a product. */
  | 'upi'
  /** A ResiSmart gate / visitor pass (signed `body.signature`) — never a product. */
  | 'pass'
  /** A symbology this screen does not use for products (e.g. a DataMatrix batch code). */
  | 'unsupported'
  /** A retail barcode whose check digit fails — a misread, not a different product. */
  | 'invalid'
  | 'empty';

export interface ClassifiedScan {
  kind: ScanKind;
  /** Canonical for a product; the cleaned text otherwise. */
  code: string;
  /** Exactly as the decoder / keyboard delivered it. */
  raw: string;
  symbology: Symbology;
  /** A TYPED number that fails its own check digit — used anyway, but worth a second look. */
  checksumWarning?: boolean;
}

/** A ResiSmart signed pass: base64url(JSON) "." base64url(Ed25519 signature). */
const PASS_PAYLOAD = /^[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]{40,}$/;
const ANY_SCHEME_URL = /^[a-z][a-z0-9+.-]{1,30}:\/\//i;
const WEB_URL = /^(https?:\/\/|www\.)/i;
/** No real product label carries more than this; the server caps the field at 64. */
const MAX_PRODUCT_CODE = 48;

export interface ClassifyOptions {
  /** This screen treats a 2D code (QR, DataMatrix…) carrying plain text as a product code. Default false. */
  allowTwoD?: boolean;
  /**
   * This screen takes a carton's ITF-14 (receiving screens: catalogue, stock
   * count, stock in / purchase — NOT the billing counter). Only a full 14-digit
   * code with a valid GS1 check digit is ever accepted; a partial ITF read is
   * `invalid` either way. Default false → an ITF read is `unsupported`.
   */
  allowItf?: boolean;
}

/**
 * What KIND of code was read, and — for a product — its canonical spelling.
 * Content first (a URL is a URL whatever symbology carried it), then the
 * symbology's own rules.
 */
export function classifyScan(raw: unknown, type?: string | null, opts: ClassifyOptions = {}): ClassifiedScan {
  const symbology = normaliseSymbology(type);
  const rawText = typeof raw === 'string' ? raw : raw === null || raw === undefined ? '' : String(raw);
  const { text, gs1 } = cleanRead(rawText);
  const out = (kind: ScanKind, code: string, extra: Partial<ClassifiedScan> = {}): ClassifiedScan => ({
    kind, code, raw: rawText, symbology, ...extra,
  });

  if (!text) return out('empty', '');
  if (/^upi:/i.test(text)) return out('upi', text);
  if (WEB_URL.test(text) || ANY_SCHEME_URL.test(text)) return out('url', text);
  if (PASS_PAYLOAD.test(text)) return out('pass', text);

  // The GTIN family: the check digit decides, and the canonical form is the code.
  if (GTIN_SYMBOLOGIES.has(symbology)) {
    const g = canonicalGtin(text, symbology);
    return g ? out('product', g) : out('invalid', text);
  }

  // ITF has no length of its own: anything but a full, check-digit-valid
  // ITF-14 is a partial read (the classic "same carton, different number").
  // A valid one is a GTIN-14: indicator 0 is, by the GS1 standard, the same
  // item as its GTIN-13 (canonicalised to 13 digits); indicators 1–8 are an
  // outer case and stay their own 14-digit code.
  if (symbology === 'itf') {
    const g = /^\d{14}$/.test(text) ? canonicalGtin(text, symbology) : null;
    if (!g) return out('invalid', text);
    return opts.allowItf ? out('product', g) : out('unsupported', text);
  }

  // GS1-128 / GS1 DataMatrix carrying a GTIN: the GTIN IS the product (the
  // batch / expiry after it is this pack, not the item).
  const fromGs1 = gs1Gtin(text, gs1, symbology);
  if (fromGs1) return out('product', fromGs1);

  if (TWO_D_SYMBOLOGIES.has(symbology) && !opts.allowTwoD) return out('unsupported', text);

  if (/^\d+$/.test(text) && [8, 12, 13, 14].includes(text.length)) {
    const g = canonicalGtin(text, symbology);
    if (g) return out('product', g);
    // A typed number is never refused — the person is looking at the pack.
    if (symbology === 'manual') return out('product', text, { checksumWarning: true });
    // A keyboard-wedge read of a GTIN-length number that fails its check
    // digit is the beam clipping the label. A Code 128 / Code 39 label
    // carries its own check inside the symbol, so it is a shop's own code.
    if (symbology === 'unknown') return out('invalid', text);
  }

  if (symbology !== 'manual' && text.length > MAX_PRODUCT_CODE) return out('unsupported', text);
  return out('product', text.toUpperCase());
}

// ---------------------------------------------------------------------- gate

export type ScanSource = 'camera' | 'hid' | 'manual';

export type GateIgnoreReason =
  | 'paused' | 'empty' | 'busy' | 'held' | 'cooldown' | 'confirming' | 'misread';

export type GateDecision =
  | { action: 'accept'; scan: ClassifiedScan }
  /** Not a product (url / upi / pass / unsupported / invalid) — tell the person, ONCE per presentation. */
  | { action: 'reject'; scan: ClassifiedScan }
  | { action: 'ignore'; reason: GateIgnoreReason };

export interface ScanGateOptions {
  /** CAMERA: the same code is ignored this long after its lookup finished (2 s; the stock count uses 1 s). */
  cooldownMs?: number;
  /**
   * READER (USB / Bluetooth keyboard wedge): a trigger pull is always a
   * deliberate single scan, so there is NO same-code wait — only this tiny
   * guard against a reader double-sending one code.
   */
  readerRepeatMs?: number;
  /** Camera: the frame must be free of codes this long before ANY new code is taken ("the item was taken away"). */
  settleMs?: number;
  /** Camera: the same value must be decoded this many times… */
  confirmReads?: number;
  /** …within this window before it is believed (kills one-frame misreads). */
  confirmWindowMs?: number;
  /** A caller that never calls `release()` cannot freeze the scanner for longer than this. */
  maxInFlightMs?: number;
}

export const SCAN_GATE_DEFAULTS: Required<ScanGateOptions> = {
  cooldownMs: 2000,
  readerRepeatMs: 250,
  settleMs: 800,
  confirmReads: 2,
  confirmWindowMs: 1200,
  maxInFlightMs: 15000,
};

/**
 * One physical scan → one accepted code. Pure: time is passed in, so the rules
 * are unit-testable without a camera.
 *
 * CAMERA (fires every frame while a code is visible):
 *   - nothing is accepted while the previous lookup/add is in flight;
 *   - after an accept the gate is LATCHED for every code until the frame has
 *     been empty for `settleMs` — an item held still is one scan, and a second
 *     code on the same pack (a batch label) cannot sneak in behind the first;
 *   - the same code also needs `cooldownMs` after its lookup finished, so a
 *     glare flicker on a held pack cannot re-add it;
 *   - a value must be read `confirmReads` times within `confirmWindowMs`.
 * READER (keyboard wedge; one burst per trigger pull — always deliberate):
 *   - busy while in flight; the same code within `readerRepeatMs` (250 ms) of
 *     its last read is the reader double-sending. NO same-code cooldown: three
 *     pulls on three identical tins are three.
 * TYPED: busy while in flight, otherwise always taken — typing a code twice is
 *   a person saying "two of these".
 */
export class ScanGate {
  private readonly o: Required<ScanGateOptions>;
  private paused = false;
  private armed = true;
  private inFlightSince: number | null = null;
  private inFlightCode: string | null = null;
  private lastCameraSightingAt = Number.NEGATIVE_INFINITY;
  private lastRelease: { code: string; at: number } | null = null;
  private readerLast: { code: string; at: number } | null = null;
  private candidates = new Map<string, { n: number; first: number }>();
  private resumeHold: string | null = null;

  constructor(options: ScanGateOptions = {}) {
    this.o = { ...SCAN_GATE_DEFAULTS, ...options };
  }

  /** A lookup / add is running. */
  busy(now: number): boolean {
    if (this.inFlightSince === null) return false;
    if (now - this.inFlightSince > this.o.maxInFlightMs) { this.release(now); return false; }
    return true;
  }

  offer(scan: ClassifiedScan, source: ScanSource, now: number): GateDecision {
    if (this.paused) return { action: 'ignore', reason: 'paused' };
    if (scan.kind === 'empty') return { action: 'ignore', reason: 'empty' };
    if (source === 'manual') return this.offerTyped(scan, now);
    if (source === 'hid') return this.offerReader(scan, now);
    return this.offerCamera(scan, now);
  }

  /** The caller finished with the accepted scan (lookup answered, line added). Starts the cooldown. */
  release(now: number): void {
    if (this.inFlightCode !== null) this.lastRelease = { code: this.inFlightCode, at: now };
    this.inFlightSince = null;
    this.inFlightCode = null;
  }

  /** A sheet / modal covers the camera, or the screen lost focus. */
  pause(): void { this.paused = true; }

  /**
   * Back on screen. The phone is usually still hovering over the pack it just
   * scanned — that is the tail of the old scan, not a new one — so THAT code is
   * held until the frame has been empty for `settleMs`. Any other code scans
   * straight away.
   */
  resume(now: number): void {
    this.paused = false;
    this.armed = true;
    this.resumeHold = this.inFlightCode ?? this.lastRelease?.code ?? null;
    this.lastCameraSightingAt = now;
    this.candidates.clear();
  }

  private take(scan: ClassifiedScan, now: number): GateDecision {
    this.inFlightSince = now;
    this.inFlightCode = scan.code;
    this.candidates.clear();
    return { action: 'accept', scan };
  }

  private offerTyped(scan: ClassifiedScan, now: number): GateDecision {
    if (this.busy(now)) return { action: 'ignore', reason: 'busy' };
    if (scan.kind !== 'product') return { action: 'reject', scan };
    return this.take(scan, now);
  }

  private offerReader(scan: ClassifiedScan, now: number): GateDecision {
    const prev = this.readerLast;
    this.readerLast = { code: scan.code, at: now };
    if (prev && prev.code === scan.code && now - prev.at < this.o.readerRepeatMs) {
      return { action: 'ignore', reason: 'cooldown' };
    }
    if (this.busy(now)) return { action: 'ignore', reason: 'busy' };
    if (scan.kind !== 'product') return { action: 'reject', scan };
    return this.take(scan, now);
  }

  private offerCamera(scan: ClassifiedScan, now: number): GateDecision {
    // Every frame with a code in it — accepted, refused or misread — is
    // evidence the item is still in front of the lens.
    const quiet = now - this.lastCameraSightingAt >= this.o.settleMs;
    this.lastCameraSightingAt = now;
    if (quiet) { this.armed = true; this.resumeHold = null; this.candidates.clear(); }

    if (scan.kind === 'invalid') return { action: 'ignore', reason: 'misread' };
    if (this.busy(now)) return { action: 'ignore', reason: 'busy' };
    if (!this.armed) return { action: 'ignore', reason: 'held' };
    if (this.resumeHold !== null && scan.code === this.resumeHold) return { action: 'ignore', reason: 'held' };
    if (scan.kind !== 'product') {
      this.armed = false; // said once, not once per frame
      return { action: 'reject', scan };
    }
    const rel = this.lastRelease;
    if (rel && rel.code === scan.code && now - rel.at < this.o.cooldownMs) {
      return { action: 'ignore', reason: 'cooldown' };
    }
    if (this.o.confirmReads > 1) {
      const c = this.candidates.get(scan.code);
      if (!c || now - c.first > this.o.confirmWindowMs) {
        this.candidates.set(scan.code, { n: 1, first: now });
        return { action: 'ignore', reason: 'confirming' };
      }
      c.n += 1;
      if (c.n < this.o.confirmReads) return { action: 'ignore', reason: 'confirming' };
    }
    this.armed = false;
    return this.take(scan, now);
  }
}
// <<< SCANNER
