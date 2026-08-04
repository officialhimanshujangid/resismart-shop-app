/**
 * Regenerate `.expo/types/router.d.ts` from the real route tree.
 *
 * WHY THIS SCRIPT EXISTS
 *
 * That declaration file is what gives expo-router's `Href` its literal union of
 * real pathnames. Without it `Href` degrades to a permissive type and every
 * `router.push('/anything')` compiles — so `tsc --noEmit` exits 0 while
 * verifying nothing at all about navigation.
 *
 * That is not hypothetical here. The file was once hand-written to match a set
 * of BROKEN hrefs, which made a corrupt state look green: every row on the More
 * tab, the whole catalogue area including the barcode scanner, and every
 * successful sign-in were all navigating to paths that do not exist, and the
 * typecheck said nothing. `.expo/` is gitignored (correctly — it is build
 * output), which means a fresh clone has no declaration file at all and gets
 * the same silent pass for a different reason.
 *
 * So: generate it as a PREREQUISITE of typechecking, never commit it, and never
 * hand-edit it. If a route literal fails to compile, the route is wrong — the
 * generator is not.
 *
 * WHY IT IS INVOKED THIS WAY
 *
 * SDK 54 has no standalone CLI for this. `setupTypedRoutes` is reachable only
 * from the Metro dev server, so `expo start` is the only supported path — which
 * is no use in CI or in a typecheck script. This drives expo-router's own
 * generator directly, exactly as `@expo/cli` does internally, so the output is
 * byte-identical to what `expo start` would have written. It is not a
 * reimplementation; there is no second copy of the route logic here.
 *
 * `regenerateDeclarations` is debounced internally, so the process has to
 * outlive the debounce window or it exits before anything is written.
 */
const path = require('path');
const fs = require('fs');

const PROJECT_ROOT = path.resolve(__dirname, '..');
const APP_ROOT = path.join(PROJECT_ROOT, 'app');
const TYPES_DIR = path.join(PROJECT_ROOT, '.expo', 'types');
const OUT_FILE = path.join(TYPES_DIR, 'router.d.ts');

// The generator reads the app directory from the environment, the same way the
// dev server sets it up. Set before requiring expo-router, not after.
process.env.EXPO_ROUTER_APP_ROOT = APP_ROOT;

if (!fs.existsSync(APP_ROOT)) {
  console.error(`[router-types] No app directory at ${APP_ROOT}`);
  process.exit(1);
}

fs.mkdirSync(TYPES_DIR, { recursive: true });

let typedRoutes;
try {
  typedRoutes = require('expo-router/build/typed-routes');
} catch (e) {
  console.error('[router-types] Could not load expo-router/build/typed-routes.');
  console.error('[router-types] Run `npm install` first. Original error:', e.message);
  process.exit(1);
}

const { regenerateDeclarations } = typedRoutes;
if (typeof regenerateDeclarations !== 'function') {
  console.error(
    '[router-types] expo-router no longer exports regenerateDeclarations.\n' +
    '[router-types] The SDK has moved this API. Read the INSTALLED expo-router source\n' +
    '[router-types] under node_modules/expo-router/build/typed-routes and update this script —\n' +
    '[router-types] do NOT hand-write router.d.ts, which is how the last outage happened.',
  );
  process.exit(1);
}

regenerateDeclarations(TYPES_DIR, {});

// The generator debounces its write. Exiting immediately produces nothing, and
// the failure is silent — a missing file reads as "no typed routes" rather than
// as an error. Wait, then assert the file is actually there.
setTimeout(() => {
  if (!fs.existsSync(OUT_FILE)) {
    console.error(`[router-types] Generator produced no file at ${OUT_FILE}`);
    process.exit(1);
  }
  const bytes = fs.statSync(OUT_FILE).size;
  console.log(`[router-types] ${path.relative(PROJECT_ROOT, OUT_FILE)} — ${bytes} bytes`);
}, 1500);
