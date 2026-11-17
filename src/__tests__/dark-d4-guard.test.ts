/**
 * DARK-D4 (2026-11-14) — static guard: no new light-only paint.
 *
 * Owner: "some screens stay light when I pick Dark". Every screen file under
 * app/, src/components and src/features is scanned for
 *   1. a light-only NativeWind class (bg-white, bg-surface, bg-gray-100,
 *      text-ink, border-line …) on a line with no `dark:` variant, and
 *   2. a hard-coded light `backgroundColor: '#fff…'` with no isDark / dark branch.
 * Intentional light plates (QR / barcode quiet zones, printed cards) are listed
 * below with the reason. A QR plate written as `bg-white dark:bg-white` passes.
 */
import fs from 'fs';
import path from 'path';

// The shop's routes live in <app>/app; the kit and features in src.
const ROOT = path.resolve(__dirname, '..', '..');
const DIRS = ['app', 'src/components', 'src/features'];

/** file (relative to src) → why its light paint is on purpose. */
const ALLOW: Record<string, string> = {
  'src/features/commerce/components/StorefrontSettingsCards.tsx': 'storefront QR plate stays white in dark (scanners need the quiet zone)',
};

const CLASS = /(?<![\w:-])(bg-white(\/(5|6|7|8|9)\d)?|bg-(gray|slate|neutral|zinc|stone)-(50|100|200)|text-black|text-(gray|slate|neutral|zinc|stone)-(500|600|700|800|900)|border-(gray|slate|neutral|zinc|stone)-(100|200|300)|bg-(surface|ground|panel|track|bg|brand-50|brand-100|primary-soft)|text-(ink|soft|muted)|border-line|border-white)(?![\w/-])/;
const LIGHT_BG = /backgroundColor:\s*['"](#(?:fff|ffffff|f[0-9a-f]{5}|e[0-9a-f]{5})|white)['"]/i;

function walk(dir: string, out: string[]) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { if (e.name !== '__tests__') walk(p, out); } else if (/\.tsx?$/.test(e.name)) out.push(p);
  }
}

function scan(): string[] {
  const files: string[] = [];
  DIRS.forEach((d) => fs.existsSync(path.join(ROOT, d)) && walk(path.join(ROOT, d), files));
  const hits: string[] = [];
  for (const f of files) {
    const rel = path.relative(ROOT, f).split(path.sep).join('/');
    if (ALLOW[rel]) continue;
    fs.readFileSync(f, 'utf8').split(/\r?\n/).forEach((line, i) => {
      if (/^\s*(\/\/|\*|\/\*)/.test(line) || line.includes('dark:') || /isDark|\bdark\b/.test(line)) return;
      const strings = line.match(/(["'`])(?:(?!\1).)*\1/g) ?? [];
      if (strings.some((s) => CLASS.test(s)) || LIGHT_BG.test(line)) hits.push(`${rel}:${i + 1}: ${line.trim().slice(0, 120)}`);
    });
  }
  return hits;
}

describe('DARK-D4 static guard', () => {
  it('scans a real tree', () => {
    const files: string[] = [];
    walk(path.join(ROOT, 'app'), files);
    expect(files.length).toBeGreaterThan(50);
  });

  it('no light-only class or light background without a dark variant', () => {
    expect(scan()).toEqual([]);
  });

  it('the detector still catches a light-only class (self-check)', () => {
    expect(CLASS.test('"rounded-card bg-white p-4"')).toBe(true);
    expect(CLASS.test('"bg-white/20"')).toBe(false);
    expect(LIGHT_BG.test("backgroundColor: '#F5F7FB',")).toBe(true);
  });
});
