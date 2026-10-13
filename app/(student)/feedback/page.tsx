import type { Metadata } from "next";
import { headers } from "next/headers";
import { MessageSquareHeart } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { ApplicationPage } from "@/components/application-page";
import { Reveal } from "@/components/ui/reveal";
import { createMetadata, pageTitle } from "@/lib/site";
import { auth } from "@/lib/auth";
import { FeedbackForm } from "./feedback-form";

export const metadata: Metadata = createMetadata({
  title: "Masukan Mahasiswa",
  description: "Sampaikan masukan, kendala materi, atau saran fitur untuk pembelajaran di Zyx Academy.",
  path: "/feedback",
});


export default async function FeedbackPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  const userEmail = session?.user?.email;

  return (
    <ApplicationPage>
      <PageHeader
        title="Masukan Mahasiswa"
        icon={MessageSquareHeart}
      />

      <Reveal className="mt-6 space-y-4">
        <p className="text-body-sm text-muted-foreground max-w-2xl leading-relaxed">
          Suara Anda sangat berharga bagi kami. Setiap kritik dan saran terkait materi TPB, kualitas kuis, bimbingan tutor, maupun antarmuka platform akan ditindaklanjuti secara berkala oleh tim akademik Zyx.
        </p>

        <div className="pt-2">
          <FeedbackForm initialEmail={userEmail} />
        </div>
      </Reveal>
    </ApplicationPage>
  );
}
