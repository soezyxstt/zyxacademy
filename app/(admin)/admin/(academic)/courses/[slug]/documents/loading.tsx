import { CourseLoadingHeader } from "@/components/admin/course-detail/course-loading-header";
import { CourseMaterialListSkeleton } from "@/components/course/course-skeletons";

export default function DocumentsLoading() {
  return <div role="status" aria-label="Memuat" className="space-y-4"><CourseLoadingHeader /><CourseMaterialListSkeleton /></div>;
}
