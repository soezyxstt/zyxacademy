import { AdminLoadingHeader, KeysSkeleton } from "@/components/admin/content-loading-skeletons";

export default function KeysLoading() {
  return <div className="space-y-5"><AdminLoadingHeader /><KeysSkeleton /></div>;
}
