import { Href } from 'expo-router';

/**
 * OBSOLETE, and left in place only because removing its ~30 call sites is its
 * own change. Do not add new ones.
 *
 * The reasoning this file used to carry was sound at the time and is worth
 * keeping in view: `.expo/types/router.d.ts` was, on that build, being written
 * with EVERY dynamic segment typed as the four literal characters `[id]` rather
 * than a parameterised segment (so no runtime id could satisfy it), and its
 * union even contained non-route modules like `` `/../src/lib/store` `` — the
 * route scan was not scoped to `app/`. Against a declaration file in that state
 * a runtime-built href genuinely could not be expressed, and asserting through
 * the SDK's own `Href` was the honest way to say so.
 *
 * THAT IS FIXED. `scripts/generate-router-types.js` now regenerates the
 * declaration file as a prerequisite of `npm run typecheck` (see its header for
 * why the old file was untrustworthy), and the union it produces is correct:
 * dynamic segments come out as `` `/billing/${Router.SingleRoutePart<T>}` ``,
 * query strings and group prefixes are both covered, and nothing outside `app/`
 * appears. Checked by pushing every literal and template currently wrapped in
 * `toHref` — `/settings/plan`, `/notifications`, `/parties`, `/reviews`,
 * `` `/(app)/billing/${id}` ``, `` `/(app)/payments/new?direction=${d}` `` and
 * the rest — bare, with no cast: all of them compile.
 *
 * So every remaining `toHref(...)` is now a SUPPRESSION rather than an escape
 * hatch. It costs the exact protection the generator script exists to provide:
 * a route renamed or deleted breaks the build everywhere else in the app and
 * silently becomes a dead tap behind this function. Unwrapping the call sites
 * and deleting this file is a mechanical change that `tsc --noEmit` verifies in
 * one run; it wants its own pass.
 */
export function toHref(path: string): Href {
  return path as Href;
}
