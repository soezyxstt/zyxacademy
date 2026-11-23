import Image from "next/image";
import { ArrowDownToLine, ArrowUpRight } from "lucide-react";
import { SectionContainer } from "@/components/layout/section-container";
import { MarketingPageHero } from "@/components/marketing-page-hero";
import { PageOrnaments } from "@/components/ui/page-ornaments";
import { buttonVariants } from "@/components/ui/button";
import { getTranslations } from "@/lib/i18n/server";
import { getDownloadChannel, readPublishedRelease } from "@/lib/native/published-release";
import { createLocalizedMetadata } from "@/lib/site-metadata";
import { cn } from "@/lib/utils";

export function generateMetadata() {
  return createLocalizedMetadata({ path: "/download", titleKey: "download.title", descriptionKey: "download.description" });
}

export default async function DownloadPage() {
  const channel = getDownloadChannel();
  const [t, { release, error }] = await Promise.all([
    getTranslations("marketing.download"), readPublishedRelease(channel),
  ]);
  const assets = release?.downloads;
  const channelName = channel === "nightly" ? "Nightly" : "Stable";
  const platforms = [
    { name: "Windows", icon: "windows11", format: "EXE · x64", url: assets?.windows },
    { name: "Android", icon: "android", format: "APK", url: assets?.android },
    { name: "Debian", icon: "debian", format: "DEB · x64", url: assets?.linuxDeb },
    { name: "Linux", icon: "linux", format: "AppImage · x64", url: assets?.linuxAppImage },
    { name: "macOS", icon: "apple" },
    { name: "iPhone", icon: "ios" },
  ];

  return (
    <>
      <MarketingPageHero sectionId="download" title={t("title")} description={t("description")} />
      <SectionContainer density="compact" className="overflow-hidden" backgroundContent={<PageOrnaments variant="plans" />}>
        <div className="relative mx-auto max-w-4xl">
          <div className="mb-5 flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
            <h2 className="font-heading text-h5 font-bold">{t("platforms")}</h2>
            {release ? (
              <a href={release.releaseUrl} className="inline-flex min-h-9 items-center gap-1 text-body-xs text-muted-foreground hover:text-primary">
                {channelName} {release.version}{release.buildId && ` (${release.buildId})`}
                <ArrowUpRight className="size-3.5" aria-hidden />
              </a>
            ) : <p role="status" className="text-body-xs text-muted-foreground">{error ? t("error") : t("empty", { channel: channelName })}</p>}
          </div>
          <ul className="grid grid-cols-1 gap-2 min-[360px]:grid-cols-2 md:grid-cols-3 md:gap-3">
            {platforms.map(({ name, icon, format, url }) => {
              const className = cn(buttonVariants({ variant: "outline" }),
                "h-auto min-h-16 w-full justify-start gap-2.5 rounded-lg px-3 py-2 text-left no-underline! sm:px-4",
                !url && "bg-muted/55 text-muted-foreground disabled:opacity-100");
              const contents = <>
                <Image src={`/platforms/${icon}.svg`} alt="" width={28} height={28}
                  className={cn("size-7 shrink-0 object-contain", !url && "opacity-50 grayscale", (icon === "apple" || icon === "ios") && "dark:invert")} />
                <span className="min-w-0">
                  <span className="block font-semibold">{name}</span>
                  <span className="block whitespace-normal text-body-xs font-normal text-muted-foreground">{url ? format : t("unavailable")}</span>
                </span>
                {url && <ArrowDownToLine className="ml-auto size-4 text-brand-primary" aria-hidden />}
              </>;
              return <li key={name}>{url ? (
                <a href={url} aria-label={`${t("verb")} ${name} (${format})`} className={className}>{contents}</a>
              ) : <button type="button" disabled className={className}>{contents}</button>}</li>;
            })}
          </ul>
        </div>
      </SectionContainer>
    </>
  );
}
