"use client";

import { FilePlus2, Newspaper, Pencil, Star, Trash2 } from "lucide-react";
import Link from "next/link";
import { useExtracted, useLocale } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";
import { SettingsPageShell } from "@/components/settings-page-shell";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { formatAppDate } from "@/lib/format-date";
import { trpc } from "@/lib/trpc/react";

export function BlogSettingsPage() {
  const t = useExtracted();
  const locale = useLocale();
  const utils = trpc.useUtils();
  const canManage = trpc.blog.canManage.useQuery();
  const postsQuery = trpc.blog.list.useQuery(undefined, {
    enabled: canManage.data === true,
  });
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const setFeatured = trpc.blog.setFeatured.useMutation({
    onSuccess: async (post) => {
      toast.success(post.featured ? t("Featured on the homepage") : t("Removed from homepage"));
      await utils.blog.list.invalidate();
    },
    onError: (error) => toast.error(error.message),
  });

  const deletePost = trpc.blog.delete.useMutation({
    onSuccess: async () => {
      toast.success(t("Post deleted"));
      setDeleteId(null);
      await utils.blog.list.invalidate();
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  if (canManage.isLoading) {
    return (
      <div className="flex min-h-48 items-center justify-center">
        <Spinner className="size-5" />
      </div>
    );
  }

  if (!canManage.data) {
    return (
      <SettingsPageShell
        title={t("Blog")}
        description={t("Only configured admin accounts can publish posts from the web.")}
      >
        <p className="text-sm text-muted-foreground">
          {t(
            "Ask an administrator to add your account email to BLOG_ADMIN_EMAILS or AFFILIATE_ADMIN_EMAILS.",
          )}
        </p>
      </SettingsPageShell>
    );
  }

  return (
    <SettingsPageShell
      title={t("Blog")}
      description={t("Write, preview, and publish public articles without a code change.")}
      actions={
        <Button render={<Link href="/settings/blog/new" />} nativeButton={false}>
          <FilePlus2 className="size-4" />
          {t("New post")}
        </Button>
      }
    >
      {postsQuery.isLoading ? (
        <div className="flex justify-center py-12">
          <Spinner className="size-5" />
        </div>
      ) : postsQuery.data?.length ? (
        <div className="space-y-3">
          {postsQuery.data.map((post) => (
            <article
              key={post.id}
              className="flex flex-col gap-3 rounded-2xl border border-border p-4 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="truncate text-sm font-semibold">{post.title || t("Untitled")}</h2>
                  <Badge variant={post.status === "published" ? "default" : "secondary"}>
                    {post.status === "published" ? t("Published") : t("Draft")}
                  </Badge>
                  {post.featured ? <Badge variant="outline">{t("Featured")}</Badge> : null}
                </div>
                <p className="mt-1 text-xs text-muted-foreground">/{post.slug}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {formatAppDate(post.updatedAt, locale)}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {post.status === "published" ? (
                  <>
                    <Button
                      variant={post.featured ? "secondary" : "outline"}
                      size="sm"
                      disabled={setFeatured.isPending}
                      onClick={() => setFeatured.mutate({ id: post.id, featured: !post.featured })}
                    >
                      <Star className={post.featured ? "size-3.5 fill-current" : "size-3.5"} />
                      {post.featured ? t("Unfeature") : t("Feature")}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      render={<Link href={`/blog/${post.slug}`} target="_blank" />}
                      nativeButton={false}
                    >
                      {t("View")}
                    </Button>
                  </>
                ) : null}
                <Button
                  variant="outline"
                  size="sm"
                  render={<Link href={`/settings/blog/${post.id}`} />}
                  nativeButton={false}
                >
                  <Pencil className="size-3.5" />
                  {t("Edit")}
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                  onClick={() => setDeleteId(post.id)}
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="rounded-2xl border border-dashed border-border px-6 py-12 text-center">
          <Newspaper className="mx-auto size-8 text-muted-foreground" />
          <p className="mt-4 text-sm font-medium">{t("No managed posts yet")}</p>
          <p className="mt-2 text-sm text-muted-foreground">
            {t("Create a draft, add English and optional Japanese copy, then publish it to /blog.")}
          </p>
        </div>
      )}

      <AlertDialog
        open={Boolean(deleteId)}
        onOpenChange={(open) => {
          if (!open && !deletePost.isPending) {
            setDeleteId(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("Delete this post?")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("This removes the article from the public blog. This cannot be undone.")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deletePost.isPending}>{t("Cancel")}</AlertDialogCancel>
            <AlertDialogAction
              disabled={deletePost.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (deleteId) {
                  deletePost.mutate({ id: deleteId });
                }
              }}
            >
              {deletePost.isPending && <Spinner data-icon="inline-start" />}
              {t("Delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </SettingsPageShell>
  );
}
