import Link from "next/link";
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
  const resolvedBreadcrumbs: BreadcrumbItem[] = breadcrumbs ?? [
    { label: "Mata Kuliah", href: "/admin/courses" },
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
          <Button asChild size="sm" variant="outline" className="h-8 gap-1.5 rounded-lg text-body-xs">
            <Link href={`/courses/${course.id}`} target="_blank">
              <span>Lihat sebagai siswa</span>
              <ExternalLink className="size-3.5" />
            </Link>
          </Button>
        </div>
      }
    />
  );
}
