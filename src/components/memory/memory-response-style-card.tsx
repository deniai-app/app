"use client";

import { Save } from "lucide-react";
import { useExtracted } from "next-intl";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { MemoryOptionGroup } from "./memory-option-group";
import type { EmojiStyle, Friendliness, ProfileState, Tone, Warmth } from "./memory-types";

type MemoryResponseStyleCardProps = {
  status: "loading" | "error" | "ready";
  profile: ProfileState;
  instructionsDraft: string;
  onInstructionsChange: (value: string) => void;
  onPersistProfile: (nextProfile: ProfileState) => void;
  onSaveProfile: () => void;
  pending: {
    saving?: boolean;
  };
};

export function MemoryResponseStyleCard({
  status,
  profile,
  instructionsDraft,
  onInstructionsChange,
  onPersistProfile,
  onSaveProfile,
  pending,
}: MemoryResponseStyleCardProps) {
  const t = useExtracted();
  const isSaving = Boolean(pending.saving);

  const toneOptions = [
    {
      value: "concise" as Tone,
      label: t("Concise"),
      description: t("Short and direct replies"),
    },
    {
      value: "balanced" as Tone,
      label: t("Balanced"),
      description: t("A practical mix of brevity and detail"),
    },
    {
      value: "detailed" as Tone,
      label: t("Detailed"),
      description: t("More explanation and extra context"),
    },
  ];

  const friendlinessOptions = [
    {
      value: "neutral" as Friendliness,
      label: t("Neutral"),
      description: t("More matter-of-fact and restrained"),
    },
    {
      value: "friendly" as Friendliness,
      label: t("Friendly"),
      description: t("Approachable without being overly casual"),
    },
    {
      value: "very-friendly" as Friendliness,
      label: t("Very friendly"),
      description: t("More upbeat and personable"),
    },
  ];

  const warmthOptions = [
    {
      value: "neutral" as Warmth,
      label: t("Neutral"),
      description: t("Low emotional color"),
    },
    {
      value: "warm" as Warmth,
      label: t("Warm"),
      description: t("Supportive and human"),
    },
    {
      value: "very-warm" as Warmth,
      label: t("Very warm"),
      description: t("Extra empathetic and soft"),
    },
  ];

  const emojiOptions = [
    {
      value: "none" as EmojiStyle,
      label: t("None"),
      description: t("Never use emoji"),
    },
    {
      value: "light" as EmojiStyle,
      label: t("Light"),
      description: t("Use emoji occasionally"),
    },
    {
      value: "expressive" as EmojiStyle,
      label: t("Expressive"),
      description: t("Emoji are welcome"),
    },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("Response Style")}</CardTitle>
        <CardDescription>
          {t("Shape the assistant's tone, warmth, friendliness, and emoji usage.")}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {status === "loading" ? (
          <div className="flex items-center justify-center py-8">
            <Spinner />
          </div>
        ) : status === "error" ? (
          <div className="rounded-xl border border-dashed p-6 text-sm text-muted-foreground">
            {t("Unable to load personalization right now.")}
          </div>
        ) : (
          <>
            <MemoryOptionGroup
              label={t("Tone")}
              value={profile.tone}
              onChange={(tone) => {
                if (tone === profile.tone) {
                  return;
                }
                onPersistProfile({ ...profile, tone });
              }}
              options={toneOptions}
            />
            <MemoryOptionGroup
              label={t("Friendliness")}
              value={profile.friendliness}
              onChange={(friendliness) => {
                if (friendliness === profile.friendliness) {
                  return;
                }
                onPersistProfile({ ...profile, friendliness });
              }}
              options={friendlinessOptions}
            />
            <MemoryOptionGroup
              label={t("Warmth")}
              value={profile.warmth}
              onChange={(warmth) => {
                if (warmth === profile.warmth) {
                  return;
                }
                onPersistProfile({ ...profile, warmth });
              }}
              options={warmthOptions}
            />
            <MemoryOptionGroup
              label={t("Emoji")}
              value={profile.emojiStyle}
              onChange={(emojiStyle) => {
                if (emojiStyle === profile.emojiStyle) {
                  return;
                }
                onPersistProfile({ ...profile, emojiStyle });
              }}
              options={emojiOptions}
            />

            <div className="space-y-2">
              <div className="text-sm font-medium">{t("Instructions")}</div>
              <Textarea
                value={instructionsDraft}
                onChange={(event) => onInstructionsChange(event.target.value)}
                rows={7}
                maxLength={4000}
                placeholder={t(
                  "Reply in Japanese by default. Prefer practical implementation advice. When giving code suggestions, favor Next.js App Router and TypeScript strict mode.",
                )}
              />
            </div>

            <div className="flex items-center justify-between rounded-xl border p-4">
              <div className="space-y-1">
                <div className="text-sm font-medium">{t("Auto-save memories")}</div>
                <div className="text-xs text-muted-foreground">
                  {t("Let AI automatically save durable preferences or facts from your chats.")}
                </div>
              </div>
              <Switch
                checked={profile.autoMemory}
                onCheckedChange={(autoMemory) => onPersistProfile({ ...profile, autoMemory })}
              />
            </div>

            <div className="flex justify-end">
              <Button onClick={onSaveProfile} disabled={isSaving}>
                {isSaving ? <Spinner /> : <Save className="size-4" />}
                {t("Save")}
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
