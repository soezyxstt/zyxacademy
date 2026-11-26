import { Skeleton } from "@/components/ui/skeleton";
import { TranslatedText } from "@/components/i18n/translated-text";

export default function TutorDocsLoading() {
  return (
    <div role="status" className="max-w-3xl space-y-(--section-gap)">
      <TranslatedText namespace="tutor.quizForm" messageKey="loading" className="sr-only" />
      <Skeleton className="h-9 w-full" />
      {[0, 1].map((section) => (
        <div key={section} className="space-y-1.5">
          <Skeleton className="h-5 w-44" />
          <div className="divide-y divide-border/55 border-t border-border/55">
            {[0, 1, 2].map((row) => (
              <div key={row} className="space-y-2 py-(--row-padding)">
                <Skeleton className="h-4 w-56 max-w-full" />
                <Skeleton className="h-3.5 w-3/4" />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
