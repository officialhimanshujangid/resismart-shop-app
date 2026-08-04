/**
 * `useScanFeedback.ts` does `require('../../../assets/sounds/scan-hit.wav')`.
 * Metro resolves that to a numeric asset id at bundle time — same mechanism
 * as `require('./icon.png')` in `app.json` — but nothing in this project has
 * `require()`d a non-image static asset before, so TypeScript has never
 * needed to know what a `.wav` import even is. Ambient, so it applies
 * wherever the compiler sees `**\/*.ts(x)` (this app's `tsconfig.json`), not
 * only inside this folder.
 */
declare module '*.wav' {
  const value: number;
  export default value;
}
