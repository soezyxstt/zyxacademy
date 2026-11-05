import { AdminLoadingHeader, AiAnalyticsSkeleton } from "@/components/admin/content-loading-skeletons";

export default function AnalyticsLoading() {
  return <div className="space-y-5"><AdminLoadingHeader /><AiAnalyticsSkeleton /></div>;
}
