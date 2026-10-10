import { cacheLife, cacheTag } from "next/cache";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db/drizzle";
import { blogPost } from "@/db/schema";

export const BLOG_CACHE_TAG = "blog";

export type ManagedBlogPost = typeof blogPost.$inferSelect;

// `next build` may run without a reachable database (e.g. the CI image build).
// Fall back there so prerender succeeds; at runtime errors still propagate, so a
// transient DB failure is not cached as an empty result. Callers give a fallback
// a short cacheLife: that keeps the placeholder out of the prerendered shell and
// out of the cache, so the first request reads the real database.
async function withBuildFallback<T>(query: () => Promise<T[]>) {
  try {
    return { rows: await query(), isBuildFallback: false };
  } catch (error) {
    if (process.env.NEXT_PHASE === "phase-production-build") {
      return { rows: [] as T[], isBuildFallback: true };
    }
    throw error;
  }
}

export async function listPublishedManagedPosts() {
  "use cache";
  cacheTag(BLOG_CACHE_TAG);

  const { rows, isBuildFallback } = await withBuildFallback(() =>
    db
      .select()
      .from(blogPost)
      .where(eq(blogPost.status, "published"))
      .orderBy(desc(blogPost.publishedAt), desc(blogPost.updatedAt)),
  );
  if (isBuildFallback) {
    cacheLife("seconds");
  } else {
    cacheLife("hours");
  }

  return rows;
}

export async function getFeaturedPublishedPost() {
  "use cache";
  cacheTag(BLOG_CACHE_TAG);

  const { rows, isBuildFallback } = await withBuildFallback(() =>
    db
      .select()
      .from(blogPost)
      .where(and(eq(blogPost.status, "published"), eq(blogPost.featured, true)))
      .orderBy(desc(blogPost.publishedAt), desc(blogPost.updatedAt))
      .limit(1),
  );
  if (isBuildFallback) {
    cacheLife("seconds");
  } else {
    cacheLife("hours");
  }

  return rows[0] ?? null;
}

export async function getPublishedManagedPost(slug: string) {
  "use cache";
  cacheTag(BLOG_CACHE_TAG, `${BLOG_CACHE_TAG}:${slug}`);

  const { rows, isBuildFallback } = await withBuildFallback(() =>
    db
      .select()
      .from(blogPost)
      .where(and(eq(blogPost.slug, slug), eq(blogPost.status, "published")))
      .limit(1),
  );
  if (isBuildFallback) {
    cacheLife("seconds");
  } else {
    cacheLife("hours");
  }

  return rows[0] ?? null;
}

export function pickManagedPostCopy(post: ManagedBlogPost, locale: string) {
  if (locale === "ja" && post.titleJa.trim()) {
    return {
      title: post.titleJa.trim(),
      description: post.descriptionJa.trim() || post.description,
      body: post.bodyJa.trim() || post.body,
    };
  }

  return {
    title: post.title,
    description: post.description,
    body: post.body,
  };
}

export function toIsoDate(value: Date | string | null | undefined) {
  if (!value) {
    return new Date().toISOString().slice(0, 10);
  }
  const date = value instanceof Date ? value : new Date(value);
  return date.toISOString().slice(0, 10);
}
