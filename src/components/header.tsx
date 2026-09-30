"use client";

import {
  Bot,
  BookOpen,
  BriefcaseBusiness,
  CircleHelp,
  FileText,
  Globe,
  History,
  Laptop,
  Mail,
  Menu,
  Newspaper,
  Shield,
  Sparkles,
} from "lucide-react";
import Link from "next/link";
import { useExtracted, useLocale } from "next-intl";
import { UserButton } from "@/components/auth/user/user-button";
import { changeLocaleAction } from "@/lib/locale-actions";
import { localizedPath } from "@/lib/locale-path";
import DeniAIIcon from "./deni-ai-icon";
import { HeaderMegaMenu } from "./header-mega-menu";
import { LocaleSwitcher } from "./locale-switcher";
import { buttonVariants } from "./ui/button-variants";
import { Button } from "./ui/button";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "./ui/sheet";

type MegaMenuLink = {
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
};

type MegaMenuSection = {
  title: string;
  links: MegaMenuLink[];
};

function MobileNavLink({ link }: { link: MegaMenuLink }) {
  const Icon = link.icon;

  return (
    <SheetClose
      render={
        <Button
          variant="ghost"
          className="h-auto w-full justify-start rounded-2xl border border-border bg-card/70 p-3 text-left text-card-foreground hover:bg-accent hover:text-accent-foreground"
          render={<Link href={link.href} />}
          nativeButton={false}
        />
      }
    >
      <span className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-border bg-muted">
        <Icon className="size-5 text-muted-foreground" />
      </span>
      <span className="flex min-w-0 flex-col">
        <span className="text-sm font-medium leading-tight">{link.title}</span>
        <span className="text-xs text-muted-foreground">{link.description}</span>
      </span>
    </SheetClose>
  );
}

export default function Header() {
  const t = useExtracted();
  const locale = useLocale();
  const hrefFor = (path: string) => localizedPath(path, locale);

  const productSections: MegaMenuSection[] = [
    {
      title: t("Chat Platform"),
      links: [
        {
          href: hrefFor("/home"),
          icon: Bot,
          title: "Deni AI",
          description: t("Infomation."),
        },
        {
          href: "/chat",
          icon: Bot,
          title: "Chat",
          description: t("Chat with multiple AI models."),
        },
        {
          href: hrefFor("/models"),
          icon: Sparkles,
          title: t("AI Models"),
          description: t("Supported models."),
        },
      ],
    },
    {
      title: t("Creative Tools"),
      links: [
        {
          href: hrefFor("/desktop"),
          icon: Laptop,
          title: t("Desktop"),
          description: t("Desktop app."),
        },
        {
          href: hrefFor("/migration"),
          icon: FileText,
          title: t("Migration"),
          description: t("Move your chats."),
        },
      ],
    },
    {
      title: t("Extensions"),
      links: [
        {
          href: hrefFor("/flixa"),
          icon: Globe,
          title: "Flixa",
          description: t("AI coding agent."),
        },
      ],
    },
  ];

  const resourceSections: MegaMenuSection[] = [
    {
      title: t("Learn"),
      links: [
        {
          href: hrefFor("/blog"),
          icon: Newspaper,
          title: t("Blog"),
          description: t("Dated notes from the team."),
        },
        {
          href: hrefFor("/guides"),
          icon: BookOpen,
          title: t("AI Guides"),
          description: t("Practical AI reading."),
        },
        {
          href: hrefFor("/use-cases"),
          icon: BriefcaseBusiness,
          title: t("Use Cases"),
          description: t("Practical workflows."),
        },
        {
          href: hrefFor("/faq"),
          icon: CircleHelp,
          title: t("FAQ"),
          description: t("Common product questions."),
        },
        {
          href: hrefFor("/changelog"),
          icon: History,
          title: t("Changelog"),
          description: t("What shipped recently."),
        },
      ],
    },
    {
      title: t("Company"),
      links: [
        {
          href: hrefFor("/about"),
          icon: BookOpen,
          title: t("About"),
          description: t("Vision and background."),
        },
        {
          href: hrefFor("/contact"),
          icon: Mail,
          title: t("Contact"),
          description: t("Email support and requests."),
        },
        {
          href: hrefFor("/legal/privacy-policy"),
          icon: Shield,
          title: t("Privacy"),
          description: t("Data handling policy."),
        },
        {
          href: hrefFor("/legal/terms"),
          icon: FileText,
          title: t("Terms"),
          description: t("Terms of service."),
        },
      ],
    },
  ];

  const mobileSections = [...productSections, ...resourceSections];

  return (
    <header className="fixed left-0 top-0 z-50 w-full px-4 pt-4">
      <nav className="mx-auto max-w-6xl">
        <div className="rounded-[1.35rem] border border-border/70 bg-background/80 px-4 py-3 text-foreground shadow-xl backdrop-blur-xl">
          <div className="flex items-center justify-between gap-4">
            <Link
              href={hrefFor("/home")}
              aria-label="Deni AI"
              title="Deni AI"
              className="flex items-center gap-3"
            >
              <DeniAIIcon className="size-7 text-foreground" />
              <span className="sr-only text-base font-semibold tracking-tight text-foreground sm:not-sr-only sm:inline-block">
                Deni AI
              </span>
            </Link>

            <div className="hidden min-w-0 flex-1 items-center justify-center gap-3 lg:flex">
              <HeaderMegaMenu label={t("Products")} menuLabel={t("Products")}>
                <div className="grid gap-8 md:grid-cols-3">
                  {productSections.map((section) => (
                    <div key={section.title}>
                      <p className="mb-2 text-sm text-muted-foreground font-medium">
                        {section.title}
                      </p>
                      <div className="space-y-1">
                        {section.links.map((link) => {
                          const Icon = link.icon;

                          return (
                            <Button
                              key={link.href}
                              variant="ghost"
                              className="size-full justify-start px-2!"
                              render={<Link href={link.href} role="menuitem" />}
                              nativeButton={false}
                            >
                              <span className="flex size-10 shrink-0 items-center justify-center rounded-lg border">
                                <Icon className="size-5 text-muted-foreground" />
                              </span>
                              <span className="flex min-w-0 flex-col gap-0.5 justify-center self-center">
                                <span className="block text-sm font-semibold tracking-tight">
                                  {link.title}
                                </span>
                                <span className="block text-xs text-muted-foreground">
                                  {link.description}
                                </span>
                              </span>
                            </Button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </HeaderMegaMenu>
              <HeaderMegaMenu label={t("Resources")} menuLabel={t("Resources")}>
                <div className="grid gap-8 md:grid-cols-2">
                  {resourceSections.map((section) => (
                    <div key={section.title}>
                      <p className="mb-2 text-sm text-muted-foreground font-medium">
                        {section.title}
                      </p>
                      <div className="space-y-1">
                        {section.links.map((link) => {
                          const Icon = link.icon;

                          return (
                            <Button
                              key={link.href}
                              variant="ghost"
                              className="size-full justify-start px-2!"
                              render={<Link href={link.href} role="menuitem" />}
                              nativeButton={false}
                            >
                              <span className="flex size-10 shrink-0 items-center justify-center rounded-lg border">
                                <Icon className="size-5 text-muted-foreground" />
                              </span>
                              <span className="flex min-w-0 flex-col gap-0.5 justify-center self-center">
                                <span className="block text-sm font-semibold tracking-tight">
                                  {link.title}
                                </span>
                                <span className="block text-xs text-muted-foreground">
                                  {link.description}
                                </span>
                              </span>
                            </Button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </HeaderMegaMenu>
              <Link
                href={hrefFor("/about")}
                className="rounded-full px-4 py-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
              >
                {t("About")}
              </Link>
            </div>

            <div className="hidden items-center gap-2 lg:flex">
              <LocaleSwitcher changeLocaleAction={changeLocaleAction} />
              <div className="hidden h-5 w-px bg-border sm:block" />
              <UserButton size="icon" />
            </div>

            <div className="lg:hidden">
              <Sheet>
                <SheetTrigger
                  className={buttonVariants({
                    variant: "outline",
                    size: "icon",
                    className:
                      "rounded-full border-border bg-background/60 text-foreground hover:bg-accent hover:text-accent-foreground",
                  })}
                  aria-label={t("Open menu")}
                >
                  <Menu className="size-5" />
                </SheetTrigger>
                <SheetContent
                  side="right"
                  className="border-border bg-background/96 px-0 text-foreground backdrop-blur-xl"
                >
                  <SheetHeader className="border-b border-border p-5 text-left">
                    <SheetTitle className="text-base text-foreground">{t("Menu")}</SheetTitle>
                    <SheetDescription className="text-muted-foreground">
                      {t("Browse products, resources, language, and account options.")}
                    </SheetDescription>
                  </SheetHeader>

                  <div className="flex min-h-0 flex-1 flex-col overflow-y-auto p-5">
                    <div className="space-y-6">
                      {mobileSections.map((section) => (
                        <div key={section.title} className="space-y-2">
                          <p className="text-[10px] font-medium uppercase tracking-[0.22em] text-muted-foreground">
                            {section.title}
                          </p>
                          <div className="space-y-2">
                            {section.links.map((link) => (
                              <MobileNavLink key={`${section.title}-${link.href}`} link={link} />
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>

                    <div className="mt-6 border-t border-border pt-6">
                      <p className="mb-3 text-[10px] font-medium uppercase tracking-[0.22em] text-muted-foreground">
                        {t("Language")}
                      </p>
                      <LocaleSwitcher changeLocaleAction={changeLocaleAction} />
                    </div>

                    <div className="mt-6 border-t border-border pt-6">
                      <p className="mb-3 text-[10px] font-medium uppercase tracking-[0.22em] text-muted-foreground">
                        {t("Account")}
                      </p>
                      <div className="flex items-center justify-start">
                        <UserButton />
                      </div>
                    </div>
                  </div>
                </SheetContent>
              </Sheet>
            </div>
          </div>
        </div>
      </nav>
    </header>
  );
}
