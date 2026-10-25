import Link from "next/link";
import { FaTiktok, FaInstagram } from "react-icons/fa6";
import { Logo } from "@/components/logo";
import { cn } from "@/lib/utils";
import { env } from "@/lib/env";
import { getAppLocale, getTranslations } from "@/lib/i18n/server";
import { localizedPublicPath } from "@/lib/public-locale-routes";

const socialClass = cn(
  "interactive inline-flex size-10 items-center justify-center rounded-full border border-border",
  "text-muted-foreground transition-colors hover:border-primary/40 hover:bg-muted/60 hover:text-foreground",
);

export async function Footer() {
  const [t, locale] = await Promise.all([getTranslations("marketing"), getAppLocale()]);
  return (
    <footer role="contentinfo" className="border-t border-border bg-background">
      <div className="container mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid gap-10 py-10 md:grid-cols-12 md:gap-8 md:py-12 lg:gap-14">
          <div className="md:col-span-5 lg:col-span-6">
            <Link href={localizedPublicPath(locale, "/") ?? "/"} aria-label={t("nav.homeBrand")} className="inline-flex">
              <Logo className="[--logo-height:1.75rem] md:[--logo-height:2rem]" />
            </Link>
            <p className="mt-4 max-w-md text-body-sm leading-relaxed text-muted-foreground">
              {t("footer.description")}
            </p>
            <p className="mt-2 text-body-xs font-semibold text-[var(--zx-accent)] tracking-wide">
              {t("footer.tagline")}
            </p>
          </div>

          <nav className="md:col-span-3" aria-label={t("footer.companyLinks")}>
            <h3 className="font-heading text-body-sm font-semibold tracking-tight text-foreground">{t("footer.company")}</h3>
            <ul className="mt-4 space-y-3">
              <li>
                <Link href={localizedPublicPath(locale, "/about") ?? "/about"} className="interactive text-body-sm text-muted-foreground transition-colors hover:text-foreground">
                  {t("nav.about")}
                </Link>
              </li>
              <li>
                <Link href={localizedPublicPath(locale, "/plans") ?? "/plans"} className="interactive text-body-sm text-muted-foreground transition-colors hover:text-foreground">
                  {t("footer.plans")}
                </Link>
              </li>
              <li>
                <Link href={localizedPublicPath(locale, "/testimonial") ?? "/testimonial"} className="interactive text-body-sm text-muted-foreground transition-colors hover:text-foreground">
                  {t("nav.testimonials")}
                </Link>
              </li>
            </ul>
          </nav>

          <nav className="md:col-span-4 lg:col-span-3" aria-label={t("footer.legalLinks")}>
            <h3 className="font-heading text-body-sm font-semibold tracking-tight text-foreground">{t("footer.legal")}</h3>
            <ul className="mt-4 space-y-3">
              <li>
                <Link href={localizedPublicPath(locale, "/privacy") ?? "/privacy"} className="interactive text-body-sm text-muted-foreground transition-colors hover:text-foreground">
                  {t("footer.privacy")}
                </Link>
              </li>
              <li>
                <Link href={localizedPublicPath(locale, "/terms") ?? "/terms"} className="interactive text-body-sm text-muted-foreground transition-colors hover:text-foreground">
                  {t("footer.terms")}
                </Link>
              </li>
            </ul>
            <div className="mt-6 flex flex-wrap items-center gap-2">
              {env.NEXT_PUBLIC_BRAND_INSTAGRAM && (
                <Link
                  href={env.NEXT_PUBLIC_BRAND_INSTAGRAM}
                  className={socialClass}
                  aria-label={t("footer.instagram")}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <FaInstagram className="size-4.5" aria-hidden />
                </Link>
              )}
              {env.NEXT_PUBLIC_BRAND_TIKTOK && (
                <Link
                  href={env.NEXT_PUBLIC_BRAND_TIKTOK}
                  className={socialClass}
                  aria-label={t("footer.tiktok")}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <FaTiktok className="size-4.5" aria-hidden />
                </Link>
              )}
            </div>
          </nav>
        </div>

        <div className="flex flex-col items-center justify-between gap-3 border-t border-border py-6 sm:flex-row sm:py-5">
          <p className="text-center text-body-sm text-muted-foreground sm:text-left">
            {t("footer.copyright", { year: new Date().getFullYear() })}
          </p>
        </div>
      </div>
    </footer>
  );
}
