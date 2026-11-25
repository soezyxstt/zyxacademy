"use client";

import Link from "next/link";
import { useTranslations } from "@/lib/i18n/client";
import { ExternalLink, GraduationCap } from "lucide-react";
import { AdminPageHeader, type BreadcrumbItem } from "@/components/admin/page-header";
import { AdminIconAction } from "@/components/admin/icon-action";

export type AdminCourseHeaderData = {
  id: string;
  title: string;
  category: string;
  description?: string | null;
};

type Props = {
  course: AdminCourseHeaderData;
  breadcrumbs?: BreadcrumbItem[];
};

export function CourseDetailHeader({ course, breadcrumbs }: Props) {
  const t = useTranslations("adminAcademic");
  const resolvedBreadcrumbs: BreadcrumbItem[] = breadcrumbs ?? [
    { label: t("courses.pageTitle"), href: "/admin/courses" },
    { label: course.title },
  ];

  return (
    <AdminPageHeader
      icon={GraduationCap}
      title={course.title}
      breadcrumbs={resolvedBreadcrumbs}
      className="mb-0 border-b border-border/60 pb-1"
      actions={
        <div className="flex min-w-0 flex-wrap items-center justify-end gap-x-2 gap-y-1 text-body-xs text-muted-foreground">
          <span className="wrap-anywhere font-mono">{course.id}</span>
          <span className="wrap-anywhere">{course.category}</span>
          <AdminIconAction asChild variant="ghost" label={t("courses.studentView")}>
            <Link href={`/courses/${course.id}`} target="_blank">
              <ExternalLink className="size-4" />
            </Link>
          </AdminIconAction>
        </div>
      }
    />
  );
}
