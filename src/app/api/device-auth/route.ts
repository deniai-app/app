import { and, eq, isNotNull, lt } from "drizzle-orm";
import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db/drizzle";
import { apiKey, deviceAuthCode } from "@/db/schema";
import { MAX_API_KEYS, withApiKeyLock, type ApiKeyTransaction } from "@/lib/api-key-quota";
import { generateApiKey, getKeyPrefix, hashApiKey } from "@/lib/api-key-utils";
import { auth } from "@/lib/auth";
import { resolveClientIp } from "@/lib/client-ip";
import { decryptFromB64, encryptToB64 } from "@/lib/crypto";
import { isWithinRedeliveryWindow, keyRedeliveryCutoff } from "@/lib/device-auth-key";
import { checkRateLimit } from "@/lib/rate-limit";
import { env } from "@/env";
import { readRequestJson, RequestBodyTooLargeError } from "@/lib/request-body";

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
    body = await readRequestJson(req, 4096);
  } catch (error) {
    return NextResponse.json(
      { error: "Invalid request" },
      { status: error instanceof RequestBodyTooLargeError ? 413 : 400 },
    );
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
      return handlePoll(req, body);
  }
}

/** Extension starts the flow; the separate deviceCode is its polling secret. */
async function handleInitiate(req: Request) {
  const ip = resolveClientIp(req.headers) ?? "unknown";
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

  const now = new Date();
  await db.delete(deviceAuthCode).where(lt(deviceAuthCode.expiresAt, now));
  // Encrypted keys are only kept for the short redelivery window, even if the code is still valid.
  await db
    .update(deviceAuthCode)
    .set({ issuedApiKeyEnc: null })
    .where(
      and(
        isNotNull(deviceAuthCode.issuedApiKeyEnc),
        lt(deviceAuthCode.issuedAt, keyRedeliveryCutoff(now)),
      ),
    );
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
      userCode: z.string().regex(/^[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/),
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

  const rateCheck = await checkRateLimit({
    key: `device-approve:${userId}`,
    windowMs: 60_000,
    maxRequests: 10,
  });
  if (!rateCheck.allowed)
    return NextResponse.json(
      { error: "Too many requests. Please slow down." },
      { status: 429, headers: { "Retry-After": String(rateCheck.retryAfter) } },
    );

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
async function handlePoll(req: Request, body: unknown) {
  const parsed = z.object({ deviceCode: z.string().regex(/^[0-9a-f]{64}$/) }).safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  // A per-code key alone lets an unauthenticated caller get a fresh budget
  // (and allocate another in-memory counter) with every random code.
  const ipRateCheck = await checkRateLimit({
    key: `device-poll-ip:${resolveClientIp(req.headers) ?? "unknown"}`,
    windowMs: 60_000,
    maxRequests: 60,
  });
  if (!ipRateCheck.allowed)
    return NextResponse.json(
      { error: "Too many requests. Please slow down." },
      { status: 429, headers: { "Retry-After": String(ipRateCheck.retryAfter) } },
    );
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
      const encryptedKey = row.issuedApiKeyEnc;
      // One redelivery for a lost response: the copy is wiped whatever happens next.
      await transaction
        .update(deviceAuthCode)
        .set({ issuedApiKeyEnc: null })
        .where(eq(deviceAuthCode.id, row.id));
      const [stillIssued] = row.issuedApiKeyId
        ? await transaction
            .select({ id: apiKey.id })
            .from(apiKey)
            .where(and(eq(apiKey.id, row.issuedApiKeyId), eq(apiKey.userId, userId)))
            .limit(1)
        : [];
      // A key the user already revoked, or one past the window, is never handed out again.
      if (!stillIssued || !isWithinRedeliveryWindow(row.issuedAt, new Date())) {
        return NextResponse.json({ approved: true, apiKeyUnavailable: true });
      }
      try {
        return NextResponse.json({
          approved: true,
          apiKey: await decryptFromB64(encryptedKey),
          apiKeyId: row.issuedApiKeyId,
        });
      } catch (error) {
        console.error("[device-auth] could not decrypt the issued key", error);
        return NextResponse.json({ approved: true, apiKeyUnavailable: true });
      }
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
      .set({
        issuedApiKeyId: inserted.id,
        issuedAt: new Date(),
        // Recoverable for a few minutes in case this response never reaches the extension.
        issuedApiKeyEnc: await encryptToB64(raw),
      })
      .where(eq(deviceAuthCode.id, row.id));
    return NextResponse.json({ approved: true, apiKey: raw, apiKeyId: inserted.id });
  });
}
