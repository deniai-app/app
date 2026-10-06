"use client";

import { useLocalizeError } from "@/hooks/use-localize-error";
import { fileToBase64 } from "@better-auth-ui/core";
import { useAuth, useSession, useUpdateUser } from "@better-auth-ui/react";
import { Trash2, Upload } from "lucide-react";
import { type ChangeEvent, useRef, useState } from "react";
import { toast } from "sonner";
import { UserAvatar } from "@/components/auth/user/user-avatar";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Field } from "@/components/ui/field";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";

export type ChangeAvatarProps = {
  className?: string;
};

export function ChangeAvatar({ className }: ChangeAvatarProps) {
  const localizeError = useLocalizeError();
  const { authClient, localization, avatar } = useAuth();
  const { data: session } = useSession(authClient);

  const { mutate: updateUser, isPending: updatePending } = useUpdateUser(authClient);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [action, setAction] = useState<"upload" | "delete" | null>(null);

  const isPending = updatePending || isUploading || isDeleting;

  async function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    e.target.value = "";

    setAction("upload");
    setIsUploading(true);

    try {
      const resized = (await avatar.resize?.(file, avatar.size, avatar.extension)) || file;

      const image = (await avatar.upload?.(resized)) || (await fileToBase64(resized));

      updateUser(
        { image },
        {
          onSuccess: () => toast.success(localization.settings.avatarChangedSuccess),
        },
      );
    } catch (error) {
      if (error instanceof Error) {
        toast.error(localizeError(error));
      }
    }

    setIsUploading(false);
  }

  async function handleDelete() {
    if (isPending) return;
    setAction("delete");
    const currentImage = session?.user.image;

    updateUser(
      { image: null },
      {
        onSuccess: async () => {
          if (currentImage) {
            setIsDeleting(true);
            try {
              await avatar.delete?.(currentImage);
            } catch {
              // Avatar delete is best-effort after the account image was cleared.
            }
            setIsDeleting(false);
          }

          toast.success(localization.settings.avatarDeletedSuccess);
        },
      },
    );
  }

  return (
    <Field className={className}>
      <Label>{localization.settings.avatar}</Label>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleFileChange}
      />

      <div className="flex items-center gap-4">
        <Button
          type="button"
          variant="ghost"
          className="p-0 h-auto w-auto rounded-full"
          disabled={isPending}
          onClick={() => fileInputRef.current?.click()}
        >
          <UserAvatar className="size-12" isPending={isPending} />
        </Button>

        <DropdownMenu
          open={isMenuOpen}
          onOpenChange={(open) => {
            if (!isPending) setIsMenuOpen(open);
          }}
        >
          <DropdownMenuTrigger
            className={cn(buttonVariants({ variant: "secondary", size: "sm" }))}
            disabled={!session || isPending}
          >
            {isPending && <Spinner />}

            {localization.settings.changeAvatar}
          </DropdownMenuTrigger>

          <DropdownMenuContent className="min-w-fit">
            <DropdownMenuItem
              closeOnClick={false}
              disabled={isPending}
              aria-busy={isPending && action === "upload"}
              onClick={() => fileInputRef.current?.click()}
            >
              {isPending && action === "upload" ? (
                <Spinner />
              ) : (
                <Upload className="text-muted-foreground" />
              )}

              {localization.settings.uploadAvatar}
            </DropdownMenuItem>

            <DropdownMenuItem
              variant="destructive"
              closeOnClick={false}
              disabled={isPending || !session?.user.image}
              aria-busy={isPending && action === "delete"}
              onClick={handleDelete}
            >
              {isPending && action === "delete" ? <Spinner /> : <Trash2 />}

              {localization.settings.deleteAvatar}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </Field>
  );
}
