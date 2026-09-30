// components/ui/multi-select.tsx
import * as React from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

import { Button } from "@/components/ui/button";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import {
  Command,
  CommandGroup,
  CommandItem,
  CommandList,
  CommandEmpty,
} from "@/components/ui/command";
import { Badge } from "@/components/ui/badge";

export type MultiSelectOption = {
  label: string;
  value: string;
  icon?: React.ReactNode;
};

type MultiSelectProps = {
  options: MultiSelectOption[];
  value: string[];
  onChange: (value: string[]) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  emptyText?: string;
  maxBadges?: number;
};

export function MultiSelect({
  options,
  value,
  onChange,
  placeholder = "Select...",
  disabled,
  className,
  emptyText = "No results.",
  maxBadges = 2,
}: MultiSelectProps) {
  const [open, setOpen] = React.useState(false);
  const listId = React.useId();

  const toggleOption = (val: string) => {
    if (value.includes(val)) {
      onChange(value.filter((v) => v !== val));
    } else {
      onChange([...value, val]);
    }
  };

  // const clearAll = (e: React.MouseEvent) => {
  //   e.stopPropagation();
  //   onChange([]);
  // };

  const selectedOptions = options.filter((opt) => value.includes(opt.value));

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button
            type="button"
            variant="outline"
            role="combobox"
            aria-controls={listId}
            aria-expanded={open}
            disabled={disabled}
            className={cn(
              "w-full justify-between overflow-hidden",
              !selectedOptions.length && "text-muted-foreground",
              className,
            )}
          />
        }
      >
        <div className="flex items-center gap-2 overflow-hidden">
          {selectedOptions.length === 0 ? (
            <span className="truncate">{placeholder}</span>
          ) : (
            <>
              <div className="flex items-center gap-1 w-full">
                {selectedOptions.slice(0, maxBadges).map((opt) => (
                  <Badge
                    key={opt.value}
                    variant="secondary"
                    className="flex items-center gap-1 text-xs"
                  >
                    {opt.icon}
                    <span className="truncate max-w-[120px]">{opt.label}</span>
                  </Badge>
                ))}
                {selectedOptions.length > maxBadges && (
                  <span className="text-xs text-muted-foreground">
                    +{selectedOptions.length - maxBadges}
                  </span>
                )}
              </div>
            </>
          )}
        </div>
      </PopoverTrigger>

      <PopoverContent className="w-[260px] p-0" align="start">
        <Command>
          {/* 検索バー欲しければ CommandInput をここに追加 */}
          <CommandList id={listId}>
            <CommandEmpty>{emptyText}</CommandEmpty>
            <CommandGroup>
              {options.map((opt) => {
                const isSelected = value.includes(opt.value);
                return (
                  <CommandItem
                    key={opt.value}
                    onSelect={() => toggleOption(opt.value)}
                    className="flex items-center gap-2"
                  >
                    <span
                      className={cn(
                        "mr-2 flex size-4 items-center justify-center rounded-sm border",
                        isSelected ? "bg-primary text-primary-foreground" : "opacity-50",
                      )}
                    >
                      {isSelected && <Check className="size-3" />}
                    </span>
                    {opt.icon}
                    <span>{opt.label}</span>
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
