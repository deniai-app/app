import { timingSafeEqual } from "node:crypto";
import { count, eq } from "drizzle-orm";
import { db } from "@/db/drizzle";
import { maxModeMeterEvent } from "@/db/schema";
import { env } from "@/env";
import { retryMaxModeUsageReports } from "@/lib/max-mode";
import { recoverUsageReservations } from "@/lib/usage";

export const maxDuration = 300;

export async function GET(request: Request) {
  if (!env.CRON_SECRET)
    return Response.json({ error: "Usage recovery is disabled" }, { status: 503 });
  const expected = Buffer.from(`Bearer ${env.CRON_SECRET}`);
  const supplied = Buffer.from(request.headers.get("authorization") ?? "");
  if (expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) {
    return new Response(null, { status: 401 });
  }
  const recovery = await recoverUsageReservations();
  const result = await retryMaxModeUsageReports();
  const [review] = await db
    .select({ total: count() })
    .from(maxModeMeterEvent)
    .where(eq(maxModeMeterEvent.requiresReview, true));
  return Response.json(
    { ...result, ...recovery, requiresReview: review?.total ?? 0 },
    {
      status:
        result.failed > 0 || recovery.recoveryFailed > 0 || (review?.total ?? 0) > 0 ? 503 : 200,
      headers: { "Cache-Control": "no-store" },
    },
  );
}
