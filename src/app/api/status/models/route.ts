import { getModelHealth } from "@/lib/model-health";

export async function GET() {
  const rows = await getModelHealth();
  return Response.json(
    {
      models: rows.map((row) => ({
        model: row.model,
        provider: row.provider,
        available: row.available,
        latencyMs: row.latencyMs,
        consecutiveFailures: row.consecutiveFailures,
        checkedAt: row.checkedAt,
        lastAvailableAt: row.lastAvailableAt,
      })),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
