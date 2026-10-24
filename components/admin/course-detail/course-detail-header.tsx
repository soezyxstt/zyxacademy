"use client";

import Link from "next/link";
import { useTranslations } from "@/lib/i18n/client";
import { ExternalLink, GraduationCap } from "lucide-react";
import { AdminPageHeader, type BreadcrumbItem } from "@/components/admin/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

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
          <Button asChild size="sm" variant="outline" className="h-8 gap-1.5 rounded-lg text-body-sm">
            <Link href={`/courses/${course.id}`} target="_blank">
              <span>{t("courses.studentView")}</span>
              <ExternalLink className="size-3.5" />
            </Link>
          </Button>
        </div>
      }
    />
  );
}
