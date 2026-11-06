import { AdminLoadingHeader } from "@/components/admin/content-loading-skeletons";
import { FormsBuilderSkeleton } from "./loading-skeleton";

export default function FormsLoading() {
  return <div className="space-y-5"><AdminLoadingHeader /><FormsBuilderSkeleton /></div>;
}
