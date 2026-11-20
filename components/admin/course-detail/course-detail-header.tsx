"use client";

import Link from "next/link";
import { useTranslations } from "@/lib/i18n/client";
import { ExternalLink, GraduationCap } from "lucide-react";
import { AdminPageHeader, type BreadcrumbItem } from "@/components/admin/page-header";
import { Badge } from "@/components/ui/badge";
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
      actions={
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline" className="rounded-md font-mono text-body-xs">
            {course.id}
          </Badge>
          <Badge variant="secondary" className="rounded-md text-body-xs">
            {course.category}
          </Badge>
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
