"use client";

import { FolderKanban, Plus } from "lucide-react";
import { useExtracted } from "next-intl";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type ProjectOption = {
  id: string;
  name: string;
  color?: string | null;
  organizationName?: string | null;
};

const projectAccentMap: Record<string, string> = {
  amber: "bg-amber-500",
  rose: "bg-rose-500",
  sky: "bg-sky-500",
  emerald: "bg-emerald-500",
  violet: "bg-violet-500",
};

export function ProjectSelect({
  projects,
  value,
  onValueChange,
  onCreateClick,
  className,
}: {
  projects: ProjectOption[];
  value: string | null;
  onValueChange: (value: string | null) => void;
  onCreateClick?: () => void;
  className?: string;
}) {
  const t = useExtracted();

  return (
    <div className={cn("flex items-center gap-2", className)}>
      <Select
        value={value ?? "__none__"}
        onValueChange={(next) => onValueChange(next === "__none__" ? null : next)}
      >
        <SelectTrigger size="sm" className="min-w-44">
          <SelectValue placeholder={t("No project")}>
            <span className="flex items-center gap-2">
              <FolderKanban className="size-4" />
              <span className="truncate">
                {projects.find((project) => project.id === value)?.name ?? t("No project")}
              </span>
            </span>
          </SelectValue>
        </SelectTrigger>
        <SelectContent align="start">
          <SelectItem value="__none__">{t("No project")}</SelectItem>
          {projects.map((project) => (
            <SelectItem key={project.id} value={project.id}>
              <span className="flex items-center gap-2">
                <span
                  className={cn(
                    "size-2.5 rounded-full",
                    projectAccentMap[project.color ?? "amber"] ?? "bg-amber-500",
                  )}
                />
                <span className="truncate">{project.name}</span>
                {project.organizationName ? (
                  <span className="text-xs text-muted-foreground">{project.organizationName}</span>
                ) : null}
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {onCreateClick ? (
        <Button type="button" variant="outline" size="sm" onClick={onCreateClick}>
          <Plus className="size-4" />
          {t("New")}
        </Button>
      ) : null}
    </div>
  );
}
