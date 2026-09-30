"use client";

import { ArchiveIcon, MessageSquareIcon, PlusIcon, SaveIcon, UsersIcon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useExtracted } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { useAvailableModels } from "@/hooks/use-available-models";
import { useNewChat } from "@/hooks/use-new-chat";
import { trpc } from "@/lib/trpc/react";

interface ProjectPageProps {
  projectId: string;
  initialProjectName: string;
}

function ProjectChatList({
  chats,
  isLoading,
  isStartingChat,
  onNewChat,
}: {
  chats: Array<{ id: string; title: string | null }>;
  isLoading: boolean;
  isStartingChat: boolean;
  onNewChat: () => void;
}) {
  return (
    <aside className="flex w-64 shrink-0 flex-col gap-3 p-4 overflow-y-auto">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-muted-foreground">Chats</span>
        <Button
          size="sm"
          variant="ghost"
          className="h-7 gap-1 px-2 text-xs"
          onClick={onNewChat}
          disabled={isStartingChat}
        >
          {isStartingChat ? <Spinner className="size-3.5" /> : <PlusIcon className="size-3.5" />}
          New chat
        </Button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-6">
          <Spinner />
        </div>
      ) : chats.length === 0 ? (
        <p className="text-xs text-muted-foreground">No chats yet.</p>
      ) : (
        <ul className="space-y-1">
          {chats.map((chat) => (
            <li key={chat.id}>
              <Link
                href={`/chat/${chat.id}`}
                className="block truncate rounded-lg px-2 py-1.5 text-sm hover:bg-muted/60 transition-colors"
              >
                {chat.title ?? "Untitled chat"}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </aside>
  );
}

export function ProjectPage({ projectId, initialProjectName }: ProjectPageProps) {
  const t = useExtracted();
  const { push } = useRouter();
  const utils = trpc.useUtils();
  const { availableModels } = useAvailableModels();

  const projectQuery = trpc.projects.get.useQuery({ id: projectId });
  const chatsQuery = trpc.projects.getProjectChats.useQuery({ projectId });
  const orgsQuery = trpc.projects.organizations.useQuery();

  const project = projectQuery.data?.project;
  const chats = chatsQuery.data ?? [];

  const [name, setName] = useState(project?.name ?? initialProjectName);
  const [description, setDescription] = useState(project?.description ?? "");
  const [instructions, setInstructions] = useState(project?.instructions ?? "");
  const [defaultModel, setDefaultModel] = useState(project?.defaultModel ?? "");

  // Sync form when data loads
  const dataLoaded = !projectQuery.isLoading && project;
  const [synced, setSynced] = useState(false);
  if (dataLoaded && !synced) {
    setName(project.name);
    setDescription(project.description ?? "");
    setInstructions(project.instructions);
    setDefaultModel(project.defaultModel ?? "");
    setSynced(true);
  }

  const updateProject = trpc.projects.update.useMutation({
    onSuccess: () => {
      toast.success(t("Project saved"));
      void utils.projects.list.invalidate();
      void utils.projects.get.invalidate({ id: projectId });
    },
  });

  const archiveProject = trpc.projects.archive.useMutation({
    onSuccess: () => {
      toast.success(t("Project archived"));
      void utils.projects.list.invalidate();
      push("/settings/projects");
    },
  });

  const shareProject = trpc.projects.share.useMutation({
    onSuccess: () => {
      toast.success(t("Project shared with the team."));
      void utils.projects.list.invalidate();
      void utils.projects.get.invalidate({ id: projectId });
    },
  });

  const unshareProject = trpc.projects.unshare.useMutation({
    onSuccess: () => {
      toast.success(t("Project is personal again."));
      void utils.projects.list.invalidate();
      void utils.projects.get.invalidate({ id: projectId });
    },
  });

  const canManage = project?.canManage ?? false;
  const organizations = orgsQuery.data ?? [];

  const startNewChat = useNewChat();
  const [isStartingChat, setIsStartingChat] = useState(false);
  const handleNewProjectChat = () => {
    if (isStartingChat) return;
    setIsStartingChat(true);
    startNewChat({ projectId });
  };

  const handleSave = () => {
    updateProject.mutate({
      id: projectId,
      name: name.trim() || initialProjectName,
      description: description.trim() || null,
      instructions,
      color: project?.color ?? "amber",
      defaultModel: defaultModel || null,
    });
  };

  return (
    <div className="flex h-full min-h-0 divide-x">
      <ProjectChatList
        chats={chats}
        isLoading={chatsQuery.isLoading}
        isStartingChat={isStartingChat}
        onNewChat={handleNewProjectChat}
      />

      {/* Project settings */}
      <main className="flex flex-1 min-w-0 flex-col gap-6 overflow-y-auto p-6">
        <section className="space-y-4">
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <MessageSquareIcon className="size-4" />
            {t("Project settings")}
            {project?.organizationName ? (
              <Badge variant="outline" className="gap-1 font-normal">
                <UsersIcon className="size-3" />
                {project.organizationName}
              </Badge>
            ) : null}
          </h2>

          <div className="space-y-2">
            <Label htmlFor="proj-name">{t("Name")}</Label>
            <Input
              id="proj-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("Project name")}
              disabled={!canManage}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="proj-desc">{t("Description")}</Label>
            <Input
              id="proj-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t("Short description (optional)")}
              disabled={!canManage}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="proj-instructions">{t("Custom instructions")}</Label>
            <Textarea
              id="proj-instructions"
              rows={8}
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              placeholder={t(
                "Tell the AI how to behave in this project — goals, tone, constraints, output format, etc.",
              )}
              disabled={!canManage}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="proj-model">{t("Default model")}</Label>
            <Select
              value={defaultModel || "__none__"}
              onValueChange={(value) => {
                if (value !== null) setDefaultModel(value === "__none__" ? "" : value);
              }}
              disabled={!canManage}
            >
              <SelectTrigger id="proj-model">
                <SelectValue placeholder={t("Use the usual chat model")}>
                  {availableModels.find((model) => model.value === defaultModel)?.name ??
                    t("Use the usual chat model")}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">{t("Use the usual chat model")}</SelectItem>
                {availableModels.map((model) => (
                  <SelectItem key={model.value} value={model.value}>
                    {model.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              {t("New chats in this project start with this model. You can still switch per chat.")}
            </p>
          </div>

          {canManage && organizations.length > 0 ? (
            <div className="space-y-2">
              <Label htmlFor="proj-share">{t("Team sharing")}</Label>
              <Select
                value={project?.organizationId ?? "__personal__"}
                onValueChange={(value) => {
                  if (value === "__personal__") {
                    unshareProject.mutate({ id: projectId });
                    return;
                  }
                  if (value !== null) shareProject.mutate({ id: projectId, organizationId: value });
                }}
              >
                <SelectTrigger id="proj-share">
                  <SelectValue>
                    {project?.organizationId
                      ? (organizations.find((org) => org.id === project.organizationId)?.name ??
                        t("Only you"))
                      : t("Only you")}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__personal__">{t("Only you")}</SelectItem>
                  {organizations.map((org) => (
                    <SelectItem key={org.id} value={org.id}>
                      {org.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                {t(
                  "Team members get the project instructions and default model. Their chats stay private.",
                )}
              </p>
            </div>
          ) : null}

          {canManage ? (
            <div className="flex flex-wrap justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                disabled={
                  archiveProject.isPending ||
                  Boolean(project?.archivedAt) ||
                  shareProject.isPending ||
                  unshareProject.isPending
                }
                onClick={() => {
                  if (!window.confirm(t("Archive this project?"))) return;
                  archiveProject.mutate({ id: projectId });
                }}
              >
                {archiveProject.isPending ? <Spinner /> : <ArchiveIcon className="size-4" />}
                {t("Archive")}
              </Button>
              <Button onClick={handleSave} disabled={updateProject.isPending}>
                {updateProject.isPending ? <Spinner /> : <SaveIcon className="size-4" />}
                {t("Save")}
              </Button>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">
              {t("You can use this team project. Only owners, admins, or the creator can edit it.")}
            </p>
          )}
        </section>
      </main>
    </div>
  );
}
