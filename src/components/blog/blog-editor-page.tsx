"use client";

import { ArrowLeft, Save } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useExtracted } from "next-intl";
import { useLocalizeError } from "@/hooks/use-localize-error";
import { useState } from "react";
import { toast } from "sonner";
import { BlogEditorFields, type BlogEditorDraft } from "@/components/blog/blog-editor-fields";
import { SettingsPageShell } from "@/components/settings-page-shell";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { slugifyBlogTitle } from "@/lib/blog/slug";
import { trpc } from "@/lib/trpc/react";

const EMPTY_DRAFT: BlogEditorDraft = {
  slug: "",
  title: "",
  description: "",
  body: "",
  titleJa: "",
  descriptionJa: "",
  bodyJa: "",
  author: "Deni AI team",
};

function draftFromPost(post: BlogEditorDraft): BlogEditorDraft {
  return {
    slug: post.slug,
    title: post.title,
    description: post.description,
    body: post.body,
    titleJa: post.titleJa,
    descriptionJa: post.descriptionJa,
    bodyJa: post.bodyJa,
    author: post.author,
  };
}

export function BlogEditorPage({ postId }: { postId?: string }) {
  const t = useExtracted();
  const localizeError = useLocalizeError();
  const router = useRouter();
  const utils = trpc.useUtils();
  const isNew = !postId;
  const [edits, setEdits] = useState<BlogEditorDraft | null>(null);
  const [localeTab, setLocaleTab] = useState("en");
  const [mode, setMode] = useState("write");

  const canManage = trpc.blog.canManage.useQuery();
  const postQuery = trpc.blog.get.useQuery(
    { id: postId ?? "" },
    { enabled: Boolean(postId) && canManage.data === true },
  );

  const createPost = trpc.blog.create.useMutation({
    onSuccess: async (post) => {
      toast.success(t("Draft saved"));
      await utils.blog.list.invalidate();
      router.replace(`/settings/blog/${post.id}`);
    },
    onError: (error) => toast.error(localizeError(error)),
  });
  const updatePost = trpc.blog.update.useMutation({
    onSuccess: async () => {
      toast.success(t("Draft saved"));
      await Promise.all([
        utils.blog.list.invalidate(),
        postId ? utils.blog.get.invalidate({ id: postId }) : null,
      ]);
    },
    onError: (error) => toast.error(localizeError(error)),
  });
  const publishPost = trpc.blog.publish.useMutation({
    onSuccess: async () => {
      toast.success(t("Published"));
      await Promise.all([
        utils.blog.list.invalidate(),
        postId ? utils.blog.get.invalidate({ id: postId }) : null,
      ]);
    },
    onError: (error) => toast.error(localizeError(error)),
  });
  const setFeatured = trpc.blog.setFeatured.useMutation({
    onSuccess: async (post) => {
      toast.success(post.featured ? t("Featured on the homepage") : t("Removed from homepage"));
      await Promise.all([
        utils.blog.list.invalidate(),
        postId ? utils.blog.get.invalidate({ id: postId }) : null,
      ]);
    },
    onError: (error) => toast.error(localizeError(error)),
  });
  const unpublishPost = trpc.blog.unpublish.useMutation({
    onSuccess: async () => {
      toast.success(t("Moved to draft"));
      await Promise.all([
        utils.blog.list.invalidate(),
        postId ? utils.blog.get.invalidate({ id: postId }) : null,
      ]);
    },
    onError: (error) => toast.error(localizeError(error)),
  });

  const serverDraft = postQuery.data ? draftFromPost(postQuery.data) : EMPTY_DRAFT;
  const draft = edits ?? serverDraft;
  const isSaving = createPost.isPending || updatePost.isPending;
  const isPublishing = publishPost.isPending || unpublishPost.isPending;
  const status = postQuery.data?.status ?? "draft";

  const canSave = draft.title.trim().length > 0;

  const saveDraft = async () => {
    const payload = {
      ...draft,
      slug: slugifyBlogTitle(draft.slug || draft.title),
    };
    if (!payload.slug) {
      toast.error(t("Add a title or slug first."));
      return null;
    }
    setEdits(payload);
    if (isNew) {
      return createPost.mutateAsync(payload);
    }
    return updatePost.mutateAsync({ id: postId, ...payload });
  };

  if (canManage.isLoading || (postId && postQuery.isLoading)) {
    return (
      <div className="flex min-h-48 items-center justify-center">
        <Spinner className="size-5" />
      </div>
    );
  }

  if (!canManage.data) {
    return (
      <SettingsPageShell title={t("Blog")} description={t("You cannot edit blog posts.")}>
        <Button variant="outline" render={<Link href="/settings/blog" />} nativeButton={false}>
          {t("Back")}
        </Button>
      </SettingsPageShell>
    );
  }

  return (
    <SettingsPageShell
      title={isNew ? t("New post") : t("Edit post")}
      description={t(
        "English is required. Japanese is optional and used when a visitor reads the site in Japanese.",
      )}
      actions={
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" render={<Link href="/settings/blog" />} nativeButton={false}>
            <ArrowLeft className="size-4" />
            {t("All posts")}
          </Button>
          <Button
            variant="outline"
            disabled={!canSave || isSaving}
            onClick={() => void saveDraft()}
          >
            <Save className="size-4" />
            {isSaving ? t("Saving…") : t("Save draft")}
          </Button>
          {postId && status === "published" ? (
            <>
              <Button
                variant={postQuery.data?.featured ? "secondary" : "outline"}
                disabled={setFeatured.isPending}
                onClick={() =>
                  setFeatured.mutate({
                    id: postId,
                    featured: !postQuery.data?.featured,
                  })
                }
              >
                {postQuery.data?.featured ? t("Unfeature") : t("Feature on homepage")}
              </Button>
              <Button
                variant="outline"
                disabled={isPublishing}
                onClick={() => unpublishPost.mutate({ id: postId })}
              >
                {t("Unpublish")}
              </Button>
            </>
          ) : null}
          {postId ? (
            <Button
              disabled={isPublishing || isSaving}
              onClick={() => {
                void saveDraft()
                  .then((saved) => {
                    if (saved) {
                      publishPost.mutate({ id: saved.id });
                    }
                  })
                  .catch(() => undefined);
              }}
            >
              {t("Publish")}
            </Button>
          ) : null}
        </div>
      }
    >
      <div className="space-y-5">
        <BlogEditorFields
          draft={draft}
          lockSlugInitially={!isNew}
          localeTab={localeTab}
          mode={mode}
          onDraftChange={(updater) => {
            setEdits((current) => updater(current ?? serverDraft));
          }}
          onLocaleTabChange={setLocaleTab}
          onModeChange={setMode}
        />
        {status === "published" && postQuery.data ? (
          <p className="text-xs text-muted-foreground">
            {t("Live at")}{" "}
            <Link
              href={`/blog/${postQuery.data.slug}`}
              className="underline-offset-4 hover:underline"
            >
              /blog/{postQuery.data.slug}
            </Link>
          </p>
        ) : null}
      </div>
    </SettingsPageShell>
  );
}
