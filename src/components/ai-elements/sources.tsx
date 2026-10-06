"use client";

import { useExtracted } from "next-intl";
import type { ComponentProps } from "react";

import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { toSafeHref } from "@/lib/safe-href";
import { cn } from "@/lib/utils";
import { BookIcon, ChevronDownIcon } from "lucide-react";

export type SourcesProps = ComponentProps<"div">;

export const Sources = ({ className, ...props }: SourcesProps) => (
  <Collapsible className={cn("not-prose mb-4 text-primary text-xs", className)} {...props} />
);

export type SourcesTriggerProps = ComponentProps<typeof CollapsibleTrigger> & {
  count: number;
};

export const SourcesTrigger = ({ className, count, children, ...props }: SourcesTriggerProps) => {
  const t = useExtracted();
  return (
    <CollapsibleTrigger className={cn("flex items-center gap-2", className)} {...props}>
      {children ?? (
        <>
          <p className="font-medium">{t("Used {count} sources", { count: String(count) })}</p>
          <ChevronDownIcon className="size-4" />
        </>
      )}
    </CollapsibleTrigger>
  );
};

export type SourcesContentProps = ComponentProps<typeof CollapsibleContent>;

export const SourcesContent = ({ className, ...props }: SourcesContentProps) => (
  <CollapsibleContent
    className={cn(
      "mt-3 flex w-fit flex-col gap-2",
      "data-closed:fade-out-0 data-closed:slide-out-to-top-2 data-open:slide-in-from-top-2 outline-none data-closed:animate-out data-open:animate-in",
      className,
    )}
    {...props}
  />
);

export type SourceProps = ComponentProps<"a">;

export const Source = ({ href, title, children, ...props }: SourceProps) => (
  <a
    className="flex items-center gap-2"
    href={toSafeHref(href)}
    rel="noreferrer"
    target="_blank"
    {...props}
  >
    {children ?? (
      <>
        <BookIcon className="size-4" />
        <span className="block font-medium">{title}</span>
      </>
    )}
  </a>
);
