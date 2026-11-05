import { Skeleton } from "@/components/ui/skeleton";

export function ProductCatalogSkeleton() {
  return (
    <div
      role="status"
      aria-label="Memuat"
      className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card"
    >
      {[0, 1, 2, 3].map((row) => (
        <div key={row} className="flex items-center gap-3 p-3">
          <div className="min-w-0 flex-1 space-y-2">
            <div className="flex gap-2">
              <Skeleton className="h-5 w-20" />
              <Skeleton className="h-5 w-16" />
            </div>
            <Skeleton className="h-5 w-48 max-w-full" />
            <Skeleton className="h-3 w-2/3" />
          </div>
          <Skeleton className="h-8 w-20 shrink-0" />
        </div>
      ))}
    </div>
  );
}

export function VoucherListSkeleton() {
  return (
    <div
      role="status"
      aria-label="Memuat"
      className="overflow-x-auto rounded-xl border border-border bg-card"
    >
      <div className="min-w-[700px] divide-y divide-border">
        {[0, 1, 2, 3, 4].map((row) => (
          <div key={row} className="grid grid-cols-6 gap-4 px-4 py-4">
            {[0, 1, 2, 3, 4, 5].map((cell) => (
              <Skeleton key={cell} className="h-4 w-full" />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

export function QuizPreviewSkeleton({ label }: { label: string }) {
  return (
    <div role="status" aria-label={label} className="divide-y divide-border">
      {[0, 1, 2].map((question) => (
        <div key={question} className="space-y-3 py-4 first:pt-0">
          <div className="flex justify-between gap-2">
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-5 w-20" />
          </div>
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-3/4" />
          <div className="space-y-2 pl-3">
            {[0, 1, 2, 3].map((option) => (
              <Skeleton key={option} className="h-4 w-2/3" />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export function ReviewDetailSkeleton({ label }: { label: string }) {
  return (
    <div
      role="status"
      aria-label={label}
      className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]"
    >
      <div className="divide-y divide-border rounded-xl border border-border bg-card">
        {[0, 1, 2, 3].map((row) => (
          <div key={row} className="space-y-2 p-4">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-3 w-1/2" />
          </div>
        ))}
      </div>
      <div className="space-y-4 rounded-xl border border-border bg-card p-4">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-4/5" />
        <Skeleton className="h-40 w-full" />
      </div>
    </div>
  );
}

export function ZyraOpsSkeleton() {
  return (
    <div
      role="status"
      aria-label="Memuat Zyra ops"
      className="space-y-4 border-y border-border py-6"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-2">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-4 w-64 max-w-full" />
        </div>
        <Skeleton className="h-9 w-24" />
      </div>
      <div className="grid grid-cols-1 gap-px overflow-hidden rounded-lg border border-border bg-border sm:grid-cols-2 lg:grid-cols-4">
        {[0, 1, 2, 3].map((item) => (
          <div
            key={item}
            className="flex min-h-14 items-center justify-between gap-3 bg-card px-4 py-3"
          >
            <Skeleton className="h-4 w-24 max-w-full" />
            <Skeleton className="h-6 w-12 shrink-0" />
          </div>
        ))}
      </div>
      <div className="flex flex-wrap gap-4">
        <Skeleton className="h-4 w-48" />
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-4 w-36" />
      </div>
      <div className="space-y-2">
        <Skeleton className="h-4 w-48" />
        <Skeleton className="h-3 w-64 max-w-full" />
        <Skeleton className="h-16 w-full" />
      </div>
      <div className="space-y-2">
        <Skeleton className="h-4 w-20" />
        <Skeleton className="h-4 w-36" />
      </div>
    </div>
  );
}

export function ParticipantPickerSkeleton({ label }: { label: string }) {
  return (
    <div role="status" aria-label={label} className="divide-y divide-border">
      {[0, 1, 2].map((row) => (
        <div key={row} className="flex gap-3 p-3">
          <Skeleton className="size-4 shrink-0" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-36" />
            <Skeleton className="h-3 w-48 max-w-full" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function LeaderboardRowsSkeleton({
  label,
  announce = true,
}: {
  label: string;
  announce?: boolean;
}) {
  return (
    <div
      role={announce ? "status" : undefined}
      aria-label={announce ? label : undefined}
      className="divide-y divide-border"
    >
      {[0, 1, 2, 3, 4].map((row) => (
        <div key={row} className="flex items-center gap-4 px-4 py-4">
          <Skeleton className="h-4 w-8 shrink-0" />
          <Skeleton className="h-4 min-w-0 flex-1" />
          <Skeleton className="h-4 w-16 shrink-0" />
          <Skeleton className="hidden h-4 w-16 shrink-0 sm:block" />
        </div>
      ))}
    </div>
  );
}

export function ZyraUsageSkeleton() {
  return (
    <div
      role="status"
      aria-label="Memuat data penggunaan Zyra"
      className="space-y-6"
    >
      <div className="space-y-4">
        <Skeleton className="h-4 w-48" />
        <Skeleton className="h-72 w-full" />
      </div>
      <div className="space-y-4">
        <Skeleton className="h-5 w-40" />
        <div className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
          {[0, 1, 2].map((row) => (
            <div key={row} className="flex gap-4 p-4">
              <Skeleton className="h-4 min-w-0 flex-1" />
              <Skeleton className="h-4 w-16" />
              <Skeleton className="h-4 w-16" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function FormListSkeleton() {
  return (
    <div
      role="status"
      aria-label="Memuat"
      className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card"
    >
      {[0, 1, 2].map((row) => (
        <div key={row} className="space-y-4 p-4">
          <div className="flex justify-between gap-3">
            <div className="flex-1 space-y-2">
              <Skeleton className="h-5 w-48 max-w-full" />
              <Skeleton className="h-3 w-32" />
            </div>
            <Skeleton className="h-5 w-20 shrink-0" />
          </div>
          <div className="grid gap-3 border-t border-border pt-4 sm:grid-cols-2">
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-9 w-full" />
          </div>
          <div className="flex flex-wrap justify-end gap-2 border-t border-border pt-4">
            <Skeleton className="h-9 w-28" />
            <Skeleton className="h-9 w-40" />
            <Skeleton className="size-9" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function QuestionPickerSkeleton({ label }: { label: string }) {
  return (
    <div role="status" aria-label={label} className="space-y-2.5">
      {[0, 1, 2].map((row) => (
        <div
          key={row}
          className="flex gap-3 rounded-xl border border-border bg-card p-3"
        >
          <Skeleton className="size-4 shrink-0" />
          <div className="min-w-0 flex-1 space-y-2">
            <div className="flex gap-2">
              <Skeleton className="h-5 w-20" />
              <Skeleton className="h-5 w-16" />
            </div>
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function AdminLoadingHeader({ back = false }: { back?: boolean }) {
  return (
    <div className={back ? "space-y-3" : "hidden md:block"}>
      {back && <Skeleton className="h-4 w-32" />}
      <div className="flex items-center gap-3">
        <Skeleton className="size-8 shrink-0" />
        <Skeleton className="h-7 w-48 max-w-full" />
      </div>
    </div>
  );
}

export function OpsMetricsSkeleton() {
  return (
    <div role="status" aria-label="Memuat" className="space-y-5">
      <div className="flex justify-end">
        <Skeleton className="h-9 w-24" />
      </div>
      <div className="divide-y divide-border rounded-xl border border-border bg-card px-4 sm:px-5">
        {[0, 1, 2, 3, 4, 5].map((row) => (
          <div key={row} className="space-y-3 py-4">
            <div className="flex justify-between gap-3">
              <Skeleton className="h-5 w-40" />
              <Skeleton className="h-4 w-20" />
            </div>
            <div className="flex flex-wrap gap-6">
              {[0, 1, 2].map((stat) => (
                <div key={stat} className="space-y-2">
                  <Skeleton className="h-3 w-20" />
                  <Skeleton className="h-5 w-14" />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function FlagsSkeleton() {
  return (
    <div role="status" aria-label="Memuat" className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card p-4">
        <div className="space-y-2">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-3 w-28" />
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-9 w-32" />
          <Skeleton className="h-9 w-24" />
        </div>
      </div>
      <div className="grid grid-cols-1 gap-px overflow-hidden rounded-lg border border-border bg-border sm:grid-cols-2 lg:grid-cols-4">
        {[0, 1, 2, 3].map((item) => (
          <div
            key={item}
            className="flex min-h-14 items-center justify-between gap-3 bg-card px-4 py-3"
          >
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-6 w-12" />
          </div>
        ))}
      </div>
      <div className="flex flex-wrap gap-2">
        <Skeleton className="h-9 min-w-[140px] flex-1" />
        <Skeleton className="h-9 w-32" />
      </div>
      <div className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
        {[0, 1, 2, 3, 4].map((row) => (
          <div key={row} className="flex items-center gap-3 p-4">
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-48 max-w-full" />
              <Skeleton className="h-3 w-2/3" />
            </div>
            <Skeleton className="h-6 w-12" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function AiAnalyticsSkeleton({ label = "Memuat" }: { label?: string }) {
  return (
    <div role="status" aria-label={label} className="space-y-5">
      <div className="flex justify-between gap-3">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-8 w-24" />
      </div>
      <div className="grid grid-cols-1 gap-px overflow-hidden rounded-lg border border-border bg-border sm:grid-cols-2 lg:grid-cols-4">
        {[0, 1, 2, 3].map((item) => (
          <div
            key={item}
            className="flex min-h-14 items-center justify-between gap-3 bg-card px-4 py-3"
          >
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-6 w-16" />
          </div>
        ))}
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        {[0, 1].map((item) => (
          <div
            key={item}
            className="space-y-3 rounded-xl border border-border bg-card p-4"
          >
            <Skeleton className="h-5 w-40" />
            {[0, 1, 2].map((row) => (
              <Skeleton key={row} className="h-4 w-full" />
            ))}
          </div>
        ))}
      </div>
      <Skeleton className="h-48 w-full rounded-xl" />
    </div>
  );
}

export function KeysSkeleton() {
  return (
    <div role="status" aria-label="Memuat" className="max-w-5xl space-y-6">
      <div className="flex justify-between gap-3">
        <Skeleton className="h-4 w-48" />
        <Skeleton className="h-9 w-24" />
      </div>
      {[0, 1].map((group) => (
        <div
          key={group}
          className="overflow-hidden rounded-xl border border-border bg-card"
        >
          <div className="flex justify-between border-b border-border bg-muted/50 px-5 py-3">
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-4 w-24" />
          </div>
          <div className="divide-y divide-border">
            {[0, 1, 2].map((row) => (
              <div key={row} className="flex gap-4 px-5 py-3">
                <Skeleton className="h-4 min-w-0 flex-1" />
                <Skeleton className="h-4 w-16" />
                <Skeleton className="h-4 w-16" />
                <Skeleton className="hidden h-4 w-20 sm:block" />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export function FormDetailSkeleton({
  showHeader = true,
}: {
  showHeader?: boolean;
}) {
  return (
    <div role="status" aria-label="Memuat" className="space-y-4">
      {showHeader && <AdminLoadingHeader back />}
      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border p-5">
          <Skeleton className="h-5 w-36" />
          <div className="flex flex-wrap gap-2">
            <Skeleton className="h-9 w-40" />
            <Skeleton className="h-9 w-32" />
          </div>
        </div>
        <div className="space-y-4 p-5">
          <Skeleton className="h-10 w-96 max-w-full" />
          <div className="space-y-2">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-4 w-1/2" />
          </div>
        </div>
      </div>
    </div>
  );
}

export function MeetDetailSkeleton({
  showHeader = true,
}: {
  showHeader?: boolean;
}) {
  return (
    <div role="status" aria-label="Memuat" className="space-y-6">
      {showHeader && <AdminLoadingHeader back />}
      <div className="grid grid-cols-1 gap-px overflow-hidden rounded-lg border border-border bg-border sm:grid-cols-2 lg:grid-cols-5">
        {[0, 1, 2, 3, 4].map((item) => (
          <div
            key={item}
            className="flex min-h-14 items-center justify-between gap-3 bg-card px-4 py-3"
          >
            <Skeleton className="h-4 w-24 max-w-full" />
            <Skeleton className="h-6 w-16 shrink-0" />
          </div>
        ))}
      </div>
      {[0, 1, 2].map((section) => (
        <div key={section} className="space-y-4">
          <Skeleton className="h-5 w-40" />
          <div className="space-y-3 rounded-xl border border-border bg-card p-4">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-4 w-1/2" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function MeetPageSkeleton() {
  return (
    <div role="status" aria-label="Memuat" className="space-y-6">
      <AdminLoadingHeader />
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-4 rounded-xl border border-border bg-card p-4">
          <Skeleton className="h-5 w-40" />
          {[0, 1, 2].map((field) => (
            <div key={field} className="space-y-2">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-9 w-full" />
            </div>
          ))}
          <Skeleton className="h-9 w-full" />
        </div>
        <div className="space-y-4 rounded-xl border border-border bg-card p-4">
          <div className="flex justify-between gap-3">
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-5 w-20" />
          </div>
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-4 w-1/2" />
        </div>
      </div>
      <div className="flex justify-between gap-3">
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-9 w-24" />
      </div>
      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <LeaderboardRowsSkeleton label="Memuat riwayat" announce={false} />
      </div>
    </div>
  );
}

export function ShortLinksSkeleton() {
  return (
    <div role="status" aria-label="Memuat" className="space-y-6">
      <AdminLoadingHeader />
      <div className="grid items-start gap-4 lg:grid-cols-3">
        <div className="space-y-4 rounded-xl border border-border bg-card p-4">
          <Skeleton className="h-5 w-40" />
          {[0, 1, 2].map((field) => (
            <div key={field} className="space-y-2">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-9 w-full" />
            </div>
          ))}
          <Skeleton className="h-9 w-full" />
        </div>
        <div className="divide-y divide-border rounded-xl border border-border bg-card lg:col-span-2">
          {[0, 1, 2, 3].map((row) => (
            <div key={row} className="flex items-center gap-3 p-4">
              <div className="min-w-0 flex-1 space-y-2">
                <Skeleton className="h-4 w-40 max-w-full" />
                <Skeleton className="h-3 w-3/4" />
                <Skeleton className="h-3 w-24" />
              </div>
              <Skeleton className="h-8 w-16" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function MediaItemsSkeleton({
  view = "grid",
}: {
  view?: "grid" | "list";
}) {
  return (
    <div role="status" aria-label="Memuat">
      {view === "grid" ? (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(160px,1fr))] gap-3">
          {[0, 1, 2, 3, 4, 5].map((item) => (
            <div
              key={item}
              className="space-y-2 rounded-xl border border-border bg-card p-2"
            >
              <Skeleton className="aspect-photo-card w-full rounded-lg" />
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-3 w-1/2" />
            </div>
          ))}
        </div>
      ) : (
        <div className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
          {[0, 1, 2, 3, 4].map((row) => (
            <div key={row} className="flex items-center gap-3 p-3">
              <Skeleton className="size-4 shrink-0" />
              <Skeleton className="size-10 shrink-0" />
              <Skeleton className="h-4 min-w-0 flex-1" />
              <Skeleton className="hidden h-4 w-20 sm:block" />
              <Skeleton className="size-8 shrink-0" />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function PublicLinksSkeleton() {
  return (
    <div
      role="status"
      aria-label="Memuat"
      className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card"
    >
      {[0, 1, 2, 3].map((row) => (
        <div key={row} className="space-y-3 p-3">
          <div className="flex items-start gap-3">
            <Skeleton className="size-10 shrink-0" />
            <div className="min-w-0 flex-1 space-y-2">
              <Skeleton className="h-4 w-40 max-w-full" />
              <Skeleton className="h-3 w-2/3" />
            </div>
            <Skeleton className="h-5 w-16 shrink-0" />
          </div>
          <div className="flex justify-end gap-2">
            <Skeleton className="size-8" />
            <Skeleton className="size-8" />
            <Skeleton className="size-8" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function DocumentTextSkeleton() {
  return (
    <div role="status" aria-label="Memuat" className="space-y-4">
      <div className="flex justify-between gap-3">
        <Skeleton className="h-4 w-36" />
        <Skeleton className="h-8 w-28" />
      </div>
      <div className="space-y-3 rounded-lg border border-border p-4">
        {[0, 1, 2, 3].map((paragraph) => (
          <div key={paragraph} className="space-y-2">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
          </div>
        ))}
      </div>
    </div>
  );
}
