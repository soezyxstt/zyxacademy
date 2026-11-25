import { Skeleton } from "@/components/ui/skeleton";
import { TranslatedText } from "@/components/i18n/translated-text";

export default function TutorDocLoading() {
  return (
    <div role="status" className="max-w-3xl space-y-(--reading-section-gap)">
      <TranslatedText namespace="tutor.quizForm" messageKey="loading" className="sr-only" />
      <div className="space-y-3">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-7 w-80 max-w-full" />
      </div>
      <Skeleton className="h-4 w-4/5" />
      {[0, 1].map((section) => (
        <div key={section} className="space-y-3">
          <Skeleton className="h-5 w-48" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-3/4" />
        </div>
      ))}
    </div>
  );
}
