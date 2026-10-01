/** Local calendar day as `YYYY-MM-DD` (what `DateField` reads and writes). */
export function todayYmd(now: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/** `YYYY-MM-DD` → ISO at local midnight, or undefined for an empty field. */
export function isoOfDay(ymd: string | undefined): string | undefined {
  return ymd ? new Date(`${ymd}T00:00:00`).toISOString() : undefined;
}

/** `YYYY-MM-DD` → ISO at the END of that local day (an inclusive `to`). */
export function isoEndOfDay(ymd: string | undefined): string | undefined {
  return ymd ? new Date(`${ymd}T23:59:59.999`).toISOString() : undefined;
}

/** The first day of the local month of `now`, `YYYY-MM-DD`. */
export function monthStartYmd(now: Date = new Date()): string {
  return todayYmd(new Date(now.getFullYear(), now.getMonth(), 1));
}
