"use client";

import { useExtracted } from "next-intl";
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
import { Spinner } from "@/components/ui/spinner";
import type { Member } from "./team-types";

export function TeamRemoveMemberDialog({
  member,
  onOpenChange,
  onConfirm,
  isRemoving,
}: {
  member: Member | null;
  onOpenChange: (open: boolean) => void;
  onConfirm: (memberId: string) => void;
  isRemoving: boolean;
}) {
  const t = useExtracted();

  return (
    <AlertDialog
      open={!!member}
      onOpenChange={(open) => {
        if (isRemoving) return;
        onOpenChange(open);
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("Remove member?")}</AlertDialogTitle>
          <AlertDialogDescription>
            {t("This will remove {name} from the team.", {
              name: member?.user.name ?? member?.user.email ?? "",
            })}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isRemoving}>{t("Cancel")}</AlertDialogCancel>
          <AlertDialogAction
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            disabled={isRemoving}
            onClick={() => {
              if (member) onConfirm(member.id);
            }}
          >
            {isRemoving && <Spinner className="size-3.5" />}
            {t("Remove")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
