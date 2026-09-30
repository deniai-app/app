"use client";

import React from "react";
import { m } from "motion/react";
import { ChevronDown, Download, Package } from "lucide-react";
import { useExtracted } from "next-intl";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { DesktopDownloads, DesktopRelease } from "./types";

type DownloadOption = {
  id: string;
  shortLabel: string;
  href: string;
  os: "windows" | "macos" | "linux";
  arch: "x64" | "arm64";
  format: string;
};

type NavigatorWithUserAgentData = Navigator & {
  userAgentData?: {
    platform?: string;
    architecture?: string;
  };
};

function normalizeArchitecture(raw: string): "x64" | "arm64" | null {
  const value = raw.toLowerCase();

  if (value.includes("arm") || value.includes("aarch")) {
    return "arm64";
  }

  if (
    value.includes("x86_64") ||
    value.includes("x64") ||
    value.includes("amd64") ||
    value.includes("intel")
  ) {
    return "x64";
  }

  return null;
}

function detectPreferredPlatform(): {
  os: DownloadOption["os"] | null;
  arch: DownloadOption["arch"] | null;
} {
  if (typeof window === "undefined") {
    return { os: null, arch: null };
  }

  const userAgentData = (navigator as NavigatorWithUserAgentData).userAgentData;
  const platformSource = `${userAgentData?.platform ?? ""} ${navigator.platform ?? ""} ${navigator.userAgent}`;
  const architectureSource = `${userAgentData?.architecture ?? ""} ${navigator.platform ?? ""} ${navigator.userAgent}`;
  const platform = platformSource.toLowerCase();

  let os: DownloadOption["os"] | null = null;

  if (platform.includes("win")) {
    os = "windows";
  } else if (platform.includes("mac")) {
    os = "macos";
  } else if (platform.includes("linux") || platform.includes("x11")) {
    os = "linux";
  }

  return {
    os,
    arch: normalizeArchitecture(architectureSource),
  };
}

function parseDownloadOptions(assets: DesktopRelease["assets"]): DownloadOption[] {
  return assets
    .flatMap((asset) => {
      const { name, browser_download_url: href } = asset;

      if (/\.sig$/i.test(name) || /^latest\.json$/i.test(name) || /\.app\.tar\.gz$/i.test(name)) {
        return [];
      }

      let os: DownloadOption["os"] | null = null;
      if (/_windows_/i.test(name)) {
        os = "windows";
      } else if (/_darwin_/i.test(name)) {
        os = "macos";
      } else if (/_linux_/i.test(name)) {
        os = "linux";
      }

      if (!os) {
        return [];
      }

      const archMatch = name.match(/_(aarch64|arm64|x64|x86_64|amd64)(?=[._-])/i);
      const arch = normalizeArchitecture(archMatch?.[1] ?? "");

      if (!arch) {
        return [];
      }

      let format = "";
      if (/setup\.exe$/i.test(name)) {
        format = ".exe";
      } else if (/\.msi$/i.test(name)) {
        format = ".msi";
      } else if (/\.dmg$/i.test(name)) {
        format = ".dmg";
      } else if (/\.appimage$/i.test(name)) {
        format = "AppImage";
      } else if (/\.deb$/i.test(name)) {
        format = ".deb";
      } else if (/\.rpm$/i.test(name)) {
        format = ".rpm";
      } else {
        return [];
      }

      const archLabel = arch === "arm64" ? "ARM64" : "x64";
      const macLabel = os === "macos" ? (arch === "arm64" ? "Silicon" : "Intel") : "";

      return [
        {
          id: name,
          shortLabel: `${macLabel ? `${macLabel} ` : archLabel} ${format}`,
          href,
          os,
          arch,
          format,
        } satisfies DownloadOption,
      ];
    })
    .sort((a, b) => {
      const osOrder = { windows: 0, macos: 1, linux: 2 };

      if (osOrder[a.os] !== osOrder[b.os]) {
        return osOrder[a.os] - osOrder[b.os];
      }

      if (a.arch !== b.arch) {
        return a.arch === "arm64" ? -1 : 1;
      }

      return a.format.localeCompare(b.format);
    });
}

function getArchLabel(os: DownloadOption["os"], arch: DownloadOption["arch"]): string {
  if (os === "macos") {
    return arch === "arm64" ? "Apple Silicon" : "Intel";
  }

  return arch === "arm64" ? "ARM64" : "x64";
}

function getFormatLabel(format: string): string {
  return format.replace(/^\./, "");
}

function getOsText(os: DownloadOption["os"]): string {
  if (os === "windows") {
    return "Windows";
  }

  if (os === "macos") {
    return "macOS";
  }

  return "Linux";
}

const OS_ORDER = ["windows", "macos", "linux"] as const;

function selectionChipClassName(active: boolean): string {
  return `rounded-full border px-3 py-1.5 text-sm transition-colors ${
    active
      ? "border-foreground bg-foreground text-background"
      : "border-border bg-background/70 text-muted-foreground hover:bg-background"
  }`;
}

function pickDefaultOption(
  options: DownloadOption[],
  preferred: {
    os: DownloadOption["os"] | null;
    arch: DownloadOption["arch"] | null;
  },
): DownloadOption | null {
  if (options.length === 0) {
    return null;
  }

  return (
    options.find((option) => option.os === preferred.os && option.arch === preferred.arch) ??
    options.find((option) => option.os === preferred.os) ??
    options[0]
  );
}

export function DesktopDownloadPicker({ downloads }: { downloads: DesktopDownloads }) {
  const t = useExtracted();
  const [includePrerelease, setIncludePrerelease] = React.useState(false);
  const latestOptions = parseDownloadOptions(downloads.latestRelease.assets);
  const prereleaseOptions = parseDownloadOptions(downloads.prerelease?.assets ?? []);
  const hasPrerelease = prereleaseOptions.length > 0;
  // Derive the effective toggle instead of resetting state in an effect: when no
  // prerelease exists the user's opt-in is simply ignored, with no extra render.
  const effectiveIncludePrerelease = includePrerelease && hasPrerelease;
  const shouldUsePrereleaseFallback = latestOptions.length === 0 && hasPrerelease;
  const options =
    effectiveIncludePrerelease || shouldUsePrereleaseFallback ? prereleaseOptions : latestOptions;
  // Only the user's explicit picks are stored. The effective os/arch/format are
  // derived below with validation against the current options, so we never sync
  // selection state through an effect when `options` changes.
  const [selectedOs, setSelectedOs] = React.useState<DownloadOption["os"] | null>(null);
  const [selectedArch, setSelectedArch] = React.useState<DownloadOption["arch"] | null>(null);
  const [selectedFormat, setSelectedFormat] = React.useState<string | null>(null);

  const osOptions = {
    windows: options.filter((option) => option.os === "windows"),
    macos: options.filter((option) => option.os === "macos"),
    linux: options.filter((option) => option.os === "linux"),
  };
  const availableOs = OS_ORDER.filter((os) => osOptions[os].length > 0);
  const selectOs = (os: DownloadOption["os"]) => {
    setSelectedOs(os);
    setSelectedArch(null);
    setSelectedFormat(null);
  };
  const currentOs =
    (selectedOs && options.some((option) => option.os === selectedOs) ? selectedOs : null) ??
    pickDefaultOption(options, detectPreferredPlatform())?.os ??
    null;
  const availableArchs = (() => {
    if (!currentOs) {
      return [] as DownloadOption["arch"][];
    }

    const archs = new Set<DownloadOption["arch"]>();
    for (const option of options) {
      if (option.os === currentOs) {
        archs.add(option.arch);
      }
    }
    return Array.from(archs);
  })();
  const currentArch =
    (selectedArch && availableArchs.includes(selectedArch) ? selectedArch : null) ??
    availableArchs[0] ??
    null;
  const availableFormats =
    !currentOs || !currentArch
      ? []
      : options.filter((option) => option.os === currentOs && option.arch === currentArch);
  const currentFormat =
    availableFormats.find((option) => option.format === selectedFormat)?.format ??
    availableFormats[0]?.format ??
    null;
  const selectedOption =
    availableFormats.find((option) => option.format === currentFormat) ??
    pickDefaultOption(options, detectPreferredPlatform()) ??
    null;

  return (
    <section id="download" className="relative px-4 py-8">
      <div className="mx-auto max-w-5xl">
        <m.div
          initial={{ opacity: 0, scale: 0.95 }}
          whileInView={{ opacity: 1, scale: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.8 }}
          className="relative overflow-hidden rounded-[2.5rem] border-2 border-border bg-card/50 p-12 md:p-16 text-center shadow-2xl backdrop-blur-sm"
        >
          <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_50%_50%,rgba(var(--primary),0.1),transparent)]" />
          <h2 className="mb-6 text-3xl font-semibold tracking-tight md:text-6xl">
            {t("Ready to try Deni AI Desktop?")}
          </h2>
          <p className="mx-auto mb-10 max-w-2xl text-xl leading-relaxed text-muted-foreground">
            {t(
              "Use Deni AI with desktop-native convenience and keep your assistant close without keeping a browser tab open.",
            )}
          </p>
          {hasPrerelease ? (
            <div className="mx-auto mb-6 flex w-full max-w-2xl items-center justify-center gap-3 rounded-2xl border border-border/70 bg-background/70 px-4 py-3 text-sm text-muted-foreground">
              <label className="flex cursor-pointer items-center gap-2">
                <Checkbox
                  checked={includePrerelease}
                  onCheckedChange={(checked) => setIncludePrerelease(checked === true)}
                />
                <span>{t("Pre-release")}</span>
              </label>
            </div>
          ) : null}
          {options.length > 0 && selectedOption ? (
            <div className="mx-auto mb-4 flex w-full max-w-2xl flex-col items-stretch justify-center gap-3">
              {availableOs.length > 1 ? (
                <div className="flex flex-wrap justify-center gap-2">
                  {availableOs.map((os) => (
                    <button
                      key={os}
                      type="button"
                      aria-pressed={currentOs === os}
                      onClick={() => selectOs(os)}
                      className={selectionChipClassName(currentOs === os)}
                    >
                      {getOsText(os)}
                    </button>
                  ))}
                </div>
              ) : null}
              <div className="flex w-full flex-col items-stretch justify-center sm:flex-row">
                <Button
                  size="lg"

                  className="h-12 rounded-b-none rounded-r-none! rounded-t-xl bg-primary px-6 text-primary-foreground shadow-lg shadow-primary/20 hover:bg-primary/90 sm:rounded-r-none sm:rounded-b-xl sm:rounded-l-xl"
                  render={<a href={selectedOption.href} target="_blank" rel="noreferrer" />}
                  nativeButton={false}
                >
                  <Download className="size-4" />
                  {t("Download")} {getOsText(selectedOption.os)}
                </Button>
                <DropdownMenu>
                  <DropdownMenuTrigger
                    render={
                      <Button
                        size="lg"
                        variant="default"
                        className="h-12 rounded-t-none rounded-l-none! rounded-b-xl border-0 border-t border-primary-foreground/15 bg-primary px-4 text-primary-foreground shadow-lg shadow-primary/20 hover:bg-primary/90 sm:w-14 sm:rounded-l-none sm:rounded-r-xl sm:rounded-b-xl sm:rounded-t-xl sm:border-t-0 sm:border-l"
                      />
                    }
                  >
                    <ChevronDown className="size-4" />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent
                    align="end"
                    className="w-64 rounded-2xl border-border/60 bg-background/95 p-3 shadow-2xl backdrop-blur"
                  >
                    {osOptions.macos.length > 0 ? (
                      <DropdownMenuItem
                        className="p-1.5 font-medium"
                        onClick={() => selectOs("macos")}
                      >
                        {t("macOS build")}
                      </DropdownMenuItem>
                    ) : null}
                    {osOptions.macos.length > 0 &&
                    (osOptions.windows.length > 0 || osOptions.linux.length > 0) ? (
                      <DropdownMenuSeparator className="my-2" />
                    ) : null}
                    {osOptions.windows.length > 0 ? (
                      <DropdownMenuItem
                        className="p-1.5 font-medium"
                        onClick={() => selectOs("windows")}
                      >
                        {t("Windows build")}
                      </DropdownMenuItem>
                    ) : null}
                    {osOptions.windows.length > 0 && osOptions.linux.length > 0 ? (
                      <DropdownMenuSeparator className="my-2" />
                    ) : null}
                    {osOptions.linux.length > 0 ? (
                      <DropdownMenuItem
                        className="p-1.5 font-medium"
                        onClick={() => selectOs("linux")}
                      >
                        {t("Linux build")}
                      </DropdownMenuItem>
                    ) : null}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
              {availableArchs.length > 1 ? (
                <div className="flex flex-wrap justify-center gap-2">
                  {availableArchs.map((arch) => (
                    <button
                      key={arch}
                      type="button"
                      onClick={() => {
                        setSelectedArch(arch);
                        setSelectedFormat(null);
                      }}
                      className={selectionChipClassName(currentArch === arch)}
                    >
                      {getArchLabel(currentOs ?? selectedOption.os, arch)}
                    </button>
                  ))}
                </div>
              ) : null}
              {availableFormats.length > 1 ? (
                <div className="flex flex-wrap justify-center gap-2">
                  {availableFormats.map((option) => (
                    <button
                      key={option.id}
                      type="button"
                      onClick={() => setSelectedFormat(option.format)}
                      className={selectionChipClassName(currentFormat === option.format)}
                    >
                      {getFormatLabel(option.format)}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}
          <div className="flex flex-wrap items-center justify-center gap-3 text-sm text-muted-foreground">
            <a
              href={downloads.releasesUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 underline underline-offset-4 transition-opacity hover:opacity-80"
            >
              <Package className="size-4" />
              {t("View all releases")}
            </a>
          </div>
        </m.div>
      </div>
    </section>
  );
}
