"use client";

import { Check, Moon, Sun, Monitor } from "lucide-react";
import { useExtracted } from "next-intl";
import { useTheme } from "next-themes";
import { useSyncExternalStore } from "react";
import { LocaleSwitcher } from "@/components/locale-switcher";
import { SettingsPageShell } from "@/components/settings-page-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useThemePreset } from "@/hooks/use-theme-preset";
import { changeLocaleAction } from "@/lib/locale-actions";
import { type ThemeName, themePresets } from "@/lib/theme-presets";
import { cn } from "@/lib/utils";

/** true only after client hydration — next-themes has no value during SSR. */
function useHasMounted() {
  return useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
}

export default function AppearancePage() {
  const t = useExtracted();
  const hasMounted = useHasMounted();
  const { theme, setTheme } = useTheme();
  const { preset, setPreset } = useThemePreset();
  const activeTheme = preset;
  // Avoid hydration mismatch: server always sees theme as undefined.
  const activeMode = hasMounted ? theme : undefined;

  const handleSelect = (value: ThemeName) => {
    setPreset(value);
  };

  const getPresetCopy = (key: ThemeName) => {
    switch (key) {
      case "default":
        return { title: t("Default"), description: t("Clean, neutral gray tones") };
      case "t3-chat":
        return {
          title: t("T3 Chat"),
          description: t("Pink & violet inspired chat vibe"),
        };
      case "tangerine":
        return {
          title: t("Tangerine"),
          description: t("Bright, warm, and friendly"),
        };
      case "mono":
        return {
          title: t("Mono"),
          description: t("Neutral grayscale, minimal distractions"),
        };
      case "deep-dark":
        return {
          title: t("Deep Dark"),
          description: t("Pure black surfaces with crisp OLED contrast"),
        };
      case "deep-dark-high-contrast":
        return {
          title: t("Deep Dark (high contrast)"),
          description: t("Absolute black with maximum contrast for OLED screens"),
        };
      default:
        return { title: key, description: "" };
    }
  };

  const themeModes = [
    { value: "light", label: t("Light"), icon: Sun },
    { value: "dark", label: t("Dark"), icon: Moon },
    { value: "system", label: t("System"), icon: Monitor },
  ];

  return (
    <SettingsPageShell title={t("Appearance")} description={t("Customize your visual experience")}>
      {/* Language Section */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">{t("Language")}</CardTitle>
          <CardDescription>{t("Choose your preferred language for the interface")}</CardDescription>
        </CardHeader>
        <CardContent>
          <LocaleSwitcher changeLocaleAction={changeLocaleAction} />
        </CardContent>
      </Card>

      {/* Theme Mode Section */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">{t("Mode")}</CardTitle>
          <CardDescription>{t("Select light, dark, or system preference")}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2">
            {themeModes.map(({ value, label, icon: Icon }) => (
              <Button
                key={value}
                variant={activeMode === value ? "default" : "outline"}
                size="sm"
                onClick={() => setTheme(value)}
                className="flex-1 flex-col md:flex-row py-8! md:py-2! gap-2 h-9"
              >
                <Icon className="size-4" />
                {label}
              </Button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Theme Presets Section */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">{t("Color Theme")}</CardTitle>
          <CardDescription>{t("Choose a color palette that suits your style")}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {themePresets.map((presetItem) => {
              const selected = activeTheme === presetItem.key;
              const copy = getPresetCopy(presetItem.key);
              return (
                <button
                  key={presetItem.key}
                  type="button"
                  onClick={() => handleSelect(presetItem.key)}
                  className={cn(
                    "group relative flex flex-col gap-2 rounded-lg border p-3 text-left transition-colors",
                    selected ? "border-foreground bg-accent" : "border-border hover:bg-accent/50",
                  )}
                >
                  {/* Content */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="space-y-0.5">
                      <p className="font-medium text-sm">{copy.title}</p>
                      <p className="text-xs text-muted-foreground">{copy.description}</p>
                    </div>
                    {selected && (
                      <span className="inline-flex items-center justify-center size-5 rounded-full bg-foreground text-background shrink-0">
                        <Check className="size-3" />
                      </span>
                    )}
                  </div>

                  {/* Color Preview */}
                  <div className="flex w-full gap-1" aria-hidden>
                    {(presetItem.preview ?? []).map((bar) => (
                      <div key={bar} className={cn("h-1.5 flex-1 rounded-full", bar)} />
                    ))}
                  </div>
                </button>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </SettingsPageShell>
  );
}
