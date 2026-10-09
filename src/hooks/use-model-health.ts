import { useQuery } from "@tanstack/react-query";

export type ModelHealthStatus = "available" | "unavailable";

type ModelHealthResponse = {
  models: { model: string; available: boolean; checkedAt: string }[];
};

/** Probes run every 5 minutes; older results mean the scheduler stopped, so show nothing. */
const STALE_AFTER_MS = 20 * 60 * 1000;

async function fetchModelHealth(): Promise<Record<string, ModelHealthStatus>> {
  const response = await fetch("/api/status/models");
  if (!response.ok) throw new Error("Failed to load model status");
  const { models } = (await response.json()) as ModelHealthResponse;
  const now = Date.now();
  const statuses: Record<string, ModelHealthStatus> = {};
  for (const entry of models) {
    if (now - new Date(entry.checkedAt).getTime() > STALE_AFTER_MS) continue;
    statuses[entry.model] = entry.available ? "available" : "unavailable";
  }
  return statuses;
}

export function useModelHealth(enabled = true) {
  const query = useQuery({
    queryKey: ["model-health"],
    queryFn: fetchModelHealth,
    enabled,
    staleTime: 60_000,
    refetchInterval: enabled ? 5 * 60_000 : false,
  });
  return query.data ?? {};
}
