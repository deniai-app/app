/**
 * How long an issued Flixa API key stays recoverable after it was handed out.
 * The poll response that carries the key can be lost; within this window the
 * encrypted copy lets the extension fetch it once more. Past it the copy is
 * wiped and the user has to authorize again.
 */
export const KEY_REDELIVERY_WINDOW_MS = 5 * 60 * 1000;

export function keyRedeliveryCutoff(now: Date) {
  return new Date(now.getTime() - KEY_REDELIVERY_WINDOW_MS);
}

/** True while an issued key may still be redelivered. */
export function isWithinRedeliveryWindow(issuedAt: Date | null, now: Date) {
  return issuedAt !== null && issuedAt > keyRedeliveryCutoff(now);
}
