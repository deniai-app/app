"use client";

import { Pencil, Trash2, Upload, Users } from "lucide-react";
import Image from "next/image";
import { useExtracted } from "next-intl";
import { type ChangeEvent, useRef } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Spinner } from "@/components/ui/spinner";

export function TeamIconButton({
  logo,
  isAdmin,
  isSaving,
  onUpload,
  onRemove,
}: {
  logo: string | null;
  isAdmin: boolean;
  isSaving: boolean;
  onUpload: (file: File) => void;
  onRemove: () => void;
}) {
  const t = useExtracted();
  const fileInputRef = useRef<HTMLInputElement>(null);

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (file) onUpload(file);
  }

  return (
    <div className="relative shrink-0">
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleFileChange}
      />
      <div className="relative flex size-10 items-center justify-center overflow-hidden rounded-lg bg-primary/10">
        {logo ? (
          <Image
            src={logo}
            alt=""
            className="size-full object-cover"
            width={40}
            height={40}
            sizes="40px"
            unoptimized
          />
        ) : (
          <Users className="size-5 text-primary" />
        )}
        {isSaving && (
          <div className="absolute inset-0 flex items-center justify-center bg-background/70">
            <Spinner className="size-4" />
          </div>
        )}
      </div>
      {isAdmin && (
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                size="icon"
                variant="secondary"
                className="absolute -bottom-1 -right-1 size-5 rounded-full border p-0 shadow-sm"
                disabled={isSaving}
              />
            }
          >
            <Pencil className="size-3" />
            <span className="sr-only">{t("Change team icon")}</span>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuItem onClick={() => fileInputRef.current?.click()}>
              <Upload className="text-muted-foreground" />
              {t("Upload icon")}
            </DropdownMenuItem>
            <DropdownMenuItem variant="destructive" disabled={!logo} onClick={onRemove}>
              <Trash2 />
              {t("Remove icon")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  );
}
