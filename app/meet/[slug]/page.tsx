import Link from "next/link";
import { redirect } from "next/navigation";
import { and, eq, isNull } from "drizzle-orm";
import { Video } from "lucide-react";
import { db } from "@/db";
import { googleMeetSessions } from "@/db/schema";
import { Button } from "@/components/ui/button";

export default async function MeetSlugPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  const [session] = await db
    .select()
    .from(googleMeetSessions)
    .where(and(eq(googleMeetSessions.slug, slug), isNull(googleMeetSessions.deletedAt)))
    .limit(1);

  if (session?.meetingUri) {
    redirect(session.meetingUri);
  }

  return (
    <div className="flex min-h-[60vh] items-center justify-center px-4 py-16">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-8 text-center shadow-sm">
        <div className="mx-auto flex size-12 items-center justify-center rounded-xl bg-brand-primary/10 text-brand-primary">
          <Video className="size-6" aria-hidden />
        </div>
        <h1 className="mt-4 font-heading text-h5 font-semibold text-foreground">
          Link Meeting Tidak Ditemukan
        </h1>
        <p className="mt-2 text-body-sm text-muted-foreground">
          Link Zyx Meet yang Anda buka tidak tersedia atau sudah dihapus. Periksa kembali link yang
          dikirim, atau hubungi admin.
        </p>
        <Button asChild className="mt-6">
          <Link href="/">Kembali ke Beranda</Link>
        </Button>
      </div>
    </div>
  );
}
