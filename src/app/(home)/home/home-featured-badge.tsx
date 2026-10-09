import { getExtracted, getLocale } from "next-intl/server";
import { getBlogPostPath } from "@/lib/blog/posts";
import { getFeaturedPublishedPost, pickManagedPostCopy } from "@/lib/blog/queries";
import { HomeFeaturedBadgeLink } from "./home-featured-badge-link";

export async function HomeFeaturedBadge() {
  // The badge is optional; an unreachable DB (e.g. the CI image build) must not fail prerender.
  const post = await getFeaturedPublishedPost().catch(() => null);
  if (!post) {
    return null;
  }

  const locale = await getLocale();
  const t = await getExtracted();
  const copy = pickManagedPostCopy(post, locale);

  return (
    <HomeFeaturedBadgeLink
      href={getBlogPostPath(post.slug)}
      label={t("Featured")}
      title={copy.title}
    />
  );
}
