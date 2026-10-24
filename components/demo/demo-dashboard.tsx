import Link from "next/link";
import { ArrowRight, BookOpen, CheckSquare, FileText, Layers3, MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DemoAuthCta } from "./demo-shell";
import { getTranslations, getAppLocale } from "@/lib/i18n/server";
import { localizedPublicPath } from "@/lib/public-locale-routes";

const checklist = [
  {
    href: "/demo/article",
    label: "demo.dashboard.article",
    detail: "demo.dashboard.articleDetail",
    icon: BookOpen,
  },
  {
    href: "/demo/diktat",
    label: "demo.dashboard.handout",
    detail: "demo.dashboard.handoutDetail",
    icon: FileText,
  },
  {
    href: "/demo/flashcards",
    label: "demo.dashboard.flashcards",
    detail: "demo.dashboard.flashcardsDetail",
    icon: Layers3,
  },
  {
    href: "/demo/quiz",
    label: "demo.dashboard.quiz",
    detail: "demo.dashboard.quizDetail",
    icon: CheckSquare,
  },
  {
    href: "/demo/zyra",
    label: "demo.dashboard.zyra",
    detail: "demo.dashboard.zyraDetail",
    icon: MessageCircle,
  },
] as const;

export async function DemoDashboard({ nextPath }: { nextPath: string }) {
  const [t, locale] = await Promise.all([getTranslations("marketing"), getAppLocale()]);
  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(280px,360px)]">
      <Card variant="solid" className="p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="font-heading text-h5 font-bold text-foreground">{t("demo.dashboard.title")}</h2>
          </div>
          <Button asChild size="sm" className="gap-1.5 rounded-lg">
            <Link href={localizedPublicPath(locale, "/demo/article") ?? "/demo/article"}>
              {t("demo.dashboard.startArticle")}
              <ArrowRight className="size-3.5" aria-hidden="true" />
            </Link>
          </Button>
        </div>

        <ol className="mt-6 space-y-2">
          {checklist.map(({ href, label, detail, icon: Icon }, index) => (
            <li key={href}>
              <Link
                href={localizedPublicPath(locale, href) ?? href}
                className="group flex items-center gap-3 rounded-xl border border-border/70 bg-background px-3 py-3 transition-colors hover:border-brand-primary/35 hover:bg-brand-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--zx-accent)]"
              >
                <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-brand-primary/10 text-body-sm font-semibold text-brand-primary">
                  {index + 1}
                </span>
                <span className="flex min-w-0 flex-1 items-center gap-3">
                  <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                  <span className="min-w-0">
                    <span className="block text-body-sm font-semibold text-foreground">{t(label)}</span>
                    <span className="block text-body-xs text-muted-foreground">{t(detail)}</span>
                  </span>
                </span>
                <ArrowRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
              </Link>
            </li>
          ))}
        </ol>
      </Card>

      <Card variant="subtle" className="flex flex-col justify-between p-5 sm:p-6">
        <div>
          <h2 className="font-heading text-h5 font-bold text-foreground">{t("demo.dashboard.saveTitle")}</h2>
          <p className="mt-2 text-body-sm leading-relaxed text-muted-foreground">
            {t("demo.dashboard.saveDescription")}
          </p>
        </div>
        <div className="mt-6">
          <DemoAuthCta nextPath={nextPath} label={t("demo.dashboard.googleCta")} />
        </div>
      </Card>
    </div>
  );
}
