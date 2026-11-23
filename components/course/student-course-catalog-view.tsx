import Link from "next/link";
import { BookOpen } from "lucide-react";
import { ApplicationPage } from "@/components/application-page";
import { PageHeader } from "@/components/page-header";
import { studentSectionClass } from "@/components/course/course-surfaces";
import { CourseCatalogClient, type CourseGroup } from "@/app/(student)/courses/course-catalog-client";
import { TranslatedText } from "@/components/i18n/translated-text";

export function StudentCourseCatalogView({ groups, studentTargetCategory, whatsappHref }: {
  groups: CourseGroup[];
  studentTargetCategory: string | null;
  whatsappHref: string | null;
}) {
  return (
    <ApplicationPage className="pb-16">
      <PageHeader
        title={<TranslatedText namespace="learning" messageKey="catalog.pageTitle" />}
        icon={BookOpen}
      />

      {groups.length > 0 ? (
        <CourseCatalogClient
          groups={groups}
          studentTargetCategory={studentTargetCategory}
        />
      ) : (
        <div className={studentSectionClass("py-12 text-center max-w-md mx-auto")}>
          <BookOpen className="mx-auto size-10 text-muted-foreground/40 mb-3" />
          <h2 className="font-heading text-body-base font-bold text-foreground">
            <TranslatedText namespace="learning" messageKey="catalog.emptyTitle" />
          </h2>
          <p className="mt-1 text-body-xs text-muted-foreground">
            <TranslatedText namespace="learning" messageKey="catalog.emptyDescription" />
          </p>
        </div>
      )}

        <p className="mt-8 text-body-sm text-muted-foreground">
          <TranslatedText namespace="learning" messageKey="catalog.needMoreAccess" />{" "}
          <Link href="/plans" className="font-semibold text-primary underline-offset-4 hover:underline">
            <TranslatedText namespace="learning" messageKey="catalog.viewPlans" />
          </Link>
          {whatsappHref && (
            <>
              {" "}<TranslatedText namespace="learning" messageKey="catalog.or" />{" "}
              <a
                href={whatsappHref}
                target="_blank"
                rel="noopener noreferrer"
                className="font-semibold text-primary underline-offset-4 hover:underline"
              >
                <TranslatedText namespace="learning" messageKey="catalog.contactWhatsApp" />
              </a>
            </>
          )}
          .
        </p>
    </ApplicationPage>
  );
}
