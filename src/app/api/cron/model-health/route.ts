import { timingSafeEqual } from "node:crypto";
import { env } from "@/env";
import { checkModelHealth } from "@/lib/model-health";

export const maxDuration = 60;

export async function GET(request: Request) {
  if (!env.CRON_SECRET)
    return Response.json({ error: "Model health checks are disabled" }, { status: 503 });
  const expected = Buffer.from(`Bearer ${env.CRON_SECRET}`);
  const supplied = Buffer.from(request.headers.get("authorization") ?? "");
  if (expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) {
    return new Response(null, { status: 401 });
  }
  const results = await checkModelHealth();
  // Always 200: an unavailable model is a recorded status, not a scheduler failure.
  return Response.json({ results }, { headers: { "Cache-Control": "no-store" } });
}
