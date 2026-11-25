import { CourseLoadingHeader } from "@/components/admin/course-detail/course-loading-header";
import { CourseVideoListSkeleton } from "@/components/course/course-skeletons";

export default function VideosLoading() {
  return <div role="status" aria-label="Memuat" className="min-w-0 space-y-(--compact-gap)"><CourseLoadingHeader /><CourseVideoListSkeleton /></div>;
}
