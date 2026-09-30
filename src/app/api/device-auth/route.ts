import { and, eq, lt } from "drizzle-orm";
import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db/drizzle";
import { apiKey, deviceAuthCode } from "@/db/schema";
import { MAX_API_KEYS, withApiKeyLock, type ApiKeyTransaction } from "@/lib/api-key-quota";
import { generateApiKey, getKeyPrefix, hashApiKey } from "@/lib/api-key-utils";
import { auth } from "@/lib/auth";
import { decryptFromB64 } from "@/lib/crypto";
import { checkRateLimit } from "@/lib/rate-limit";
import { env } from "@/env";

function generateUserCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  const code = Array.from(bytes, (b) => chars[b % chars.length]).join("");
  return `${code.slice(0, 4)}-${code.slice(4)}`;
}

function generateDeviceCode(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

async function listUserApiKeys(userId: string, database: ApiKeyTransaction) {
  return database
    .select({
      id: apiKey.id,
      name: apiKey.name,
      keyPrefix: apiKey.keyPrefix,
      lastUsedAt: apiKey.lastUsedAt,
      createdAt: apiKey.createdAt,
    })
    .from(apiKey)
    .where(eq(apiKey.userId, userId))
    .orderBy(apiKey.createdAt);
}

async function apiKeyLimitResponse(userId: string, status: 403 | 409, database: ApiKeyTransaction) {
  return NextResponse.json(
    {
      code: "API_KEY_LIMIT_REACHED",
      error: "Maximum of 5 API keys allowed. Revoke an existing key first.",
      apiKeys: await listUserApiKeys(userId, database),
    },
    { status },
  );
}

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const action = z.object({ action: z.enum(["initiate", "approve", "poll"]) }).safeParse(body);
  if (!action.success) {
    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  }

  switch (action.data.action) {
    case "initiate":
      return handleInitiate(req);
    case "approve": {
      const contentType = req.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase();
      if (
        req.headers.get("origin") !== new URL(env.NEXT_PUBLIC_BETTER_AUTH_URL).origin ||
        req.headers.get("sec-fetch-site") === "cross-site"
      ) {
        return NextResponse.json({ error: "Forbidden origin" }, { status: 403 });
      }
      if (contentType !== "application/json") {
        return NextResponse.json({ error: "JSON content type required" }, { status: 415 });
      }
      return handleApprove(body);
    }
    case "poll":
      return handlePoll(body);
  }
}

/** Extension starts the flow; the separate deviceCode is its polling secret. */
async function handleInitiate(req: Request) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const rateCheck = await checkRateLimit({
    key: `device-auth:${ip}`,
    windowMs: 60_000,
    maxRequests: 5,
  });
  if (!rateCheck.allowed) {
    return NextResponse.json(
      { error: "Too many requests. Please slow down." },
      { status: 429, headers: { "Retry-After": String(rateCheck.retryAfter) } },
    );
  }

  await db.delete(deviceAuthCode).where(lt(deviceAuthCode.expiresAt, new Date()));
  const userCode = generateUserCode();
  const deviceCode = generateDeviceCode();
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000);
  await db.insert(deviceAuthCode).values({ userCode, deviceCode, expiresAt });
  return NextResponse.json({ userCode, deviceCode, expiresIn: 900 });
}

/** Approval and any requested key revocation either both commit or both roll back. */
async function handleApprove(body: unknown) {
  const parsed = z
    .object({
      userCode: z.string().min(1),
      revokeKeyId: z.string().min(1).optional(),
    })
    .safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const session = await auth.api.getSession({ headers: await headers() });
  const userId = session?.session?.userId;
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.user.isAnonymous) {
    return NextResponse.json(
      {
        error:
          "Guest accounts cannot authorize the Flixa extension. Please sign in with an account.",
        reason: "anonymous_forbidden",
      },
      { status: 403 },
    );
  }

  return withApiKeyLock(db, userId, async (transaction) => {
    const [row] = await transaction
      .select()
      .from(deviceAuthCode)
      .where(eq(deviceAuthCode.userCode, parsed.data.userCode))
      .limit(1)
      .for("update");
    if (!row) {
      return NextResponse.json({ error: "Invalid code" }, { status: 404 });
    }
    if (row.expiresAt < new Date()) {
      return NextResponse.json({ error: "Code expired" }, { status: 410 });
    }
    if (row.approved) {
      return NextResponse.json({ error: "Already approved" }, { status: 409 });
    }

    const existingKeys = await listUserApiKeys(userId, transaction);
    if (existingKeys.length >= MAX_API_KEYS) {
      if (!parsed.data.revokeKeyId) {
        return apiKeyLimitResponse(userId, 409, transaction);
      }
      const deleted = await transaction
        .delete(apiKey)
        .where(and(eq(apiKey.id, parsed.data.revokeKeyId), eq(apiKey.userId, userId)))
        .returning({ id: apiKey.id });
      if (!deleted[0]) {
        return NextResponse.json({ error: "API key not found." }, { status: 404 });
      }
    }

    await transaction
      .update(deviceAuthCode)
      .set({ approved: true, userId })
      .where(eq(deviceAuthCode.id, row.id));
    return NextResponse.json({ success: true });
  });
}

/** Issue at most one key per device code while sharing the account quota lock. */
async function handlePoll(body: unknown) {
  const parsed = z.object({ deviceCode: z.string().min(1) }).safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  const rateCheck = await checkRateLimit({
    key: `device-poll:${parsed.data.deviceCode}`,
    windowMs: 10_000,
    maxRequests: 3,
  });
  if (!rateCheck.allowed) {
    return NextResponse.json(
      { error: "Too many requests. Please slow down." },
      { status: 429, headers: { "Retry-After": String(rateCheck.retryAfter) } },
    );
  }

  const [initialRow] = await db
    .select()
    .from(deviceAuthCode)
    .where(eq(deviceAuthCode.deviceCode, parsed.data.deviceCode))
    .limit(1);
  if (!initialRow) {
    return NextResponse.json({ error: "Invalid device code" }, { status: 404 });
  }
  if (initialRow.expiresAt < new Date()) {
    await db.delete(deviceAuthCode).where(eq(deviceAuthCode.id, initialRow.id));
    return NextResponse.json({ error: "Code expired" }, { status: 410 });
  }
  if (!initialRow.approved || !initialRow.userId) {
    return NextResponse.json({ approved: false });
  }
  const userId = initialRow.userId;

  return withApiKeyLock(db, userId, async (transaction) => {
    // Re-read after acquiring the account lock: a concurrent poll may have issued it.
    const [row] = await transaction
      .select()
      .from(deviceAuthCode)
      .where(eq(deviceAuthCode.id, initialRow.id))
      .limit(1)
      .for("update");
    if (!row) {
      return NextResponse.json({ error: "Invalid device code" }, { status: 404 });
    }
    if (row.expiresAt < new Date()) {
      await transaction.delete(deviceAuthCode).where(eq(deviceAuthCode.id, row.id));
      return NextResponse.json({ error: "Code expired" }, { status: 410 });
    }
    if (row.issuedApiKeyEnc) {
      const raw = await decryptFromB64(row.issuedApiKeyEnc);
      await transaction
        .update(deviceAuthCode)
        .set({ issuedApiKeyEnc: null })
        .where(eq(deviceAuthCode.id, row.id));
      return NextResponse.json({ approved: true, apiKey: raw });
    }
    if (row.issuedApiKeyId) {
      return NextResponse.json({ approved: true, apiKeyUnavailable: true });
    }
    const existingKeys = await listUserApiKeys(userId, transaction);
    if (existingKeys.length >= MAX_API_KEYS) {
      return apiKeyLimitResponse(userId, 403, transaction);
    }

    const raw = generateApiKey();
    const [inserted] = await transaction
      .insert(apiKey)
      .values({
        userId,
        name: "Flixa Extension",
        keyHash: await hashApiKey(raw),
        keyPrefix: getKeyPrefix(raw),
      })
      .returning({ id: apiKey.id });
    await transaction
      .update(deviceAuthCode)
      .set({ issuedApiKeyId: inserted.id, issuedAt: new Date() })
      .where(eq(deviceAuthCode.id, row.id));
    return NextResponse.json({ approved: true, apiKey: raw, apiKeyId: inserted.id });
  });
}
