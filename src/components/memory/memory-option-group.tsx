"use client";

import { cn } from "@/lib/utils";

export function MemoryOptionGroup<T extends string>({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: T;
  onChange: (value: T) => void;
  options: Array<{ value: T; label: string; description: string }>;
}) {
  return (
    <div className="space-y-2">
      <div className="text-sm font-medium">{label}</div>
      <div className="grid gap-2 sm:grid-cols-3">
        {options.map((option) => {
          const selected = option.value === value;
          return (
            <button
              key={option.value}
              type="button"
              onClick={() => onChange(option.value)}
              className={cn(
                "rounded-xl border p-3 text-left transition-colors",
                selected ? "border-foreground bg-accent" : "border-border hover:bg-accent/50",
              )}
            >
              <div className="text-sm font-medium">{option.label}</div>
              <div className="mt-1 text-xs text-muted-foreground">{option.description}</div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
