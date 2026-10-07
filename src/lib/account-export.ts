import type { UIMessage } from "ai";
import { and, desc, eq, isNull } from "drizzle-orm";
import { db } from "@/db/drizzle";
import {
  affiliateProfile,
  billing,
  chats,
  chatShares,
  memoryItem,
  projectFiles,
  projects,
  providerSetting,
  securityActivity,
  usageQuota,
  user,
  userMemory,
} from "@/db/schema";
import { appVersion } from "@/lib/version";
import { currentProjectAccessWhere } from "@/lib/project-access";

function textFromMessage(message: UIMessage): string {
  const texts: string[] = [];
  for (const part of message.parts ?? []) {
    if (part.type === "text" && "text" in part && typeof part.text === "string") {
      texts.push(part.text);
    }
  }
  return texts.join("\n");
}

function simplifyMessages(raw: unknown): Array<{ role: string; text: string }> {
  if (!Array.isArray(raw)) {
    return [];
  }
  const out: Array<{ role: string; text: string }> = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const message = entry as UIMessage;
    if (message.role !== "user" && message.role !== "assistant") continue;
    const text = textFromMessage(message).trim();
    if (!text) continue;
    out.push({ role: message.role, text });
  }
  return out;
}

export async function buildAccountExport(userId: string) {
  const [
    profileRow,
    memoryProfile,
    memories,
    projectRows,
    fileRows,
    chatRows,
    shareRows,
    usageRows,
    billingRow,
    affiliateRow,
    providerRows,
    activityRows,
  ] = await Promise.all([
    db
      .select({
        id: user.id,
        name: user.name,
        email: user.email,
        emailVerified: user.emailVerified,
        image: user.image,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
        twoFactorEnabled: user.twoFactorEnabled,
      })
      .from(user)
      .where(eq(user.id, userId))
      .limit(1)
      .then((rows) => rows[0] ?? null),
    db
      .select()
      .from(userMemory)
      .where(eq(userMemory.userId, userId))
      .limit(1)
      .then((rows) => rows[0] ?? null),
    db.select().from(memoryItem).where(eq(memoryItem.userId, userId)),
    db
      .select()
      .from(projects)
      .where(and(eq(projects.userId, userId), currentProjectAccessWhere(userId))),
    db.select().from(projectFiles).where(eq(projectFiles.userId, userId)),
    db
      .select({
        id: chats.id,
        title: chats.title,
        projectId: chats.projectId,
        pinned: chats.pinned,
        folder: chats.folder,
        tags: chats.tags,
        createdAt: chats.created_at,
        updatedAt: chats.updated_at,
        messages: chats.messages,
      })
      .from(chats)
      .where(eq(chats.uid, userId)),
    db.select().from(chatShares).where(eq(chatShares.ownerId, userId)),
    db.select().from(usageQuota).where(eq(usageQuota.userId, userId)),
    db
      .select({
        planId: billing.planId,
        status: billing.status,
        currentPeriodEnd: billing.currentPeriodEnd,
        maxModeEnabled: billing.maxModeEnabled,
        createdAt: billing.createdAt,
      })
      .from(billing)
      .where(and(eq(billing.userId, userId), isNull(billing.organizationId)))
      .limit(1)
      .then((rows) => rows[0] ?? null),
    db
      .select({
        code: affiliateProfile.code,
        rewardPreference: affiliateProfile.rewardPreference,
        resetCredits: affiliateProfile.resetCredits,
        createdAt: affiliateProfile.createdAt,
      })
      .from(affiliateProfile)
      .where(eq(affiliateProfile.userId, userId))
      .limit(1)
      .then((rows) => rows[0] ?? null),
    db
      .select({
        provider: providerSetting.provider,
        preferByok: providerSetting.preferByok,
        apiStyle: providerSetting.apiStyle,
      })
      .from(providerSetting)
      .where(eq(providerSetting.userId, userId)),
    db
      .select({
        action: securityActivity.action,
        ipAddress: securityActivity.ipAddress,
        userAgent: securityActivity.userAgent,
        createdAt: securityActivity.createdAt,
      })
      .from(securityActivity)
      .where(eq(securityActivity.userId, userId))
      .orderBy(desc(securityActivity.createdAt))
      .limit(200),
  ]);

  return {
    exportedAt: new Date().toISOString(),
    appVersion,
    profile: profileRow,
    personalization: memoryProfile
      ? {
          instructions: memoryProfile.instructions,
          tone: memoryProfile.tone,
          friendliness: memoryProfile.friendliness,
          warmth: memoryProfile.warmth,
          emojiStyle: memoryProfile.emojiStyle,
          autoMemory: memoryProfile.autoMemory,
        }
      : null,
    memories: memories.map((item) => ({
      content: item.content,
      source: item.source,
      createdAt: item.createdAt,
    })),
    projects: projectRows.map((project) => {
      const files: Array<{
        filename: string;
        url: string;
        size: number;
        mimeType: string;
        createdAt: Date;
      }> = [];
      for (const file of fileRows) {
        if (file.projectId !== project.id) continue;
        files.push({
          filename: file.filename,
          url: file.url,
          size: file.size,
          mimeType: file.mimeType,
          createdAt: file.createdAt,
        });
      }
      return {
        id: project.id,
        name: project.name,
        description: project.description,
        instructions: project.instructions,
        color: project.color,
        defaultModel: project.defaultModel,
        organizationId: project.organizationId,
        archivedAt: project.archivedAt,
        createdAt: project.createdAt,
        files,
      };
    }),
    chats: chatRows.map((chat) => ({
      id: chat.id,
      title: chat.title,
      projectId: chat.projectId,
      pinned: chat.pinned,
      folder: chat.folder,
      tags: chat.tags,
      createdAt: chat.createdAt,
      updatedAt: chat.updatedAt,
      messages: simplifyMessages(chat.messages),
    })),
    shares: shareRows.map((share) => ({
      id: share.id,
      chatId: share.chatId,
      visibility: share.visibility,
      allowFork: share.allowFork,
      createdAt: share.createdAt,
    })),
    usage: usageRows.map((row) => ({
      category: row.category,
      planTier: row.planTier,
      limitAmount: row.limitAmount,
      unit: row.unit,
      used: row.used,
      periodStart: row.periodStart,
      periodEnd: row.periodEnd,
    })),
    billing: billingRow,
    affiliate: affiliateRow,
    providers: providerRows,
    securityActivity: activityRows,
  };
}
