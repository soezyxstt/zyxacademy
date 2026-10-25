import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ArrowUpRight } from "lucide-react";
import { LandingSubjectShowcase } from "@/components/landing/landing-subject-showcase";
import { SectionContainer } from "@/components/layout/section-container";
import { SectionHeading } from "@/components/ui/section-heading";
import { getTranslations } from "@/lib/i18n/server";

export async function LandingCoursePreview() {
 const t = await getTranslations("marketing");
 return (
 <SectionContainer className="border-b border-border bg-background" aria-labelledby="courses-heading">
 <div className="max-w-2xl">
 <SectionHeading id="courses-heading" tier="secondary">
 {t("home.coursesTitle")}
 </SectionHeading>
 <p className="mt-3 max-w-prose text-body-base text-muted-foreground">
 {t("home.coursesDescription")}
 </p>
 <Button
 asChild
 variant="marketingSecondary"
 size="marketing"
 className="mt-6 bg-background sm:mt-7"
 >
 <Link href="/courses">
 {t("home.coursesCta")}
 <ArrowUpRight className="size-4" data-icon="inline-end" />
 </Link>
 </Button>
 </div>

 <div className="mt-10 md:mt-12">
 <LandingSubjectShowcase />
 </div>
 </SectionContainer>
 );
}
