"use client";

import { useExtracted } from "next-intl";
import { useState } from "react";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";

export function TeamDeleteDialog({
  open,
  organizationName,
  onOpenChange,
  onConfirm,
  isDeleting,
}: {
  open: boolean;
  organizationName: string;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  isDeleting: boolean;
}) {
  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        if (isDeleting) return;
        onOpenChange(next);
      }}
    >
      <TeamDeleteDialogBody
        key={open ? organizationName : "closed"}
        organizationName={organizationName}
        onConfirm={onConfirm}
        isDeleting={isDeleting}
      />
    </AlertDialog>
  );
}

function TeamDeleteDialogBody({
  organizationName,
  onConfirm,
  isDeleting,
}: {
  organizationName: string;
  onConfirm: () => void;
  isDeleting: boolean;
}) {
  const t = useExtracted();
  const [confirmText, setConfirmText] = useState("");
  const isConfirmed = confirmText.trim() === organizationName;

  return (
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogTitle>{t("Delete team?")}</AlertDialogTitle>
        <AlertDialogDescription>
          {t(
            "This permanently deletes {name}, removes every member, and cancels the team subscription. This cannot be undone.",
            { name: organizationName },
          )}
        </AlertDialogDescription>
      </AlertDialogHeader>
      <div className="space-y-2 py-2">
        <Label htmlFor="team-delete-confirm">
          {t("Type {name} to confirm.", { name: organizationName })}
        </Label>
        <Input
          id="team-delete-confirm"
          autoComplete="off"
          disabled={isDeleting}
          value={confirmText}
          onChange={(event) => setConfirmText(event.target.value)}
        />
      </div>
      <AlertDialogFooter>
        <AlertDialogCancel disabled={isDeleting}>{t("Cancel")}</AlertDialogCancel>
        <AlertDialogAction
          className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          disabled={isDeleting || !isConfirmed}
          onClick={onConfirm}
        >
          {isDeleting && <Spinner className="size-3.5" />}
          {t("Delete team")}
        </AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  );
}
