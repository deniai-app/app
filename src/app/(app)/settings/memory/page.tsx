"use client";

import { useExtracted } from "next-intl";
import { useLocalizeError } from "@/hooks/use-localize-error";
import { useEffect, useReducer } from "react";
import { toast } from "sonner";
import { MemoryClearDialog } from "@/components/memory/memory-clear-dialog";
import { MemoryResponseStyleCard } from "@/components/memory/memory-response-style-card";
import { MemorySavedListCard } from "@/components/memory/memory-saved-list-card";
import {
  DEFAULT_PROFILE,
  type EmojiStyle,
  type Friendliness,
  memoryUiReducer,
  type ProfileState,
  type Tone,
  type Warmth,
} from "@/components/memory/memory-types";
import { SettingsPageShell } from "@/components/settings-page-shell";
import { usePlatformCapabilities } from "@/components/platform-capabilities-provider";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { trpc } from "@/lib/trpc/react";

export default function MemorySettingsPage() {
  const t = useExtracted();
  const localizeError = useLocalizeError();
  const { features } = usePlatformCapabilities();
  const utils = trpc.useUtils();
  const memoryQuery = trpc.memory.get.useQuery(undefined, { enabled: features.memory });
  const [memoryUi, dispatchMemoryUi] = useReducer(memoryUiReducer, {
    profile: DEFAULT_PROFILE,
    instructionsDraft: "",
    profileInitialized: false,
    newMemory: "",
    isClearDialogOpen: false,
  });
  const { profile, instructionsDraft, profileInitialized, newMemory, isClearDialogOpen } = memoryUi;

  useEffect(() => {
    if (!memoryQuery.isSuccess || !memoryQuery.data) {
      return;
    }

    const hasUnsavedInstructionChanges =
      profileInitialized && instructionsDraft !== profile.instructions;
    if (profileInitialized && hasUnsavedInstructionChanges) {
      return;
    }

    dispatchMemoryUi({
      type: "syncProfile",
      profile: {
        instructions: memoryQuery.data.profile.instructions,
        tone: memoryQuery.data.profile.tone as Tone,
        friendliness: memoryQuery.data.profile.friendliness as Friendliness,
        warmth: memoryQuery.data.profile.warmth as Warmth,
        emojiStyle: memoryQuery.data.profile.emojiStyle as EmojiStyle,
        autoMemory: memoryQuery.data.profile.autoMemory,
      },
    });
  }, [
    instructionsDraft,
    memoryQuery.data,
    memoryQuery.isSuccess,
    profile.instructions,
    profileInitialized,
  ]);

  const saveProfile = trpc.memory.upsertProfile.useMutation();

  const addItem = trpc.memory.addItem.useMutation({
    onSuccess: async () => {
      dispatchMemoryUi({ type: "setNewMemory", value: "" });
      await utils.memory.get.invalidate();
      toast.success(t("Memory added."));
    },
    onError: (error) => {
      toast.error(localizeError(error, t("Failed to add memory.")));
    },
  });

  const deleteItem = trpc.memory.deleteItem.useMutation({
    onSuccess: async () => {
      await utils.memory.get.invalidate();
      toast.success(t("Memory removed."));
    },
    onError: (error) => {
      toast.error(localizeError(error, t("Failed to remove memory.")));
    },
  });

  const clearItems = trpc.memory.clearItems.useMutation({
    onSuccess: async () => {
      dispatchMemoryUi({ type: "setClearDialogOpen", value: false });
      await utils.memory.get.invalidate();
      toast.success(t("All saved memories cleared."));
    },
    onError: (error) => {
      toast.error(localizeError(error, t("Failed to clear memories.")));
    },
  });

  const persistProfileInstant = (nextProfile: ProfileState) => {
    dispatchMemoryUi({ type: "setProfile", profile: nextProfile });
    saveProfile.mutate(
      {
        ...nextProfile,
        instructions: nextProfile.instructions,
      },
      {
        onError: (error) => {
          toast.error(localizeError(error, t("Failed to save personalization.")));
        },
      },
    );
  };

  const handleSaveProfile = () => {
    const nextProfile = {
      ...profile,
      instructions: instructionsDraft,
    };

    saveProfile.mutate(nextProfile, {
      onSuccess: async () => {
        dispatchMemoryUi({ type: "setProfile", profile: nextProfile });
        await utils.memory.get.invalidate();
        toast.success(t("Personalization saved."));
      },
      onError: (error) => {
        toast.error(localizeError(error, t("Failed to save personalization.")));
      },
    });
  };

  const hasMemoryLoadError = memoryQuery.isError || (!memoryQuery.isLoading && !memoryQuery.data);

  const handleAddMemory = () => {
    if (!newMemory.trim()) {
      return;
    }

    addItem.mutate({ content: newMemory });
  };

  const handleClearMemories = () => {
    if (clearItems.isPending) {
      return;
    }

    clearItems.mutate();
  };

  if (!features.memory) {
    return (
      <SettingsPageShell
        title={t("Personalize")}
        description={t("Control how Deni responds and what it remembers about you.")}
      >
        <Card>
          <CardHeader>
            <CardTitle>{t("Personalization unavailable")}</CardTitle>
            <CardDescription>
              {t("Personalization is disabled for this environment.")}
            </CardDescription>
          </CardHeader>
        </Card>
      </SettingsPageShell>
    );
  }

  return (
    <SettingsPageShell
      title={t("Personalize")}
      description={t("Control how Deni responds and what it remembers about you.")}
    >
      <MemoryResponseStyleCard
        status={memoryQuery.isLoading ? "loading" : hasMemoryLoadError ? "error" : "ready"}
        profile={profile}
        instructionsDraft={instructionsDraft}
        onInstructionsChange={(value) => dispatchMemoryUi({ type: "setInstructionsDraft", value })}
        onPersistProfile={persistProfileInstant}
        onSaveProfile={handleSaveProfile}
        pending={{ saving: saveProfile.isPending }}
      />

      <MemorySavedListCard
        status={memoryQuery.isLoading ? "loading" : hasMemoryLoadError ? "error" : "ready"}
        items={memoryQuery.data?.items ?? []}
        newMemory={newMemory}
        onNewMemoryChange={(value) => dispatchMemoryUi({ type: "setNewMemory", value })}
        onAddMemory={handleAddMemory}
        onDeleteItem={(id) => deleteItem.mutate({ id })}
        onClearClick={() => dispatchMemoryUi({ type: "setClearDialogOpen", value: true })}
        pending={{
          adding: addItem.isPending,
          deleting: deleteItem.isPending,
          clearing: clearItems.isPending,
        }}
      />

      <MemoryClearDialog
        open={isClearDialogOpen}
        onOpenChange={(open) => dispatchMemoryUi({ type: "setClearDialogOpen", value: open })}
        onConfirm={handleClearMemories}
        isPending={clearItems.isPending}
      />
    </SettingsPageShell>
  );
}
