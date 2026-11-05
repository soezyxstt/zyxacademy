import { AdminLoadingHeader, OpsMetricsSkeleton, ZyraOpsSkeleton } from "@/components/admin/content-loading-skeletons";

export default function OpsLoading() {
  return <div className="space-y-5"><AdminLoadingHeader /><OpsMetricsSkeleton /><ZyraOpsSkeleton /></div>;
}
