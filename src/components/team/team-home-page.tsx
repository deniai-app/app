"use client";

import { Pencil } from "lucide-react";
import { useExtracted } from "next-intl";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { TeamDeleteDialog } from "./team-delete-dialog";
import { TeamIconButton } from "./team-icon-button";
import { useTeamSettingsContext } from "./team-settings-context";
import { monthDayYearFormatter } from "./team-utils";

export function TeamHomePage() {
  const t = useExtracted();
  const {
    activeOrg,
    members,
    isAdmin,
    isOwner,
    orgNameDraft,
    setOrgNameDraft,
    isSavingOrgName,
    isSavingOrgLogo,
    handleUpdateOrgName,
    handleUpdateOrgLogo,
    handleRemoveOrgLogo,
    isDeleteDialogOpen,
    setIsDeleteDialogOpen,
    isDeletingOrg,
    handleDeleteOrg,
  } = useTeamSettingsContext();
  const [isEditingName, setIsEditingName] = useState(false);

  if (!activeOrg) {
    return null;
  }

  async function saveName() {
    await handleUpdateOrgName();
    setIsEditingName(false);
  }

  return (
    <div className="flex flex-col gap-4">
      <Card className="!pb-2">
        <CardHeader className="pb-3">
          <div className="flex items-start gap-3">
            <TeamIconButton
              logo={activeOrg.logo}
              isAdmin={isAdmin}
              isSaving={isSavingOrgLogo}
              onUpload={handleUpdateOrgLogo}
              onRemove={handleRemoveOrgLogo}
            />
            <div className="min-w-0 flex-1">
              {isEditingName ? (
                <div className="flex flex-wrap items-center gap-2">
                  <Input
                    autoFocus
                    className="h-8 w-56"
                    value={orgNameDraft}
                    onChange={(event) => setOrgNameDraft(event.target.value)}
                    onKeyDown={(event) => {
                      if (
                        event.key === "Enter" &&
                        !event.nativeEvent.isComposing &&
                        event.keyCode !== 229
                      ) {
                        saveName();
                      }
                    }}
                  />
                  <Button
                    size="sm"
                    disabled={isSavingOrgName || !orgNameDraft.trim()}
                    onClick={saveName}
                  >
                    {isSavingOrgName && <Spinner className="size-3.5" />}
                    {t("Save")}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setIsEditingName(false)}>
                    {t("Cancel")}
                  </Button>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <CardTitle className="text-base">{activeOrg.name}</CardTitle>
                  {isAdmin && (
                    <Button
                      size="icon"
                      variant="ghost"
                      className="size-6"
                      onClick={() => {
                        setOrgNameDraft(activeOrg.name);
                        setIsEditingName(true);
                      }}
                    >
                      <Pencil className="size-3.5" />
                    </Button>
                  )}
                </div>
              )}
              <CardDescription>
                {members.length} {members.length === 1 ? t("member") : t("members")}
                {activeOrg.slug && <span className="text-xs"> ({activeOrg.slug})</span>}
              </CardDescription>
            </div>
          </div>
        </CardHeader>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("Team overview")}</CardTitle>
          <CardDescription>{t("A quick summary of your team.")}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl border p-3">
              <p className="text-xs text-muted-foreground">{t("Members")}</p>
              <p className="mt-1 text-sm font-medium">{members.length}</p>
            </div>
            <div className="rounded-xl border p-3">
              <p className="text-xs text-muted-foreground">{t("Created")}</p>
              <p className="mt-1 text-sm font-medium">
                {monthDayYearFormatter.format(new Date(activeOrg.createdAt))}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {isOwner && (
        <Card className="border-destructive/40">
          <CardHeader>
            <CardTitle className="text-base text-destructive">{t("Danger Zone")}</CardTitle>
            <CardDescription>
              {t(
                "Deleting a team removes every member and cancels its subscription. This cannot be undone.",
              )}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="destructive" onClick={() => setIsDeleteDialogOpen(true)}>
              {t("Delete team")}
            </Button>
          </CardContent>
        </Card>
      )}

      <TeamDeleteDialog
        open={isDeleteDialogOpen}
        organizationName={activeOrg.name}
        onOpenChange={setIsDeleteDialogOpen}
        onConfirm={handleDeleteOrg}
        isDeleting={isDeletingOrg}
      />
    </div>
  );
}
