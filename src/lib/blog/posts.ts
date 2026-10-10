export const BLOG_ORIGIN = "https://deniai.app";

export const RESERVED_BLOG_SLUGS = new Set<string>([
  "rss.xml",
  "new",
  // Keep the retired BYOK article slug unavailable to managed posts.
  "platform-vs-own-api-key",
]);

export function getBlogPostPath(slug: string) {
  return `/blog/${slug}`;
}

export function getBlogPostUrl(slug: string) {
  return `${BLOG_ORIGIN}${getBlogPostPath(slug)}`;
}

export function createBlogPostingJsonLd({
  headline,
  description,
  slug,
  date,
}: {
  headline: string;
  description: string;
  slug: string;
  date: string;
}) {
  const url = getBlogPostUrl(slug);
  return {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline,
    description,
    datePublished: date,
    dateModified: date,
    author: {
      "@type": "Organization",
      name: "Deni AI",
      url: BLOG_ORIGIN,
    },
    publisher: {
      "@type": "Organization",
      name: "Deni AI",
      url: BLOG_ORIGIN,
      logo: {
        "@type": "ImageObject",
        url: `${BLOG_ORIGIN}/og.png`,
      },
    },
    mainEntityOfPage: {
      "@type": "WebPage",
      "@id": url,
    },
    url,
  };
}
