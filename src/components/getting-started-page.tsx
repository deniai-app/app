"use client";
import type { LucideIcon } from "lucide-react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Computer,
  Cpu,
  Globe,
  Moon,
  ShieldCheck,
  Sparkles,
  Sun,
} from "lucide-react";
import { LazyMotion, domAnimation, m } from "motion/react";
import { useRouter } from "next/navigation";
import { useExtracted } from "next-intl";
import { useTheme } from "next-themes";
import { useEffect, useRef, useState } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import {
  Carousel,
  type CarouselApi,
  CarouselContent,
  CarouselItem,
} from "@/components/ui/carousel";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Switch } from "@/components/ui/switch";
import { useThemePreset } from "@/hooks/use-theme-preset";
import { authClient } from "@/lib/auth-client";
import { type ThemeName, themePresets } from "@/lib/theme-presets";

const segmentMs = 1000;
const introSegments = 4;
const totalMs = introSegments * segmentMs;
const showSetupDelay = totalMs + 600;

export default function GettingStartedPage() {
  const [showSetup, setShowSetup] = useState(false);
  // Preload session while the intro animation plays
  const { data: sessionData } = authClient.useSession();
  const preloadName = sessionData?.user?.name ?? "";
  const preloadImage = (sessionData?.user as { image?: string | null } | undefined)?.image ?? null;

  useEffect(() => {
    const timeout = setTimeout(() => setShowSetup(true), showSetupDelay);
    return () => clearTimeout(timeout);
  }, []);

  return (
    <LazyMotion features={domAnimation} strict>
      <main
        className="relative flex min-h-screen w-full items-center justify-center overflow-hidden"
        id="main-content"
      >
        {/* Decorative background */}
        <div className="pointer-events-none absolute inset-0 -z-10">
          <div className="absolute inset-0 bg-[radial-gradient(1200px_600px_at_10%_-10%,hsl(220_70%_60%/.20),transparent),radial-gradient(1000px_500px_at_90%_10%,hsl(280_70%_60%/.16),transparent)]" />
          <div
            className="absolute inset-0 opacity-[0.06] mask-[radial-gradient(60%_60%_at_50%_40%,black,transparent)]"
            style={{
              backgroundImage:
                "linear-gradient(to_right,rgba(255,255,255,.08)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,.08)_1px,transparent_1px)",
              backgroundSize: "24px_24px",
            }}
          />
        </div>

        <div
          className={`w-full px-4 ${
            showSetup ? "mx-auto max-w-2xl space-y-8" : "mx-auto max-w-xl text-center"
          }`}
        >
          {showSetup ? (
            <SetupScreen preloadName={preloadName} preloadImage={preloadImage} />
          ) : (
            <Intro />
          )}
        </div>
      </main>
    </LazyMotion>
  );
}

function Intro() {
  const t = useExtracted();
  const texts = [t("Welcome"), t("to"), t("Deni"), t("AI")];
  return (
    <div className="space-y-6">
      <div className="relative mx-auto w-full" style={{ height: 64 }}>
        {texts.map((text, index) => (
          <h1
            key={`${text}`} // do not use index as key to avoid remounting
            className="text-balance absolute left-1/2 top-1/2 w-full max-w-full -translate-x-1/2 -translate-y-1/2 transform text-2xl font-semibold tracking-tighter md:text-4xl lg:text-6xl"
            style={{
              opacity: 0,
              animation: `fadeCycle ${totalMs}ms linear`,
              animationDelay: `${index * segmentMs}ms`,
            }}
          >
            {text}
          </h1>
        ))}
      </div>
    </div>
  );
}

function SetupScreen({
  preloadName,
  preloadImage,
}: {
  preloadName?: string;
  preloadImage?: string | null;
}) {
  const t = useExtracted();
  const { push } = useRouter();
  const steps = [
    {
      key: "account",
      title: t("Profile"),
      description: t("Set up your profile"),
    },
    {
      key: "theme",
      title: t("Theme"),
      description: t("Pick your chat vibe"),
    },
    {
      key: "features",
      title: t("Features"),
      description: t("A quick tour of what’s included"),
    },
  ] as const;

  const [carouselApi, setCarouselApi] = useState<CarouselApi | null>(null);
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (!carouselApi) return;
    const onSelect = () => setIndex(carouselApi.selectedScrollSnap());
    carouselApi.on("select", onSelect);
    onSelect();
    return () => {
      carouselApi.off("select", onSelect);
    };
  }, [carouselApi]);

  const canPrev = index > 0;
  const canNext = index < steps.length - 1;
  const percentage = ((index + 1) / steps.length) * 100;

  return (
    <>
      {/* Header */}
      <div className="space-y-2 animate-fade-in">
        <h1 className="text-balance text-3xl font-semibold text-foreground md:text-4xl">
          {t("Let’s get your space ready")}
        </h1>
        <p className="text-muted-foreground">{t("Let’s set up the AI chatbot for yours.")}</p>
      </div>

      <Card className="overflow-hidden border-border/60 bg-background/60 backdrop-blur supports-[backdrop-filter]:bg-background/60 animate-fade-in">
        <CardContent>
          <div className="mb-4 flex flex-col -mx-0.5">
            <h1 className="text-balance text-2xl font-semibold">{steps[index].title}</h1>
            <p className="text-muted-foreground">{steps[index].description}</p>
          </div>

          <Carousel
            opts={{ align: "start", loop: false }}
            setApi={setCarouselApi}
            className="w-full"
          >
            <CarouselContent>
              <CarouselItem className="py-2">
                <AccountStep initialName={preloadName} initialImage={preloadImage} />
              </CarouselItem>
              <CarouselItem className="py-2">
                <ThemeStep />
              </CarouselItem>
              <CarouselItem className="py-2">
                <FeaturesStep />
              </CarouselItem>
            </CarouselContent>
          </Carousel>
        </CardContent>

        <CardFooter className="flex flex-col gap-4 border-t md:flex-row md:items-center md:justify-between">
          <Button
            variant="outline"
            className="order-2 w-full md:order-1 md:w-auto"
            disabled={!canPrev}
            onClick={() => carouselApi?.scrollPrev()}
          >
            <ArrowLeft className="size-4" /> {t("Previous")}
          </Button>
          <div className="order-1 flex w-full flex-1 items-center justify-center gap-3 md:order-2">
            <Progress value={percentage} className="hidden h-1 w-64 sm:block" />
            <Dots api={carouselApi} index={index} />
          </div>
          <Button
            className="order-3 w-full md:w-auto"
            onClick={() => (canNext ? carouselApi?.scrollNext() : push("/chat"))}
          >
            {canNext ? (
              <>
                {t("Next")} <ArrowRight className="size-4" />
              </>
            ) : (
              <>
                {t("Finish")} <Sparkles className="size-4" />
              </>
            )}
          </Button>
        </CardFooter>
      </Card>
    </>
  );
}

function AccountStep({
  initialName,
  initialImage,
}: {
  initialName?: string;
  initialImage?: string | null;
}) {
  const t = useExtracted();
  const { isPending, refetch } = authClient.useSession();

  // `null` override = user hasn't edited yet, fall back to the preloaded value.
  const [nameOverride, setNameOverride] = useState<string | null>(null);
  const [avatarOverride, setAvatarOverride] = useState<string | null | undefined>(undefined);
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const name = nameOverride ?? initialName ?? "";
  const avatarUrl = avatarOverride !== undefined ? avatarOverride : (initialImage ?? null);
  const setName = setNameOverride;
  const setAvatarUrl = setAvatarOverride;

  async function handleSave() {
    setSaving(true);
    setSavedMsg(null);
    try {
      const payload: Record<string, unknown> = {};
      if (name !== undefined) payload.name = name;
      // Allow null to clear avatar
      payload.image = avatarUrl ?? null;
      await authClient.updateUser(payload);
      refetch();
      setSavedMsg(t("Saved"));
    } catch (_e) {
      console.error(_e);
      setSavedMsg(t("Failed to save"));
    }
    setSaving(false);
    setTimeout(() => setSavedMsg(null), 2000);
  }

  return (
    <div className="grid gap-6">
      <div className="space-y-4">
        <Label>{t("Profile image")}</Label>
        <Avatar className="size-20">
          {avatarUrl ? (
            <AvatarImage src={avatarUrl} alt={t("avatar")} />
          ) : (
            <AvatarFallback>
              {(name?.[0] ?? "D").toUpperCase()}
              {(name?.[1] ?? "A").toUpperCase()}
            </AvatarFallback>
          )}
        </Avatar>
        <div className="flex items-center gap-2">
          <input
            ref={fileInputRef}
            id="avatar"
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              const reader = new FileReader();
              reader.onload = () => setAvatarUrl(String(reader.result));
              reader.readAsDataURL(file);
            }}
          />
          <Button
            type="button"
            variant="outline"
            onClick={() => fileInputRef.current?.click()}
            disabled={isPending || saving}
          >
            {t("Upload")}
          </Button>
          {avatarUrl && (
            <Button
              type="button"
              variant="ghost"
              onClick={() => setAvatarUrl(null)}
              disabled={isPending || saving}
            >
              {t("Remove")}
            </Button>
          )}
        </div>
      </div>

      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="display-name">{t("Display name")}</Label>
          <Input
            id="display-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t("e.g. Taro")}
            disabled={isPending || saving}
          />
        </div>
        <div className="flex items-center gap-3">
          <Button onClick={handleSave} disabled={isPending || saving}>
            {saving ? t("Saving...") : t("Save")}
          </Button>
          {savedMsg && <span className="text-xs text-muted-foreground">{savedMsg}</span>}
        </div>
      </div>
    </div>
  );
}

function ThemeStep() {
  const t = useExtracted();
  const { theme, setTheme } = useTheme();
  const { preset, setPreset } = useThemePreset();
  const activeTheme = preset;
  const themes = themePresets;

  useEffect(() => {
    const isStandardTheme = theme === "light" || theme === "dark" || theme === "system";
    const isCustomPreset =
      preset === "t3-chat" ||
      preset === "tangerine" ||
      preset === "mono" ||
      preset === "deep-dark" ||
      preset === "deep-dark-high-contrast";
    if (isStandardTheme && !isCustomPreset) {
      setPreset("default");
    }
  }, [preset, setPreset, theme]);

  const handleSelect = (value: ThemeName) => {
    setPreset(value);
  };

  const themeLabel = theme === "system" ? t("System") : theme === "light" ? t("Light") : t("Dark");

  const getPresetCopy = (key: ThemeName) => {
    switch (key) {
      case "default":
        return { title: t("Default"), description: t("The default theme") };
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

  return (
    <div className="w-full grid gap-6">
      <div className="w-full space-y-4">
        <div className="w-full flex items-center justify-between">
          <Label>{t("Choose theme")}</Label>
          <Button
            size="sm"
            variant={"outline"}
            onClick={() => {
              if (theme === "light") setTheme("dark");
              else if (theme === "dark") setTheme("system");
              else setTheme("light");
            }}
          >
            {theme === "system" ? (
              <Computer className="size-4" />
            ) : theme === "light" ? (
              <Sun className="size-4" />
            ) : (
              <Moon className="size-4" />
            )}
            {themeLabel}
          </Button>
        </div>

        <fieldset className="grid grid-cols-2 gap-4">
          {themes.map((presetItem) => {
            const selected = activeTheme === presetItem.key;
            const copy = getPresetCopy(presetItem.key);
            return (
              <Button
                key={presetItem.key}
                variant={selected ? "default" : "outline"}
                className={`flex flex-col items-start justify-between rounded-md border-2 p-4 text-left transition h-full ${
                  selected ? "border-primary" : "border-secondary"
                }`}
                onClick={() => handleSelect(presetItem.key)}
                aria-pressed={selected}
              >
                <div className="flex w-full items-start justify-between">
                  <h3 className="font-semibold">{copy.title}</h3>
                  {selected && (
                    <m.span
                      layoutId="tick"
                      className="mt-0.5 inline-flex items-center justify-center rounded-full border border-emerald-300/30 bg-emerald-400/10 p-1"
                    >
                      <Check className="size-3.5" />
                    </m.span>
                  )}
                </div>
                <p className="text-sm text-muted-foreground">{copy.description}</p>
                <div className="flex w-full gap-1.5" aria-hidden>
                  {presetItem.preview?.map((bar, _i) => (
                    <div key={bar} className={`h-1.5 flex-1 rounded-full ${bar}`} />
                  ))}
                </div>
              </Button>
            );
          })}
        </fieldset>
      </div>
    </div>
  );
}

function FeaturesStep() {
  const t = useExtracted();
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <FeatureCard
        icon={Cpu}
        title={t("Latest Models")}
        description={t(
          "Access cutting-edge AI like GPT-5 and Claude Sonnet 4 for powerful, intelligent conversations.",
        )}
      />
      <FeatureCard
        icon={Globe}
        title={t("Internet Search")}
        description={t(
          "Get real-time answers with live web search — even when built-in knowledge is limited.",
        )}
      />
      <FeatureCard
        icon={ShieldCheck}
        title={t("Privacy")}
        description={t(
          "Protect your account with two-factor authentication and flexible data retention settings.",
        )}
      />
      <FeatureCard
        icon={Sparkles}
        title={t("Feature-Rich")}
        description={t(
          "Generate images, organize chats into folders, and attach files seamlessly.",
        )}
      />
    </div>
  );
}

function FeatureCard({
  icon: Icon,
  title,
  description,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
}) {
  return (
    <div className="rounded-md border bg-muted/30 p-4 shadow-sm transition-colors hover:bg-muted/40 data-[active=true]:animate-in data-[active=true]:fade-in-0 data-[active=true]:slide-in-from-bottom-2">
      <div className="mb-2 flex items-center gap-2">
        <Icon className="size-4" aria-hidden="true" />
        <p className="font-medium">{title}</p>
      </div>
      <p className="text-sm text-muted-foreground">{description}</p>
    </div>
  );
}

function Dots({ api, index }: { api: CarouselApi | null; index: number }) {
  const snaps = api ? api.scrollSnapList() : [];
  return (
    <div className="flex items-center gap-1.5">
      {snaps.map((snap, i) => (
        <span
          key={snap}
          className={`h-1.5 w-4 rounded-full transition-colors ${i <= index ? "bg-primary" : "bg-muted"}`}
        />
      ))}
    </div>
  );
}

function _PreferenceToggle({
  id,
  title,
  description,
  defaultChecked,
}: {
  id: string;
  title: string;
  description: string;
  defaultChecked?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-xl border bg-muted/40 px-4 py-3">
      <div className="flex-1 text-left">
        <p className="text-sm font-medium">{title}</p>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      <Switch id={id} defaultChecked={defaultChecked} aria-label={title} />
    </div>
  );
}

// (Checklist removed as requested)
