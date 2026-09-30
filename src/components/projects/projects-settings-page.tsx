"use client";

import {
  Archive,
  ArchiveRestore,
  ExternalLink,
  FolderKanban,
  Plus,
  Trash2,
  Users,
} from "lucide-react";
import { useExtracted } from "next-intl";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { SettingsPageShell } from "@/components/settings-page-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { trpc } from "@/lib/trpc/react";

const projectColorClass: Record<string, string> = {
  amber: "bg-amber-500",
  rose: "bg-rose-500",
  sky: "bg-sky-500",
  emerald: "bg-emerald-500",
  violet: "bg-violet-500",
};

type ProjectRow = {
  id: string;
  name: string;
  description: string | null;
  color: string;
  archivedAt: Date | null;
  organizationId: string | null;
  organizationName: string | null;
  canManage: boolean;
};

function ProjectListRow({
  project,
  archived,
  onArchive,
  onRestore,
  onDelete,
  pending,
}: {
  project: ProjectRow;
  archived: boolean;
  onArchive: (id: string) => void;
  onRestore: (id: string) => void;
  onDelete: (id: string) => void;
  pending: boolean;
}) {
  const t = useExtracted();

  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border px-4 py-3 transition-colors hover:bg-muted/30">
      <div className="flex min-w-0 items-center gap-3">
        <span
          className={`size-2.5 shrink-0 rounded-full ${projectColorClass[project.color] ?? "bg-amber-500"}`}
        />
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <div className="truncate text-sm font-medium">{project.name}</div>
            {project.organizationName ? (
              <Badge variant="outline" className="gap-1 font-normal">
                <Users className="size-3" />
                {project.organizationName}
              </Badge>
            ) : null}
          </div>
          {project.description ? (
            <div className="truncate text-xs text-muted-foreground">{project.description}</div>
          ) : null}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <Button
          variant="ghost"
          size="sm"
          render={<Link href={`/projects/${project.id}`} />}
          nativeButton={false}
        >
          <ExternalLink className="size-3.5" />
          {t("Open")}
        </Button>
        {project.canManage && archived ? (
          <>
            <Button
              variant="ghost"
              size="sm"
              disabled={pending}
              onClick={() => onRestore(project.id)}
            >
              <ArchiveRestore className="size-3.5" />
              {t("Restore")}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="size-8 text-muted-foreground hover:text-destructive"
              aria-label={t("Delete project")}
              disabled={pending}
              onClick={() => {
                if (!window.confirm(t("Permanently delete this project?"))) return;
                onDelete(project.id);
              }}
            >
              <Trash2 className="size-3.5" />
            </Button>
          </>
        ) : null}
        {project.canManage && !archived ? (
          <Button
            variant="ghost"
            size="icon"
            className="size-8 text-muted-foreground"
            aria-label={t("Archive project")}
            disabled={pending}
            onClick={() => onArchive(project.id)}
          >
            <Archive className="size-3.5" />
          </Button>
        ) : null}
      </div>
    </div>
  );
}

export function ProjectsSettingsPage() {
  const t = useExtracted();
  const { push } = useRouter();
  const utils = trpc.useUtils();
  const [createScope, setCreateScope] = useState("__personal__");
  const projectsQuery = trpc.projects.list.useQuery({ includeArchived: true });
  const orgsQuery = trpc.projects.organizations.useQuery();

  const invalidate = async () => {
    await utils.projects.list.invalidate();
  };

  const createProject = trpc.projects.create.useMutation({
    onSuccess: async (project) => {
      await invalidate();
      if (project?.id) {
        push(`/projects/${project.id}`);
      }
    },
  });

  const archiveProject = trpc.projects.archive.useMutation({
    onSuccess: () => {
      void invalidate();
    },
  });

  const restoreProject = trpc.projects.restore.useMutation({
    onSuccess: () => {
      void invalidate();
    },
  });

  const deleteProject = trpc.projects.delete.useMutation({
    onSuccess: () => {
      void invalidate();
    },
  });

  const handleCreateProject = () => {
    createProject.mutate({
      name: t("New project"),
      description: null,
      instructions: "",
      color: "amber",
      organizationId: createScope === "__personal__" ? null : createScope,
    });
  };

  const allProjects = projectsQuery.data ?? [];
  const organizations = orgsQuery.data ?? [];
  const activeProjects = allProjects.filter((project) => !project.archivedAt);
  const archivedProjects = allProjects.filter((project) => project.archivedAt);
  const pending = archiveProject.isPending || restoreProject.isPending || deleteProject.isPending;

  const personalActive = activeProjects.filter((project) => !project.organizationId);
  const projectsByOrgId = new Map<string, typeof activeProjects>();
  for (const project of activeProjects) {
    if (!project.organizationId) continue;
    const grouped = projectsByOrgId.get(project.organizationId);
    if (grouped) {
      grouped.push(project);
    } else {
      projectsByOrgId.set(project.organizationId, [project]);
    }
  }
  const teamGroups: Array<{
    org: (typeof organizations)[number];
    projects: typeof activeProjects;
  }> = [];
  for (const org of organizations) {
    const projects = projectsByOrgId.get(org.id);
    if (projects && projects.length > 0) {
      teamGroups.push({ org, projects });
    }
  }

  return (
    <SettingsPageShell title={t("Projects")}>
      <Card className="min-w-0">
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="space-y-1">
              <CardTitle className="flex items-center gap-2">
                <FolderKanban className="size-4" />
                {t("Projects")}
              </CardTitle>
              <CardDescription>
                {t("Organize chats with custom instructions and a default model.")}
              </CardDescription>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {organizations.length > 0 ? (
                <Select
                  value={createScope}
                  onValueChange={(value) => {
                    if (value !== null) setCreateScope(value);
                  }}
                >
                  <SelectTrigger size="sm" className="min-w-40">
                    <SelectValue>
                      {createScope === "__personal__"
                        ? t("Personal")
                        : (organizations.find((org) => org.id === createScope)?.name ??
                          t("Personal"))}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__personal__">{t("Personal")}</SelectItem>
                    {organizations.map((org) => (
                      <SelectItem key={org.id} value={org.id}>
                        {org.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : null}
              <Button onClick={handleCreateProject} disabled={createProject.isPending}>
                {createProject.isPending ? <Spinner /> : <Plus className="size-4" />}
                {t("New project")}
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {projectsQuery.isLoading ? (
            <div className="flex min-h-32 items-center justify-center">
              <Spinner />
            </div>
          ) : activeProjects.length === 0 ? (
            <div className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
              {t("No projects yet. Create one to organize chats with custom context.")}
            </div>
          ) : (
            <>
              {personalActive.length > 0 ? (
                <div className="space-y-2">
                  {organizations.length > 0 ? (
                    <h2 className="text-sm font-medium text-muted-foreground">{t("Personal")}</h2>
                  ) : null}
                  {personalActive.map((project) => (
                    <ProjectListRow
                      key={project.id}
                      project={project}
                      archived={false}
                      pending={pending}
                      onArchive={(id) => archiveProject.mutate({ id })}
                      onRestore={(id) => restoreProject.mutate({ id })}
                      onDelete={(id) => deleteProject.mutate({ id })}
                    />
                  ))}
                </div>
              ) : null}
              {teamGroups.map((group) => (
                <div key={group.org.id} className="space-y-2">
                  <h2 className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                    <Users className="size-3.5" />
                    {group.org.name}
                  </h2>
                  {group.projects.map((project) => (
                    <ProjectListRow
                      key={project.id}
                      project={project}
                      archived={false}
                      pending={pending}
                      onArchive={(id) => archiveProject.mutate({ id })}
                      onRestore={(id) => restoreProject.mutate({ id })}
                      onDelete={(id) => deleteProject.mutate({ id })}
                    />
                  ))}
                </div>
              ))}
            </>
          )}

          {archivedProjects.length > 0 ? (
            <div className="space-y-2">
              <h2 className="text-sm font-medium text-muted-foreground">{t("Archived")}</h2>
              {archivedProjects.map((project) => (
                <ProjectListRow
                  key={project.id}
                  project={project}
                  archived
                  pending={pending}
                  onArchive={(id) => archiveProject.mutate({ id })}
                  onRestore={(id) => restoreProject.mutate({ id })}
                  onDelete={(id) => deleteProject.mutate({ id })}
                />
              ))}
            </div>
          ) : null}
        </CardContent>
      </Card>
    </SettingsPageShell>
  );
}
