import { ApplicationPage } from "@/components/application-page";
import { Skeleton } from "@/components/ui/skeleton";

export default function StudentGroupsLoading() {
  return (
    <ApplicationPage role="status" aria-label="Memuat" spacing="space-y-4">
      <div className="divide-y divide-border/50 border-t border-border/50" aria-hidden="true">
        {[1, 2, 3, 4].map((item) => (
          <div key={item} className="flex items-center justify-between gap-3 py-3">
            <div className="min-w-0 flex-1 space-y-2">
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="h-3 w-2/5" />
            </div>
            <Skeleton className="h-7 w-16 shrink-0 rounded-md" />
          </div>
        ))}
      </div>
    </ApplicationPage>
  );
}
