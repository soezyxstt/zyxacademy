import Link from "next/link";
import { BookOpen, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageOrnaments } from "@/components/ui/page-ornaments";
import { getTranslations } from "@/lib/i18n/server";
import { getAppLocale } from "@/lib/i18n/server";
import { localizedPublicPath } from "@/lib/public-locale-routes";

export async function DemoEmptyState() {
  const [t, locale] = await Promise.all([getTranslations("marketing"), getAppLocale()]);
  return (
    <div className="relative isolate overflow-hidden">
      <PageOrnaments variant="about" />
      <div className="relative z-10 mx-auto flex min-h-[min(62vh,560px)] max-w-2xl flex-col items-center justify-center px-4 py-16 text-center sm:px-6">
        <BookOpen className="size-10 text-muted-foreground/60" aria-hidden="true" />
        <h1 className="mt-4 font-heading text-h5 font-bold text-foreground">{t("demo.emptyTitle")}</h1>
        <p className="mt-2 max-w-md text-body-base text-muted-foreground">
          {t("demo.emptyDescription")}
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <Button asChild className="gap-1.5 rounded-lg">
            <Link href="/sign-up">
              {t("home.startFree")}
              <ArrowRight className="size-4" aria-hidden="true" />
            </Link>
          </Button>
          <Button asChild variant="outline" className="rounded-lg">
            <Link href={localizedPublicPath(locale, "/plans") ?? "/plans"}>{t("home.viewPlans")}</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
