import { AdminLoadingHeader, FlagsSkeleton } from "@/components/admin/content-loading-skeletons";

export default function FlagsLoading() {
  return <div className="space-y-8"><AdminLoadingHeader /><FlagsSkeleton /></div>;
}
