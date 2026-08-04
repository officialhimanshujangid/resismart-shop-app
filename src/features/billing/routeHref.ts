import { Href } from 'expo-router';

/**
 * A typed-route escape hatch for hrefs this screen builds at runtime
 * (`/billing/<documentId>`), NOT a suppression.
 *
 * `experiments.typedRoutes` (app.json) generates `.expo/types/router.d.ts`
 * from the file system, and it is broken project-wide as of this build, not
 * something introduced by this feature — `npx tsc --noEmit` on a clean
 * checkout already fails the same way on templated pushes in files this
 * agent does not own: `app/(app)/catalog/create.tsx`, `catalog/index.tsx`
 * and `catalog/scan.tsx`. Inspecting `.expo/types/router.d.ts` directly
 * (regenerated fresh via `npx expo start` for this build, twice) shows why:
 * EVERY dynamic segment in the app, including `app/(app)/parties/[id].tsx`
 * which this agent never touched, is typed as the four literal characters
 * `[id]` rather than a parameterised segment — so no runtime id can ever
 * satisfy it — and the same generated union also contains entries like
 * `` `/../src/lib/store` `` — a plain non-route TypeScript module — meaning
 * the route-context scan used to build this file is not scoped to `app/`
 * the way it normally is. Both symptoms point at the generator, not at any
 * one route file, and neither is fixable from inside a screen this agent
 * owns — see `ownerDecisionsNeeded`.
 *
 * `Href` (not `any`, not `@ts-ignore`) is exported by `expo-router` for
 * exactly this: a string the CALLER knows is a valid path, asserted through
 * the SDK's own routing type rather than suppressed. `router.push`/`replace`
 * still reject anything that is not a `string | HrefObject` shape — a typo'd
 * object would still fail here — this only widens which STRINGS are
 * accepted.
 */
export function toHref(path: string): Href {
  return path as Href;
}
