/**
 * Errors thrown when a tab opened before a redeploy requests chunks or module
 * factories that no longer exist on the server. A full reload fixes them.
 */
const STALE_DEPLOYMENT_PATTERNS = [
  /module factory is not available/i,
  /ChunkLoadError/,
  /Loading chunk [\w-]+ failed/i,
  /Failed to load chunk/i,
];

const RELOAD_GUARD_KEY = "deni-ai:stale-deployment-reload";
/** Skip auto-reload if one already happened recently, so a real bug cannot loop. */
const RELOAD_GUARD_MS = 60_000;

export function isStaleDeploymentError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }
  const text = `${error.name}: ${error.message}`;
  return STALE_DEPLOYMENT_PATTERNS.some((pattern) => pattern.test(text));
}

/** Reloads the page once per guard window. Returns true when a reload was started. */
export function reloadForStaleDeployment(): boolean {
  try {
    const lastReload = Number(sessionStorage.getItem(RELOAD_GUARD_KEY) ?? 0);
    if (Date.now() - lastReload < RELOAD_GUARD_MS) {
      return false;
    }
    sessionStorage.setItem(RELOAD_GUARD_KEY, String(Date.now()));
  } catch {
    // Storage unavailable (private mode, blocked): reloading without a guard could loop.
    return false;
  }
  window.location.reload();
  return true;
}
