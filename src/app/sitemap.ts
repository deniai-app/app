import type { MetadataRoute } from "next";
import { listPublishedManagedPosts } from "@/lib/blog/queries";
import { changelogEntries } from "@/lib/changelog";
import { absoluteUrl, hreflangLanguages } from "@/lib/locale-path";
import { PUBLIC_SITE_ORIGIN, publicPages } from "@/lib/public-pages";

function sitemapEntry(
  path: string,
  locale: "en" | "ja",
  lastModified: Date,
  changeFrequency: MetadataRoute.Sitemap[number]["changeFrequency"],
  priority: number,
): MetadataRoute.Sitemap[number] {
  return {
    url: absoluteUrl(path, locale),
    lastModified,
    changeFrequency,
    priority,
    alternates: {
      languages: hreflangLanguages(path),
    },
  };
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const lastModified = new Date("2026-08-16");
  const changelogModified = new Date(changelogEntries[0]?.date ?? lastModified);
  const managedPosts = await listPublishedManagedPosts().catch(() => []);
  const blogPaths = managedPosts.map((post) => ({
    path: `/blog/${post.slug}`,
    lastModified: post.updatedAt,
  }));

  const publicEntries = publicPages.flatMap((page) => {
    if (page.path === "/") {
      return [];
    }
    const modified = page.path === "/changelog" ? changelogModified : lastModified;
    return [
      sitemapEntry(page.path, "en", modified, page.changeFrequency, page.priority),
      sitemapEntry(page.path, "ja", modified, page.changeFrequency, page.priority),
    ];
  });

  const blogEntries = blogPaths.flatMap((entry) => [
    sitemapEntry(entry.path, "en", entry.lastModified, "monthly", 0.8),
    sitemapEntry(entry.path, "ja", entry.lastModified, "monthly", 0.8),
  ]);

  return [
    {
      url: PUBLIC_SITE_ORIGIN,
      lastModified,
      changeFrequency: "weekly",
      priority: 1,
      alternates: {
        languages: hreflangLanguages("/home"),
      },
    },
    ...publicEntries,
    ...blogEntries,
  ];
}
