import type { Metadata } from "next";
import Link from "next/link";
import { useExtracted } from "next-intl";
import { getExtracted } from "next-intl/server";
import { publicAlternates } from "@/lib/seo";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getExtracted();
  return {
    title: t("Message Migration"),
    description: t("Move your chats from the old version into this site."),
    alternates: await publicAlternates("/migration"),
  };
}

export default function MigrationPage() {
  const t = useExtracted();

  return (
    <main className="min-h-screen bg-background" id="main-content">
      <div className="mx-auto flex max-w-4xl flex-col gap-8 px-4 pb-16 pt-28 sm:px-6 lg:px-8">
        <div className="space-y-3">
          <Badge variant="secondary" className="px-3 py-1 text-xs">
            {t("Migration")}
          </Badge>
          <h1 className="text-balance text-3xl font-semibold tracking-tight sm:text-4xl">
            {t("Message Migration")}
          </h1>
          <p className="text-base text-muted-foreground">
            {t("Move your chats from the old version into this site.")}
          </p>
        </div>

        <aside className="rounded-xl border border-border/70 bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
          {t("Create a new account on this site to continue the migration.")}
        </aside>

        <div className="grid gap-6">
          <Card className="border-border/80">
            <CardHeader>
              <CardTitle>{t("Step 1: Export from the migrator tool")}</CardTitle>
              <CardDescription>
                {t("Log into the migrator app and download a `message.json` file.")}
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              <Button
                variant="secondary"
                render={<Link href="https://migrate.deniai.app" target="_blank" rel="noreferrer" />}
                nativeButton={false}
              >
                {t("Go to migrator tool")}
              </Button>
            </CardContent>
          </Card>

          <Card className="border-border/80">
            <CardHeader>
              <CardTitle>{t("Step 2: Create a new account on this site")}</CardTitle>
              <CardDescription>
                {t("Create a new account on this site to continue the migration.")}
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              <Button render={<Link href="/auth/sign-up" />} nativeButton={false}>
                {t("Create account")}
              </Button>
            </CardContent>
          </Card>

          <Card className="border-border/80">
            <CardHeader>
              <CardTitle>{t("Step 3: Import into this site")}</CardTitle>
              <CardDescription>
                {t("Upload the `message.json` file to create new chats.")}
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                render={<Link href="/settings/migration" />}
                nativeButton={false}
              >
                {t("Import messages")}
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </main>
  );
}
