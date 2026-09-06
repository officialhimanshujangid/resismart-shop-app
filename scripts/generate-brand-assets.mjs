/**
 * Regenerates the RS Partner store/launch artwork from the app's own mark.
 *
 * Source: assets/appicon.jpg -- the shared ResiSmart badge (a rounded-square
 * ground holding the white RS mark) that src/components/AppLogo.tsx already
 * renders in-app. It is the only piece of real shop branding in assets/;
 * icon.png, splash-icon.png and favicon.png were still Expo's starter template
 * artwork (the blue chevron and the grey grid-and-circles placeholder).
 *
 * Writes:
 *   assets/icon.png         1024x1024  RGB, NO alpha    store / launcher icon
 *   assets/splash-icon.png  1024x1024  RGBA             cold-start splash mark
 *   assets/favicon.png      48x48      RGBA             web favicon
 *
 * Deliberately NOT written here:
 *   assets/android-icon-foreground.png, assets/android-icon-monochrome.png and
 *   assets/notification-icon.png are produced by
 *   ../mobile-society/scripts/generate-brand-assets.mjs, which owns the
 *   adaptive-icon / themed-icon / push-icon masking rules for both apps.
 *
 * Why the ground is recoloured: the source badge is ResiSmart blue, which is
 * mobile-society's brand colour. The shop app's brand colour is #0A4020 (its
 * android.adaptiveIcon.backgroundColor and its expo.splash.backgroundColor), so
 * the mark is keyed out of the source and re-laid on a green ground. The two
 * apps then read as siblings on a home screen instead of as duplicates.
 *
 * iOS rejects an app icon that carries an alpha channel, so icon.png is emitted
 * as a genuine 8-bit truecolour PNG (IHDR colour type 2) from a 3-channel raw
 * buffer -- never RGBA that happens to be fully opaque.
 *
 * Run with: npm run icons
 */
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import sharp from 'sharp';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SHOP = path.resolve(HERE, '..');
const ASSETS = path.join(SHOP, 'assets');
const MASTER = path.join(ASSETS, 'appicon.jpg');

/** expo.android.adaptiveIcon.backgroundColor / expo.splash.backgroundColor in app.json. */
const GROUND = { r: 0x0a, g: 0x40, b: 0x20 };

const ICON_CANVAS = 1024;
const SPLASH_CANVAS = 1024;
const FAVICON_CANVAS = 48; // the 48x48 convention shared with mobile-society

/**
 * Fraction of the icon canvas the mark's wider axis spans. The source badge is
 * itself full-bleed (its rounded corners are the only non-badge pixels), and the
 * mark spans 682/1024 of it, so reproducing that keeps the icon reading exactly
 * like the artwork the app already ships.
 */
const ICON_MARK_RATIO = 682 / 1024;
/** The splash mark floats on a bare colour field, so it wants far more air. */
const SPLASH_MARK_RATIO = 0.52;
/** Corner radius of the badge, as a fraction of its side. Matches AppLogo's borderRadius. */
const CORNER_RATIO = 0.22;

/**
 * The master is an opaque RGB image: a coloured rounded-square badge holding a
 * white mark, sitting on a white page background. Background and mark are both
 * white, so a luminance threshold alone cannot separate them. Flood-fill the
 * near-white region inward from the border to find the page background;
 * near-white pixels the fill cannot reach are the mark.
 */
function extractGlyph(data, width, height) {
  const isNearWhite = (i) => {
    const o = i * 3;
    return Math.min(data[o], data[o + 1], data[o + 2]) >= 200;
  };

  const outside = new Uint8Array(width * height);
  const queue = new Int32Array(width * height);
  let head = 0;
  let tail = 0;

  const push = (i) => {
    if (!outside[i] && isNearWhite(i)) {
      outside[i] = 1;
      queue[tail++] = i;
    }
  };

  for (let x = 0; x < width; x++) {
    push(x);
    push((height - 1) * width + x);
  }
  for (let y = 0; y < height; y++) {
    push(y * width);
    push(y * width + width - 1);
  }

  while (head < tail) {
    const i = queue[head++];
    const x = i % width;
    const y = (i - x) / width;
    if (x > 0) push(i - 1);
    if (x < width - 1) push(i + 1);
    if (y > 0) push(i - width);
    if (y < height - 1) push(i + width);
  }

  // Grow the mark core by two pixels and feather only inside that dilation. The
  // soft colour/white ramp along the badge's own outline is neither near-white
  // nor border-reachable, and this keeps it out of the silhouette.
  let core = new Uint8Array(width * height);
  for (let i = 0; i < width * height; i++) core[i] = !outside[i] && isNearWhite(i) ? 1 : 0;

  for (let pass = 0; pass < 2; pass++) {
    const next = new Uint8Array(core);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const i = y * width + x;
        if (core[i]) continue;
        if (
          (x > 0 && core[i - 1]) ||
          (x < width - 1 && core[i + 1]) ||
          (y > 0 && core[i - width]) ||
          (y < height - 1 && core[i + width])
        ) {
          next[i] = 1;
        }
      }
    }
    core = next;
  }

  // White-on-transparent silhouette of the mark alone.
  const glyph = Buffer.alloc(width * height * 4);
  const LO = 120;
  const HI = 235;
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;

  for (let i = 0; i < width * height; i++) {
    const o3 = i * 3;
    const o4 = i * 4;
    glyph[o4] = 255;
    glyph[o4 + 1] = 255;
    glyph[o4 + 2] = 255;

    if (!core[i]) {
      glyph[o4 + 3] = 0;
      continue;
    }
    const lum = Math.min(data[o3], data[o3 + 1], data[o3 + 2]);
    glyph[o4 + 3] = Math.round(255 * Math.min(1, Math.max(0, (lum - LO) / (HI - LO))));

    if (glyph[o4 + 3] > 16) {
      const x = i % width;
      const y = (i - x) / width;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }

  if (maxX < 0) throw new Error('No mark pixels found inside the badge.');

  return { glyph, bbox: { left: minX, top: minY, width: maxX - minX + 1, height: maxY - minY + 1 } };
}

/**
 * The mark, cropped to its bounding box and scaled so its wider axis spans
 * `ratio` of `canvas`, as a standalone transparent PNG. Resizing premultiplies
 * alpha and leaves feathered edge pixels slightly off-white; the mark is white
 * by definition, so the colour channels are flattened back to pure white and the
 * alpha channel carries the whole shape.
 */
async function renderMark(glyph, info, bbox, canvas, ratio) {
  const scale = (canvas * ratio) / Math.max(bbox.width, bbox.height);
  const width = Math.max(1, Math.round(bbox.width * scale));
  const height = Math.max(1, Math.round(bbox.height * scale));

  const raw = await sharp(glyph, { raw: { width: info.width, height: info.height, channels: 4 } })
    .extract(bbox)
    .resize(width, height, { fit: 'fill' })
    .raw()
    .toBuffer();

  for (let i = 0; i < width * height; i++) {
    raw[i * 4] = 255;
    raw[i * 4 + 1] = 255;
    raw[i * 4 + 2] = 255;
  }

  const png = await sharp(raw, { raw: { width, height, channels: 4 } }).png().toBuffer();
  return { png, width, height };
}

/** An alpha mask shaped like the badge: a rounded square filling `canvas`. */
function roundedSquareMask(canvas) {
  const r = Math.round(canvas * CORNER_RATIO);
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${canvas}" height="${canvas}">` +
      `<rect x="0" y="0" width="${canvas}" height="${canvas}" rx="${r}" ry="${r}" fill="#fff"/></svg>`
  );
}

function report(target, buffer) {
  fs.writeFileSync(target, buffer);
  const ihdr = buffer.subarray(16, 26);
  const w = ihdr.readUInt32BE(0);
  const h = ihdr.readUInt32BE(4);
  console.log(
    `wrote ${path.relative(SHOP, target)}  ${w}x${h}  depth=${ihdr[8]} colourType=${ihdr[9]}  ` +
      `${buffer.length} bytes  md5=${crypto.createHash('md5').update(buffer).digest('hex')}`
  );
}

async function main() {
  const master = sharp(MASTER);
  const meta = await master.metadata();
  if (meta.width !== meta.height) {
    throw new Error(`Expected a square master, got ${meta.width}x${meta.height}`);
  }
  console.log(`master: ${path.relative(SHOP, MASTER)} (${meta.width}x${meta.height}, ${fs.statSync(MASTER).size} bytes)`);

  const { data, info } = await master.clone().removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const { glyph, bbox } = extractGlyph(data, info.width, info.height);
  console.log(`  mark bounding box: ${bbox.width}x${bbox.height} at (${bbox.left},${bbox.top})`);

  // --- icon.png ---------------------------------------------------------
  // Full-bleed: the stores apply their own corner mask, so the ground runs edge
  // to edge and no rounding is baked in.
  const iconMark = await renderMark(glyph, info, bbox, ICON_CANVAS, ICON_MARK_RATIO);
  const iconRgba = await sharp({
    create: { width: ICON_CANVAS, height: ICON_CANVAS, channels: 4, background: { ...GROUND, alpha: 1 } },
  })
    .composite([{ input: iconMark.png, gravity: 'centre' }])
    .raw()
    .toBuffer();

  // Drop to a 3-channel buffer by hand so the encoder has no alpha to record:
  // IHDR colour type 2, which is what iOS requires of an app icon.
  const iconRgb = Buffer.alloc(ICON_CANVAS * ICON_CANVAS * 3);
  for (let i = 0; i < ICON_CANVAS * ICON_CANVAS; i++) {
    iconRgb[i * 3] = iconRgba[i * 4];
    iconRgb[i * 3 + 1] = iconRgba[i * 4 + 1];
    iconRgb[i * 3 + 2] = iconRgba[i * 4 + 2];
  }
  const iconPng = await sharp(iconRgb, { raw: { width: ICON_CANVAS, height: ICON_CANVAS, channels: 3 } })
    .png({ palette: false, compressionLevel: 9, effort: 10 })
    .toBuffer();
  report(path.join(ASSETS, 'icon.png'), iconPng);
  console.log(`  mark ${iconMark.width}x${iconMark.height} on #0A4020, full bleed`);

  // --- splash-icon.png --------------------------------------------------
  // app.json uses the legacy top-level expo.splash with backgroundColor
  // "#0A4020" and resizeMode "contain", so the platform paints the green and
  // this file supplies only the white mark, generously padded, on transparency.
  const splashMark = await renderMark(glyph, info, bbox, SPLASH_CANVAS, SPLASH_MARK_RATIO);
  const splashPng = await sharp({
    create: { width: SPLASH_CANVAS, height: SPLASH_CANVAS, channels: 4, background: { r: 255, g: 255, b: 255, alpha: 0 } },
  })
    .composite([{ input: splashMark.png, gravity: 'centre' }])
    .png({ palette: false, compressionLevel: 9, effort: 10 })
    .toBuffer();
  report(path.join(ASSETS, 'splash-icon.png'), splashPng);
  console.log(`  mark ${splashMark.width}x${splashMark.height} centred on transparency (splash paints #0A4020)`);

  // --- favicon.png ------------------------------------------------------
  // A browser tab has no mask of its own, so this one keeps the badge's rounded
  // square and its transparent corners.
  const favMark = await renderMark(glyph, info, bbox, FAVICON_CANVAS, ICON_MARK_RATIO);
  const favBadge = await sharp({
    create: { width: FAVICON_CANVAS, height: FAVICON_CANVAS, channels: 4, background: { ...GROUND, alpha: 1 } },
  })
    .composite([
      { input: favMark.png, gravity: 'centre' },
      { input: roundedSquareMask(FAVICON_CANVAS), blend: 'dest-in' },
    ])
    .png({ palette: false, compressionLevel: 9, effort: 10 })
    .toBuffer();
  report(path.join(ASSETS, 'favicon.png'), favBadge);
  console.log(`  mark ${favMark.width}x${favMark.height} on a rounded #0A4020 badge`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
