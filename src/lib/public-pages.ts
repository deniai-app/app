import type { MetadataRoute } from "next";

export type PublicPage = {
  path: string;
  changeFrequency: NonNullable<MetadataRoute.Sitemap[number]["changeFrequency"]>;
  priority: number;
};

export const PUBLIC_SITE_ORIGIN = "https://deniai.app";

/** Marketing and legal URLs that should appear in the sitemap. */
export const publicPages: PublicPage[] = [
  { path: "/", changeFrequency: "weekly", priority: 1 },
  { path: "/home", changeFrequency: "weekly", priority: 1 },
  { path: "/flixa", changeFrequency: "monthly", priority: 0.8 },
  { path: "/desktop", changeFrequency: "weekly", priority: 0.8 },
  { path: "/models", changeFrequency: "weekly", priority: 0.8 },
  { path: "/about", changeFrequency: "monthly", priority: 0.7 },
  { path: "/contact", changeFrequency: "monthly", priority: 0.7 },
  { path: "/faq", changeFrequency: "monthly", priority: 0.85 },
  { path: "/use-cases", changeFrequency: "monthly", priority: 0.8 },
  { path: "/blog", changeFrequency: "weekly", priority: 0.9 },
  { path: "/guides", changeFrequency: "weekly", priority: 0.9 },
  { path: "/guides/model-selection", changeFrequency: "monthly", priority: 0.85 },
  { path: "/guides/verify-ai-answers", changeFrequency: "monthly", priority: 0.85 },
  { path: "/guides/multi-model-workflows", changeFrequency: "monthly", priority: 0.85 },
  { path: "/guides/prompt-patterns", changeFrequency: "monthly", priority: 0.85 },
  { path: "/guides/study-with-ai", changeFrequency: "monthly", priority: 0.85 },
  { path: "/guides/privacy-when-using-ai", changeFrequency: "monthly", priority: 0.85 },
  { path: "/guides/free-ai-chat", changeFrequency: "monthly", priority: 0.85 },
  { path: "/changelog", changeFrequency: "weekly", priority: 0.8 },
  { path: "/legal/terms", changeFrequency: "yearly", priority: 0.3 },
  { path: "/legal/privacy-policy", changeFrequency: "yearly", priority: 0.3 },
  { path: "/legal/tokusho", changeFrequency: "yearly", priority: 0.3 },
];
